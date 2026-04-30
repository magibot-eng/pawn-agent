# Pawn Agent — Roadmap

## Milestone 1 — Working Negotiation Prototype
**Status:** achieved

Includes:
- owner-configured shop fields
- provider-key save/list
- negotiation-session persistence
- seller chat surface
- runtime mode visibility
- graceful provider failure fallback

## Milestone 2 — Structured Negotiation Productization
**Status:** achieved / ready for follow-on workflow work

Delivered:
- extracted negotiation summary/state
- visible negotiation side panel
- clearer immediate “what is happening now” context in the UI
- backend tests around state extraction and persistence

## Milestone 3 — Deal Generation Layer
**Status:** next

Deliverables:
- explicit offer creation from negotiation outcomes
- `DealOffer` lifecycle states clarified
- bridge between negotiation acceptance and execution intent

## Milestone 4 — Buyout Settlement Contracts
**Status:** pending

Deliverables:
- minimal Base Sepolia buyout settlement contract
- Foundry tests
- backend linkage to contract IDs/events

## Milestone 5 — ENS-Native Demo Readiness
**Status:** pending

Deliverables:
- stronger ENS ownership/identity flow
- cleaner demo setup/reset path
- end-to-end walkthrough for judges/users
- tighter documentation and test coverage

## Milestone 6 — Public OSS Polish
**Status:** ongoing

Deliverables:
- small clean commits
- pushed history reflecting real progress
- state docs that match code reality
- no confusion between legacy scaffolds and active MVP path
