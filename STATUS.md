# STATUS: Pawn Agent

## Snapshot
- **Current phase:** post-hackathon active development
- **Overall health:** green
- **Last updated:** 2026-05-02
- **Updated by:** Mira documentation audit

## Active Focus
Pawn Agent is an ENS-native AI token buyout storefront MVP on Base Sepolia. Hackathon submission (ETHGlobal Open Agents + 0G Builder, deadline 2026-04-27) is complete. Post-hackathon QA round completed 2026-05-02 with 7 bugs fixed. Core loop is functional end-to-end in stub mode.

## Current Blockers
- Server startup env var fix needed: `.env` changes don't survive git pull without manual intervention; uvicorn daemon needs `DATABASE_URL` and wallet flags set on startup
- Live settlements blocked by `CDP_WALLET_LIVE_ENABLED=false` (stub mode only for now)

## What's Working (as of 2026-05-02 QA)
- All API routes returning correct status codes
- ENS-tied shop creation and ownership verification
- Merchant configuration and provider key management
- Seller ↔ merchant negotiation (live LLM or scripted fallback)
- Quote presentation, counter, and accept flow
- Settlement flow end-to-end in simulated mode
- Wallet provisioning in stub mode
- On-chain ETH settlement simulation (stub wallets)
- Frontend build compiles successfully
- RDS PostgreSQL database wired (needs env fix on server)
- Full end-to-end settlement flow confirmed: shop → wallet provision → negotiation → chat → accept → deal + simulated execution

## Bugs Fixed (2026-05-02 QA Round)
1. `chat_log` column missing from `negotiation_sessions` table → added via migrate_pg.py
2. Stub wallet provisioning was blocked → `CDP_WALLET_FALLBACK_TO_STUB=true` + stub wallet creation path added
3. Settlement accept rejected stub wallets → updated settlement check to allow `ZERO_ADDRESS` for stub mode
4. `send_eth` hardcoded wrong chain ID (8453 instead of 84532 for Base Sepolia) → fixed
5. `negotiation_state` type error (TEXT vs JSONB) → fixed in model + migration
6. ENS owned endpoint 500 on 404 → graceful 404 handling for web3.bio
7. Schema drift in migrate_pg.py → complete rewrite with correct columns, indexes, and ADD COLUMN patches

## Progress
- [x] Shop creation (ENS-tied identity)
- [x] Merchant configuration and provider key management
- [x] Seller ↔ merchant negotiation with LLM or scripted fallback
- [x] Quote presentation and accept flow
- [x] Settlement flow (simulated) end-to-end
- [x] Stub wallet provisioning
- [x] RDS PostgreSQL wiring + schema migration
- [x] Post-hackathon QA round (7 bugs fixed, 2026-05-02)
- [ ] Server startup env var fix (systemd/service script or python-dotenv)
- [ ] Schema model sync (`seller_ens`, `expires_at` in NegotiationSession model)
- [ ] Optional: remove debug endpoint from main.py
- [ ] Live settlements (flip `CDP_WALLET_LIVE_ENABLED=true` + fund Alchemy wallet)

## Next Steps
1. **Server env fix** — Configure uvicorn daemon with `DATABASE_URL`, `CDP_WALLET_FALLBACK_TO_STUB=true` via systemd service, startup script, or `uvicorn --env-file .env`
2. **Schema model sync** — Add `seller_ens` and `expires_at` to `NegotiationSession` SQLAlchemy model
3. **Live settlements** — Enable `CDP_WALLET_LIVE_ENABLED=true`, set `ALCHEMY_API_KEY` + `ALCHEMY_WALLET_MASTER_SEED` on server
4. **Debug endpoint removal** — Clean up `/debug/settings` before production

## Key Files
- `backend/app/services/wallets.py` — wallet provisioning, chain ID, web3 v7 compat
- `backend/app/services/settlements.py` — settlement flow
- `backend/app/services/negotiations.py` — negotiation logic
- `backend/app/services/ens.py` — ENS resolution
- `backend/migrate_pg.py` — RDS schema migrations
- `docs/DESIGN.md` — product design
- `docs/QA_REPORT.md` — full 2026-05-02 QA details

## Notes
- Hackathon deadline (2026-04-27) has passed — project is now in post-submission refinement
- MVP core loop is functional; product is not yet production-complete
- NFT collateral, cross-chain, and generalized multi-agent are out of scope for MVP
