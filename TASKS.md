# Pawn Agent — Tasks

## Now / Next

- [ ] Decide whether accepted negotiation outcomes create `DealOffer` records automatically or via explicit action
- [ ] Normalize merchant rules into structured schema instead of mostly freeform text
- [ ] Make `next_action` in negotiation state drive explicit seller/merchant workflow transitions
- [ ] Expand backend tests beyond current coverage for:
  - provider-key save
  - no-key scripted fallback
  - bad-key / provider-error fallback
  - live response-mode metadata shape
  - negotiation-state extraction edge cases

## After That

- [ ] Wire negotiation outcomes into `DealOffer` creation
- [ ] Define explicit offer acceptance / rejection / expiry flow
- [ ] Connect execution records to actual Base Sepolia settlement path
- [ ] Add real ENS ownership verification flow

## Contracts Track

- [ ] Audit current `contracts/` for what is legacy vs reusable
- [ ] Define minimal buyout-settlement contract for hackathon MVP
- [ ] Add Foundry tests for settlement lifecycle
- [ ] Connect backend deal/execution model to contract events/IDs

## Cleanup / Reliability

- [ ] Update `docs/IMPLEMENTATION_PLAN.md` so it matches actual implementation order and current repo reality
- [ ] Expand backend test coverage beyond smoke test + negotiation-state tests
- [ ] Add a lightweight seeded demo/reset workflow for local testing
- [ ] Reduce wallet-library build warnings/noise in production builds
- [ ] Add a lightweight deploy checklist for App Runner/Vercel env drift

## Current known-good verification
- backend: `cd backend && source .venv/bin/activate && python -m pytest -q` → `19 passed`
- frontend: `cd frontend && npm run build`
- production frontend: `GET https://pawn.solovibing.com` → `200`
- production proxy health: `GET https://pawn.solovibing.com/api/health` → `200`
- production backend health: `GET https://edhmvxs8fi.us-east-1.awsapprunner.com/health` → `200`
- provider-key save: `POST /shops/{shop_id}/provider-keys`
- structured negotiation state: `POST /negotiations/{id}/chat` and inspect `negotiation_state`

## Current resume priority
If only one slice is tackled next, do this:

**negotiation state → DealOffer bridge**
