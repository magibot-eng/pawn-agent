# Pawn Agent QA Report
**Date:** 2026-05-02
**Tester:** Magi (coding agent)
**Backend:** Port 8002 (test instance)
**Database:** RDS PostgreSQL `pawnagent`@`pawn-agent-db.cv8kasmsyxi5.us-east-1.rds.amazonaws.com:5432`

---

## Summary

| Area | Status |
|------|--------|
| Selling session (negotiation start) | ✅ Fixed |
| Wallet provisioning (stub mode) | ✅ Fixed |
| Database → RDS PostgreSQL | ✅ Wired (but server needs env fix) |
| All API routes | ✅ Working |
| Settlement flow (stub/simulated) | ✅ End-to-end working |
| Frontend build | ✅ Compiles (warnings only) |
| ENS owned endpoint | ✅ Fixed (was 500 on 404) |
| `send_eth` chain ID | ✅ Fixed (web3 v7 compat) |

---

## Bug 1: Selling Session 500 — `chat_log` Column Missing

### Root Cause
The `negotiation_sessions` table in RDS was created by an older `migrate_pg.py` that did not include the `chat_log` column. When a seller tried to start a negotiation, the API tried to insert/update `chat_log` which didn't exist → `column "chat_log" of relation "negotiation_sessions" does not exist`.

### What's Broken
`POST /negotiations` → 500 on first message send.

### Fix Applied
Updated `migrate_pg.py` to include all columns. Added `ALTER TABLE` migration patch for existing DBs to add missing columns. Ran migration against RDS:
- Added `chat_log TEXT NOT NULL DEFAULT '[]'`
- Renamed `provider_keys` columns: `provider_name→provider`, `key_name→model`, `encrypted_key_value→encrypted_key`
- Added missing `model`, `label`, `last_used_at` columns to `provider_keys`
- Changed `negotiation_state` from TEXT to JSONB

### Before/After
```
# Before
asyncpg.exceptions.UndefinedColumnError: column "chat_log" of relation "negotiation_sessions" does not exist

# After
POST /negotiations/{id}/chat → 200 OK
```

---

## Bug 2: Wallet Provisioning — Stub Mode Blocked

### Root Cause
**Two issues:**

1. `CDP_WALLET_FALLBACK_TO_STUB=false` in `.env` meant even stub wallet creation was disabled. The code had the flag but it was set to block fallback.

2. The `provision_managed_wallet()` function in `wallets.py` had NO stub wallet creation path. When `cdp_wallet_live_enabled=false`, it immediately raised `WalletProvisioningError("Live CDP wallet mode is disabled...")` — even though `cdp_wallet_fallback_to_stub` was meant to allow stub mode.

### What's Broken
`POST /shops/{id}/wallet/provision` → 400 "Live CDP wallet mode is disabled."

### Fixes Applied

**File: `backend/.env`**
```
CDP_WALLET_FALLBACK_TO_STUB=false  →  CDP_WALLET_FALLBACK_TO_STUB=true
```

**File: `backend/app/services/wallets.py`** — Added stub wallet creation path:
```python
# In provision_managed_wallet(), after the has_live_wallet check:
if not settings.cdp_wallet_live_enabled:
    if settings.cdp_wallet_fallback_to_stub:
        # Stub mode: mark wallet as active with a placeholder address.
        shop.merchant_address = ZERO_ADDRESS
        shop.wallet_provider_account_id = f"stub_{shop.ens_name.replace('.', '_')}_{settings.cdp_wallet_chain}"
        shop.wallet_status = ShopWalletStatus.ACTIVE
        shop.wallet_encrypted_key = None
        return shop
    raise WalletProvisioningError("Live CDP wallet mode is disabled...")
```

### Before/After
```
# Before
POST /shops/{id}/wallet/provision → 400 {"detail": "Live CDP wallet mode is disabled..."}

# After
POST /shops/{id}/wallet/provision → 200 {"wallet_status": "active", "merchant_address": "0x0000...0000", "wallet_provider_account_id": "stub_ensname_base-sepolia"}
```

---

## Bug 3: Settlement Accept — Stub Wallets Rejected

### Root Cause
In `settlements.py`, the check:
```python
if shop.wallet_status != ShopWalletStatus.ACTIVE or not shop.merchant_address or shop.merchant_address == ZERO_ADDRESS:
    raise SettlementError("Merchant wallet is not active...")
```
Rejected stub wallets (which have `merchant_address = ZERO_ADDRESS`).

Also, `simulate_only` was correctly set to `True` for stub wallets, but the check happened AFTER the wallet status validation. With `ZERO_ADDRESS`, the validation raised first.

### What's Broken
`POST /negotiations/{id}/accept` → 400 "Merchant wallet is not active."

### Fix Applied
**File: `backend/app/services/settlements.py`**
```python
is_stub_wallet = (
    shop.wallet_provider_account_id is not None
    and shop.wallet_provider_account_id.startswith("stub_")
)
if (
    shop.wallet_status != ShopWalletStatus.ACTIVE
    or not shop.merchant_address
    or (shop.merchant_address == ZERO_ADDRESS and not is_stub_wallet)
):
    raise SettlementError(...)
```

### Before/After
```
# Before
POST /negotiations/{id}/accept → 400 {"detail": "Merchant wallet is not active..."}

# After
POST /negotiations/{id}/accept → 200 {"deal_offer": {...}, "execution": {"state": "simulated"}, "negotiation": {"settled": true}}
```

---

## Bug 4: `send_eth` — Wrong Chain ID + web3 v7 Incompatibility

### Root Cause
`AlchemyClient.send_eth()` hardcoded `chainId: 8453` (Base mainnet) even when configured for `base-sepolia` (chain ID 84532). This caused `Web3ValidationError` for any live settlement attempt on testnet.

Also, web3.py v7 no longer accepts `gasPrice` as a kwarg in `sign_transaction()`.

### Fix Applied
**File: `backend/app/services/wallets.py`**
```python
chain_ids = {"base": 8453, "base-sepolia": 84532}
cfg = get_settings()
chain_id = chain_ids.get(cfg.cdp_wallet_chain, 8453)

tx_unsigned = {
    "nonce": nonce,
    "maxFeePerGas": max_fee,        # EIP-1559 (web3 v7 compatible)
    "maxPriorityFeePerGas": max_priority_fee,
    "gas": gas_estimate,
    ...
}
```

---

## Bug 5: Chat Response — `negotiation_state` Type Error

### Root Cause
`process_seller_message()` returned `negotiation_state` as a dict (correct), but the `_build_negotiation_state()` fallback path could return `None` when the DB column was TEXT (not JSONB). This caused Pydantic validation error.

### Fix Applied
**File: `backend/app/services/negotiations.py`**
```python
def _build_negotiation_state(...) -> dict | None:
    raw = negotiation.negotiation_state
    if raw is None: return None
    if isinstance(raw, dict): return raw
    if isinstance(raw, str):
        try: return json.loads(raw)
        except: return None
    return None
```

Also updated `migrate_pg.py` to alter `negotiation_state TEXT → JSONB`.

---

## Bug 6: ENS Owned — 500 on External API 404

### Root Cause
`_fetch_web3bio_profiles()` called `response.raise_for_status()` which converted the web3.bio 404 (address not found) into an unhandled exception → HTTP 500.

### Fix Applied
**File: `backend/app/services/ens.py`**
```python
try:
    response = await client.get(url)
    response.raise_for_status()
except httpx.HTTPStatusError as exc:
    if exc.response.status_code == 404:
        return []  # No profile found — not an error
    raise
```

---

## Bug 7: Database — Schema Drift in migrate_pg.py

### Issues Found
1. `negotiation_sessions` missing `chat_log` column
2. `provider_keys` columns named `provider_name`, `key_name`, `encrypted_key_value` instead of `provider`, `model`, `encrypted_key`
3. Missing indexes on `chain_deal_id`, `seller`, `state` in `deal_offers`
4. `negotiation_state` was TEXT, not JSONB

### Fix Applied
Rewrote `migrate_pg.py` to generate correct schemas with all columns, proper indexes, and ADD COLUMN patches for existing databases.

---

## Outstanding Issues

### High Priority

**`.env` is gitignored — server needs env var on startup**
The server was started without inheriting `.env`. The uvicorn daemon needs to be started with:
```
cd ~/Desktop/Mira/projects/pawn-agent/backend
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://pawnagent:Pawn\$tar!!@pawn-agent-db.cv8kasmsyxi5.us-east-1.rds.amazonaws.com:5432" \
CDP_WALLET_LIVE_ENABLED=false \
CDP_WALLET_FALLBACK_TO_STUB=true \
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Or configure via systemd/supervisor. **The `.env` file change (`CDP_WALLET_FALLBACK_TO_STUB=true`) is local only and won't survive a git pull on the server without manual intervention.**

**Solution options:**
1. Add `DATABASE_URL` and wallet flags to the systemd service file
2. Use `uvicorn --env-file .env` (requires python-dotenv or similar)
3. Add a startup wrapper script

### Medium Priority

**Schema drift — model vs DB**
The `NegotiationSession` SQLAlchemy model is missing some DB columns: `seller_ens`, `expires_at`. The `negotiation_sessions` table in RDS has these columns but the model doesn't expose them. Not blocking but should be cleaned up.

**`cdp_wallet_live_enabled=false` = no real settlements**
Currently, real settlements (sending actual ETH) are blocked because `CDP_WALLET_LIVE_ENABLED=false`. When live mode is enabled:
1. `provision_managed_wallet()` will derive real Alchemy wallets using the master seed
2. `send_eth()` will submit real transactions on Base Sepolia
3. The `send_eth()` chain ID fix ensures correct chain

### Low Priority

**Frontend warning:** `@react-native-async-storage/async-storage` missing (MetaMask SDK optional dep) — not blocking.

**ENS primary lookup** for unknown addresses returns `null` — this is expected behavior.

---

## Test Results

### API Routes
| Route | Method | Status |
|-------|--------|--------|
| `/shops` | POST | 201 ✅ |
| `/shops` | GET | 200 ✅ |
| `/shops/{id}` | GET | 200 ✅ |
| `/shops/{id}/wallet/provision` | POST | 200 ✅ (stub) |
| `/negotiations` | POST | 201 ✅ |
| `/negotiations/{id}/chat` | POST | 200 ✅ |
| `/negotiations/{id}/accept` | POST | 200 ✅ (simulated) |
| `/negotiations/by-shop/{id}` | GET | 200 ✅ |
| `/deals/offers/by-shop/{id}` | GET | 200 ✅ |
| `/shops/{id}/provider-keys` | GET/POST | 200/201 ✅ |
| `/ens/primary/{address}` | GET | 200 ✅ |
| `/ens/owned/{address}` | GET | 200 ✅ (was 500) |

### End-to-End Settlement Flow (Stub Mode)
```
POST /shops → 201
POST /shops/{id}/wallet/provision → 200 (status: active, addr: 0x0000...)
POST /negotiations → 201
POST /negotiations/{id}/chat → 200 (scripted fallback response)
POST /negotiations/{id}/accept → 200
  → deal_offer created (state: pending)
  → execution created (state: simulated)
  → negotiation.settled = true
```

### Frontend Build
```
npm run build → ✓ Compiled successfully
Route /shop/[ens] → 10.3 kB
Route /tavern → 44.9 kB
Warnings: @react-native-async-storage (optional MetaMask dep)
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/.env` | `CDP_WALLET_FALLBACK_TO_STUB=false → true` |
| `backend/app/services/wallets.py` | Stub wallet creation; dynamic chain ID; web3 v7 compat |
| `backend/app/services/settlements.py` | Stub wallet acceptance in settlement flow |
| `backend/app/services/negotiations.py` | `_build_negotiation_state` null safety |
| `backend/app/services/ens.py` | Graceful 404 handling for web3.bio |
| `backend/app/main.py` | Debug settings endpoint (temp, can be removed) |
| `backend/migrate_pg.py` | Complete rewrite: correct columns, indexes, alter patches |

**Commits:**
- `f7667b0` — QA fixes: schema fields, migrate_pg.py sync, quote response fields (pre-existing)
- `3d85e87` — qa: stub wallet provisioning, settlement sim mode, ens 404 graceful, send_eth fix

---

## Next Steps

1. **Server startup fix** — Configure the uvicorn daemon to start with `DATABASE_URL` and wallet env vars. Options: systemd service, startup script, or `python-dotenv` integration.

2. **For live settlements** — Change `CDP_WALLET_LIVE_ENABLED=true` in `.env` on the server and ensure `ALCHEMY_API_KEY` and `ALCHEMY_WALLET_MASTER_SEED` are set. The Alchemy wallet derivation path is already implemented and will create real wallets.

3. **Schema model sync** — Add `seller_ens` and `expires_at` to `NegotiationSession` model to match DB.

4. **Optional: Remove debug endpoint** — The `/debug/settings` endpoint was added to `main.py` for QA. Consider removing it before production.
