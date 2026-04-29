# Pawn Agent — Project State

**Status:** Design Locked | Implementation Plan Complete | Execution Not Started
**Last Updated:** 2026-04-29

## Where We Are

- [x] Product direction narrowed to **ENS prize only**
- [x] MVP reframed as **buyout-first** rather than loan-first
- [x] Canonical design doc updated (`docs/DESIGN.md`)
- [x] Implementation plan written (`docs/IMPLEMENTATION_PLAN.md`)
- [x] Existing repo scaffold audited
- [ ] Repo docs modernized for public OSS review
- [ ] Frontend scaffold created
- [ ] Backend scaffold created
- [ ] Buyout settlement contract implemented
- [ ] Merchant onboarding flow implemented
- [ ] Encrypted API key storage implemented
- [ ] Merchant rules UI and negotiation runtime implemented

## Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Prize focus | ENS only | Keeps the product story clean and tightly scoped |
| Product model | Discounted token buyout merchant first | Simpler than collateralized lending for MVP; fits distressed-token use case |
| Chain | Base Sepolia only | Lowest-complexity demo environment |
| Identity model | Root ENS name canonical; subdomain optional | Strong ENS identity without overcommitting to one subdomain path |
| Durin reliance | Optional convenience, not core dependency | Avoids identity lock-in and chain-specific constraints |
| Asset type | ERC-20 only | Keeps valuation and settlement tractable for v1 |
| Token coverage | Start with faucet-accessible Base Sepolia assets | Lets the demo expand incrementally |
| LLM providers | OpenAI, Anthropic, OpenRouter | Focused initial provider set |
| LLM key storage | Persisted encrypted server-side storage | Required for persistent merchant shops |
| AWS dependency | Not required for MVP | Simpler initial implementation; can add KMS/Secrets Manager later |
| Execution model | Autonomous execution inside hard rules | Delivers the core agent experience while staying bounded |
| Storefront fidelity | Easiest viable 2D / lightweight immersive merchant UI first | Better scope control than pseudo-3D or full scene work |
| Repo policy | Public open-source repo with frequent small commits | Required for verification and healthy execution discipline |

## Current Repo Reality

### Canonical docs
- `docs/DESIGN.md` — product source of truth
- `docs/IMPLEMENTATION_PLAN.md` — execution source of truth

### Legacy scaffolds still present
These files exist but reflect the older loan-first concept and must be replaced or rewritten during early implementation:
- `contracts/src/PawnShop.sol`
- `config/shop_rules.yaml`
- `.env.example`
- `requirements.txt` (root-level exploratory dependency list)

### Repo state
- Git repo exists
- commit discipline requirement is locked
- repo should remain public and open source

## Open Questions

1. Exact Base Sepolia test token set for initial demo
2. Whether optional subdomain provisioning ships in v1 or v1.1
3. How much market-data sophistication is needed in the first pricing heuristic
4. Whether storefront visuals begin with static art, generated art, or lightly interactive presentation

## Next Actions

1. Refresh public-facing repo docs (`README.md`, `LICENSE`, `docs/API.md`)
2. Scaffold `frontend/` with Next.js + wallet/ENS foundation
3. Scaffold `backend/` with FastAPI + DB/config foundation
4. Replace the loan-era contract direction with a buyout settlement contract and tests
5. Add encrypted provider key storage
6. Add ENS merchant onboarding and shop creation flow
7. Replace loan-era rules schema with buyout-first merchant rules
8. Implement master prompt, negotiation runtime, and auto-execution gate

## Notes

If execution details drift from the design document, update `docs/DESIGN.md` first or explicitly record the rationale before proceeding.
