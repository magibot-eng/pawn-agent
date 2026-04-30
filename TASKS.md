# Pawn Agent — Tasks

## Now / Next

- [ ] Add structured negotiation state extraction to the backend chat flow
- [ ] Persist extracted negotiation summary fields on the negotiation session or adjacent model
- [ ] Show structured negotiation state beside the seller chat in the frontend
- [ ] Add targeted backend tests for:
  - provider-key save
  - no-key scripted fallback
  - bad-key / provider-error fallback
  - live response-mode metadata shape
- [ ] Decide whether accepted negotiation outcomes create `DealOffer` records automatically or via explicit action

## After That

- [ ] Normalize merchant rules into structured schema instead of mostly freeform text
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
- [ ] Expand backend test coverage beyond smoke test
- [ ] Add a lightweight seeded demo/reset workflow for local testing
- [ ] Document local run commands cleanly in README if they drift

## Current known-good verification
- backend: `cd backend && source .venv/bin/activate && python -m pytest -q`
- backend health: `uvicorn app.main:app --host 127.0.0.1 --port 8011` then `GET /health`
- provider-key save: `POST /shops/{shop_id}/provider-keys`

## Current resume priority
If only one slice is tackled next, do this:

**structured negotiation state → UI panel → tests**
