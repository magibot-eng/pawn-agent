# STATUS: Pawn Agent

## Snapshot
- **Current phase:** post-hackathon active development — LIVE SETTLEMENTS ACHIEVED
- **Overall health:** green
- **Last updated:** 2026-05-02 15:30 PDT
- **Updated by:** Arie

## Active Focus
End-to-end on-chain settlement working on Base Sepolia. Ready for minor fixes and hardening before any further testing or production consideration.

## What's Working (as of 2026-05-02 15:30 PDT)
- All API routes returning correct status codes ✓
- ENS-tied shop creation and ownership verification ✓
- Seller ↔ merchant negotiation (LLM or scripted fallback) ✓
- Quote presentation, counter, and accept flow ✓
- **LIVE on-chain settlement end-to-end ✓** (first tx confirmed: https://sepolia.basescan.org/tx/0xc9a2f5ddd220fc70e569b8343e8200a092283e47bbb59f39e0b7c1ef17f01419)
- Wallet provisioning (stub + Alchemy live) ✓
- RDS PostgreSQL database wired ✓
- Full end-to-end: shop → wallet provision → negotiation → chat → quote → accept → on-chain ETH payout ✓

## Architecture
- **Settlement:** Direct wallet two-step (CDP/Alchemy-managed merchant wallet)
  1. `transferFrom` pulls ERC-20 tokens from seller → merchant wallet
  2. ETH send from merchant wallet → seller
- **CDP MCP race:** CDP MCP server and backend share same merchant wallet private key; both may submit `transferFrom` concurrently → backend handles nonce conflicts by checking on-chain state
- **Frontend:** Next.js 15 + RainbowKit + wagmi on Vercel
- **Backend:** FastAPI on Railway
- **DB:** Railway RDS PostgreSQL

## Bugs Fixed (2026-05-02)
| # | Bug | Fix |
|---|-----|-----|
| 1 | PAWN token address lowercase → web3 checksum error | `Web3.to_checksum_address()` on all token address uses |
| 2 | `input_token` missing from `_build_quote_response()` | Added `input_token` + `input_amount` to quote response |
| 3 | `viem InvalidDecimalNumberError` on approve | Guard check in `handleApprovePAWN` before `parseEther` |
| 4 | `web3RPCError` caught as `ValueError` (web3.py 7.x) | Changed to `Web3RPCError` |
| 5 | `_ERC20_ABI` missing `balanceOf` | Added `balanceOf` + `approve` to ABI |
| 6 | Broken balance check for CDP race detection | Rewrote to delta-check merchant wallet before/after |
| 7 | Backend pre-flight `allowance` check blocking settlement | Removed — blockchain handles approval verification |
| 8 | Settlement quote reappearing after completion | Frontend guards + backend returns `None` for accepted quotes |
| 9 | Accept button not disabled during approval tx confirm | Added `isApproveConfirmed` gate |
| 10 | Pending nonce `get_transaction_count` → nonce conflicts | Use `get_transaction_count(pending)` + 25% gas bump on ETH step |

## DB Fixes Applied (2026-05-02)
- `chat_log` column missing → added via migrate_pg.py
- Stub wallet blocked → `CDP_WALLET_FALLBACK_TO_STUB=true` path
- Settlement reject on stub wallets → updated to allow `ZERO_ADDRESS` for stub
- `negotiation_state` TEXT vs JSONB type error → fixed in model + migration
- ENS owned endpoint 500 on 404 → graceful 404 handling
- Schema drift in migrate_pg.py → complete rewrite

## Current Blockers
- None — core loop is working end-to-end on Base Sepolia

## Open Items / Minor Fixes Needed
- Remove debug endpoint from main.py before any production consideration
- Schema model sync (`seller_ens`, `expires_at` in NegotiationSession)
- Server startup env var durability (`.env` changes don't survive git pull)
- Consider: more informative settlement error messages for edge cases
- Consider: settlement confirmation UI (tx hash displayed to seller after settle)

## Next Steps
1. **Minor fixes** — per Wago's list (TBD)
2. **Debug endpoint removal** — clean up `/debug/settings`
3. **Schema model sync** — add `seller_ens` and `expires_at` to model
4. **Server env durability** — systemd service or startup script for env vars

## Key Files
- `backend/app/services/wallets.py` — wallet provisioning
- `backend/app/services/settlements.py` — settlement orchestration
- `backend/app/services/negotiations.py` — negotiation + quote building
- `backend/app/api/negotiations.py` — accept/counter/chat endpoints
- `frontend/components/MerchantChat.tsx` — seller UI + quote card
- `backend/migrate_pg.py` — RDS schema migrations

## Infrastructure
- **Backend:** Railway — `https://pawn-agent-backend-production.up.railway.app`
- **Frontend:** Vercel — `https://pawn.solovibing.com`
- **DB:** Railway RDS — `pawn-agent-db.cv8kasmsyxi5.us-east-1.rds.amazonaws.com`
- **PAWN Token:** `0x621B62fBFe0ABEf52eD2aAfd0787Fb1DAEEed1e5` (Base Sepolia)
- **Settlement contract:** Direct wallet — no contract in hot path
