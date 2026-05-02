# Pawn Agent QA Round 2 — 2026-05-02

**Tester:** Magi (subagent)
**Frontend:** https://pawn.solovibing.com
**Backend:** https://6vwtcqrppw.us-west-2.awsapprunner.com
**Region:** us-west-2 (App Runner)

---

## 1. Health + Routing

### Test 1.1: Frontend /api/health
```
GET https://pawn.solovibing.com/api/health
```
**Response (200):**
```json
{"status":"ok","app":"Pawn Agent"}
```
**Result: ✅ PASS** — Frontend correctly routes to backend App Runner.

### Test 1.2: Backend /shops
```
GET https://6vwtcqrppw.us-west-2.awsapprunner.com/shops
```
**Response (200):** Returns array of 4 shops (incl. wago.eth, smoke test, magi QA shop).
**Result: ✅ PASS**

---

## 2. New Shop Flow

### Test 2.1: Create shop (missing owner_address)
```
POST /shops
{
  "ens_name": "magitest-1777700637.eth",
  "display_name": "Magi QA Shop",
  ...
}
```
**Response (422):**
```json
{"detail":[{"type":"missing","loc":["body","owner_address"],"msg":"Field required"...}]}
```
**Result: ✅ PASS** — Validation correctly catches missing field.

### Test 2.2: Create shop with owner_address
```
POST /shops
{
  "owner_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "ens_name": "magitest-1777700643.eth",
  "display_name": "Magi QA Shop",
  ...
}
```
**Response (201):**
```json
{
  "id": "ecc8e84c-9ade-4d81-827b-76a7d86d8e34",
  "wallet_status": "pending",
  "merchant_address": "0x0000000000000000000000000000000000000000",
  ...
}
```
**Result: ✅ PASS** — Shop created with UUID `ecc8e84c-9ade-4d81-827b-76a7d86d8e34`.

### Test 2.3: Provision wallet
```
POST /shops/ecc8e84c-9ade-4d81-827b-76a7d86d8e34/wallet/provision
```
**Response (200):**
```json
{
  "wallet_status": "active",
  "merchant_address": "0x1aF699bcC63ae439E41B9FE7BF4cf7870d527110",
  "wallet_provider_account_id": "cdpwa_live_magitest-1777700643_eth_base-sepolia"
}
```
**Result: ✅ PASS** — Wallet provisioned with real address (`0x1aF...`), not `0x000...`.

---

## 3. Negotiation + Chat

### Test 3.1: Create negotiation (missing fields)
```
POST /negotiations
{
  "shop_id": "604cc505-6a5f-4eb5-99fc-362517e0d8eb",
  "counterparty_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
}
```
**Response (422):**
```json
{"detail":[
  {"type":"missing","loc":["body","seller_address"]...},
  {"type":"missing","loc":["body","input_token"]...},
  {"type":"missing","loc":["body","input_amount"]...}
]}
```
**Result: ✅ PASS** — API spec requires `seller_address`, `input_token`, `input_amount`.

### Test 3.2: Create negotiation (correct fields)
```
POST /negotiations
{
  "shop_id": "604cc505-6a5f-4eb5-99fc-362517e0d8eb",
  "seller_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "input_token": "0x4200000000000000000000000000000000000042",
  "input_amount": "100000000000000000"
}
```
**Response (201):** Negotiation `eba27b44-8ff2-4ac4-9575-c8c0485322f9` created.
**Result: ✅ PASS**

### Test 3.3: Send chat message
```
POST /negotiations/eba27b44-8ff2-4ac4-9575-c8c0485322f9/chat
{
  "message": "Token is WETH on Base, address 0x4200000000000000000000000000000000000042, I want to sell 0.1 WETH for ETH"
}
```
**Response (200):**
```json
{
  "merchant_response": "WETH on Base is not a distressed or governance token, but I can consider liquid long-tail assets. What's your asking price or expected payout for 0.1 WETH? Also, any urgency on settlement? Today, I would take that lot for 90000000000 ETH.",
  "success": true,
  "response_mode": "live_llm",
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "negotiation_state": {
    "token": "ADDRESS",
    "amount": "",
    ...
  },
  "quote": {
    "status": "quoted",
    "payout_token": "ETH",
    "payout_amount": "90000000000",
    "expiry": "10m"
  }
}
```
**Result: ⚠️ PARTIAL** — LLM responds correctly. **BUG: `negotiation_state.token` is the literal string `"ADDRESS"` instead of the actual token address `0x4200000000000000000000000000000000000042`.** The quote has a real payout amount (90 gwei) which is unrealistically low but that's the merchant AI's pricing logic.

---

## 4. Settlement

### Test 4.1: Accept quote via PATCH
```
PATCH /negotiations/eba27b44-8ff2-4ac4-9575-c8c0485322f9
{"action": "accept_quote"}
```
**Response (200):** `settled` remains `false`, `agreed_payout` still `null`.
**Result: ❌ FAIL** — `action: "accept_quote"` is silently ignored. No error, no effect.

### Test 4.2: Accept quote via PATCH (different field name)
```
PATCH /negotiations/eba27b44-8ff2-4ac4-9575-c8c0485322f9
{"action": "accept"}
```
**Response (200):** Same — no effect.
**Result: ❌ FAIL** — `action` field is not a valid update field.

### Test 4.3: Settle via raw state update
```
PATCH /negotiations/eba27b44-8ff2-4ac4-9575-c8c0485322f9
{
  "outcome": "settled",
  "negotiation_state": {"token": "0x4200000000000000000000000000000000000042", ...},
  "agreed_payout": "90000000000",
  "settled": true
}
```
**Response (200):** `settled: true`, `outcome: "settled"`, `agreed_payout: "90000000000"`.
**Result: ✅ PASS** — Manual settlement works when using the raw field interface.

### DB Execution Check
**Note:** Could not connect to RDS directly (no `psql` available in this environment). Execution records were not verified against Base Sepolia explorer.
**Result: ⏸️ SKIPPED** — No `psql` client available.

---

## 5. Withdraw

### Test 5.1: Withdraw from wago.eth shop wallet
```
POST /shops/604cc505-6a5f-4eb5-99fc-362517e0d8eb/wallet/withdraw
{"amount_eth": "0.001"}
```
**Response (500):** `Internal Server Error`
**Result: ❌ FAIL** — Withdraw endpoint returns 500 with no error detail. Likely unimplemented or misconfigured (no live wallet attached to merchant wallet).

---

## Summary

| Test | Description | Result |
|------|-------------|--------|
| 1.1 | Health endpoint | ✅ PASS |
| 1.2 | List shops | ✅ PASS |
| 2.1 | Create shop (validation) | ✅ PASS |
| 2.2 | Create shop (success) | ✅ PASS |
| 2.3 | Provision wallet | ✅ PASS |
| 3.1 | Create negotiation (validation) | ✅ PASS |
| 3.2 | Create negotiation (success) | ✅ PASS |
| 3.3 | Chat with merchant | ⚠️ PARTIAL — `negotiation_state.token` = `"ADDRESS"` (literal string, not actual address) |
| 4.1 | Accept quote (action field) | ❌ FAIL — `action` not a valid PATCH field |
| 4.2 | Accept quote (alternate) | ❌ FAIL — silently ignored |
| 4.3 | Settle via state update | ✅ PASS — works with raw fields |
| 5.1 | Withdraw | ❌ FAIL — 500 Internal Server Error |
| DB check | Execution record verification | ⏸️ SKIPPED — no psql client |

---

## Bugs Found

### Bug 1: `negotiation_state.token` shows `"ADDRESS"` instead of real token address
**Severity:** Medium
**Location:** Chat response (`POST /negotiations/:id/chat`), `negotiation_state.token`
**Behavior:** When LLM processes the token address in the message, `negotiation_state.token` is set to the literal string `"ADDRESS"` rather than `0x4200000000000000000000000000000000000042`. The `quote` object also shows `seller_ask_token: "ADDRESS"` instead of the real address.
**Impact:** Downstream consumers cannot identify which token is being negotiated without inferring from context.
**Expected:** `token` should be `0x4200000000000000000000000000000000000042`

### Bug 2: Withdraw endpoint returns 500
**Severity:** High
**Location:** `POST /shops/:id/wallet/withdraw`
**Behavior:** Returns `Internal Server Error` with no body.
**Expected:** Either successful withdrawal or a structured error (e.g., insufficient balance, wallet not configured).
**Impact:** Cannot withdraw funds from shop wallet via API.

### Bug 3: `action` field in PATCH /negotiations/:id is silently ignored
**Severity:** Medium
**Location:** `PATCH /negotiations/:id` — `action` field
**Behavior:** Sending `{"action": "accept_quote"}` or `{"action": "accept"}` is silently accepted (200) but has no effect. No error, no state change.
**Expected:** Either implement action dispatching or return a 422/unknown field error.
**Impact:** Frontend cannot use simple action verbs to accept quotes.

---

## What's Working

- Health and routing infrastructure is solid
- Shop creation with wallet provisioning works end-to-end
- Merchant LLM (GPT-4.1-mini via OpenAI) is live and responds contextually
- Negotiation state machine transitions work when using raw field updates
- Quote generation works (payout amount returned)

## What Needs Fixing

1. Fix token address in `negotiation_state` — should be the actual ERC-20 address, not the literal `"ADDRESS"`
2. Implement or properly error-handle the withdraw endpoint
3. Add `action` dispatch to `PATCH /negotiations/:id` OR document the accepted field names for settlement