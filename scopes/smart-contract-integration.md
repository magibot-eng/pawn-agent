# Pawn Agent — Smart Contract Integration Scope

## What This Is

Rebuild the settlement layer so PAWN token movements are tracked on-chain via the `BuyoutSettlement` smart contract, making it a true atomic swap instead of a one-sided ETH transfer.

---

## Background

### Current State

**Smart contract:** Written and tested (`BuyoutSettlement.sol`), deployed to Base Sepolia at an unknown address (not yet in config). Never wired to backend.

**Backend (`settlements.py`):** `accept_quote_and_execute()` bypasses the contract entirely — it calls `_submit_eth_settlement()` which does a raw `send_eth` via Alchemy SDK. No contract call. No PAWN pull.

**DB records:** `DealOffer` + `Execution` exist off-chain, but these are just bookkeeping — they don't correspond to on-chain deal state.

**Frontend dashboard:** Shows wallet mode (`stub`/`live`) but the badge reads `auto_settlement_enabled` instead of `wallet_provider_account_id`. Also can't show PAWN movement because nothing on-chain tracks it.

**Result:** One ETH tx shows up on BaseScan. PAWN transfer is invisible. Seller can't verify they received their collateral payout on-chain.

### What the Contract Does

`BuyoutSettlement` (already written at `contracts/src/BuyoutSettlement.sol`):

```
submitOffer(seller, inputToken=PAWN, inputAmount, payoutAmount=ETH, expiresAt, nonce)
  → stores deal on-chain, merchant funds contract with ETH

acceptOffer(dealId)
  → contract pulls PAWN from seller → holds
  → contract sends ETH to seller → atomically
  → both in ONE tx
```

Seller calls `acceptOffer()` themselves (or merchant triggers it for them).

### What a Proper Swap Looks Like

1. Merchant pre-funds contract with ETH (enough to cover all pending payouts)
2. Backend creates deal via `submitOffer()` → on-chain Deal record created
3. Seller (or backend, on seller's behalf) calls `acceptOffer(dealId)` → atomic swap executes
4. On-chain events `OfferAccepted` emitted → PAWN + ETH movement both visible on BaseScan
5. Merchant withdraws accumulated PAWN from contract

---

## Scope

### Phase 1 — Deploy the Contract

- [ ] Deploy `BuyoutSettlement` to Base Sepolia (one-time)
- [ ] Add contract address to backend env: `BUYOUT_CONTRACT_ADDRESS`
- [ ] Add contract address to Shop model per-shop: `contract_address` (per merchant, or shared)
- [ ] Store deployed address in project ops docs

**Who:** Magi (needs Alchemy-funded deployer account)

### Phase 2 — Fund the Contract

- [ ] Backend endpoint or admin flow to fund the contract with ETH from merchant wallet
- [ ] `POST /shops/{shop_id}/fund-contract` → sends ETH from merchant hot wallet → contract
- [ ] Track contract balance in DB (for display)
- [ ] Ensure contract always has sufficient ETH to cover pending deals

**Who:** Magi

### Phase 3 — Wire Contract into Settlement Flow

- [ ] Replace `_submit_eth_settlement()` with `submitOffer()` call on the contract
- [ ] Replace raw ETH send with `acceptOffer()` call on the contract (or tell seller/backend to call it)
- [ ] The backend doesn't need to hold PAWN — contract pulls it from seller directly
- [ ] Parse `OfferAccepted` events to update DB `Execution.tx_hash`
- [ ] Parse `OfferAccepted` events to confirm PAWN moved

**Key insight:** The atomic swap means the backend no longer "holds" any tokens. The contract escrows both sides. Backend just manages the deal lifecycle.

**Who:** Magi

### Phase 4 — Track PAWN Movements On-Chain

- [ ] Add `input_token`, `input_amount` to `Execution` model (already partially there via `tokens_received`)
- [ ] Fetch `InputTokenSwapped` / `OfferAccepted` events from contract to get PAWN tx hash
- [ ] Return both `tx_hash` (ETH side) and `input_tx_hash` (PAWN side) in API
- [ ] Update frontend to display both tx hashes

**Who:** Magi + Biju (UI)

### Phase 5 — Frontend: Display Both Settlement Transactions

- [ ] Show ETH tx hash in deal details (current)
- [ ] Show PAWN tx hash in deal details (new — from contract events)
- [ ] Fix "Mode: stub" badge to read `wallet_provider_account_id` prefix, not just `auto_settlement_enabled`

**Who:** Biju (Magi if frontend changes needed)

### Phase 6 — Remove or Deprecate Stub Settlement Path

- [ ] Remove `_simulate_eth_settlement()` and stub mode entirely — or keep only for test/dev
- [ ] All live settlements go through contract
- [ ] `auto_settlement_enabled` becomes irrelevant (or controls whether merchant can create deals, not how they settle)

---

## Key Files

```
contracts/src/BuyoutSettlement.sol   ← canonical contract (already written)
contracts/src/PawnToken.sol          ← PAWN token
contracts/src/PawnShop.sol           ← legacy exploratory, not in use
contracts/test/BuyoutSettlement.t.sol ← existing tests

backend/app/services/settlements.py  ← needs overhaul (accept_quote_and_execute)
backend/app/services/alchemy_client.py ← will no longer need send_eth for settlements
backend/app/api/deals.py             ← needs contract submitOffer/acceptOffer calls
backend/app/models/deal.py           ← Execution needs input_tx_hash field

frontend/app/owner/page.tsx         ← fix mode badge
frontend/app/shop/[ens]/page.tsx    ← show both tx hashes
```

---

## Decision (2026-05-02)

**Seller initiates on-chain via dApp.** Backend creates deal via `submitOffer()`. Seller connects wallet to the dApp, approves PAWN to the contract, then calls `acceptOffer()` themselves. No meta-tx, no backend holding tokens.

### Open Questions (resolved)

1. **Who calls `acceptOffer()`?** ✅ Seller initiates on-chain. See decision above.
2. **One contract per shop, or one shared contract?** ✅ Per-shop for now (`contract_address` on Shop model).
3. **PAWN approval flow:** ✅ dApp prompts seller to `approve(BuyoutSettlement, inputAmount)` when they click Accept.
4. **Seller wallet UX:** dApp must show seller their pending deals with Connect Wallet + Approve + Accept flow.

### Open Questions (still open)

5. **Contract funding threshold:** At what ETH balance do we stop accepting new deals until funded?
6. **What happens if contract runs dry mid-settlement?** `acceptOffer()` reverts `InsufficientContractBalance`. Need a recovery flow.

---

## Status

**Current:** ❌ Contract written but not deployed, not wired, not funded
**Goal:** ✅ Atomic swap — both ETH and PAWN txns visible on BaseScan for every settlement

---

## Priority

**High.** Without this, the settlement is only half on-chain. Can't claim "decentralized" or "verified" without both sides trackable.

---

## Owner

Wago + Magi + Biju
