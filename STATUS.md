# Pawn Agent — Status

## Overall: **active**

## Current Phase
Design locked for the ENS-focused, buyout-first MVP. Implementation planning complete. Execution not yet started.

## Product Direction
Pawn Agent is now defined as an **ENS-native AI token buyout platform** on **Base Sepolia**.

The MVP is:
- ENS prize focused only
- buyout-first, not collateralized lending first
- ERC-20 only
- root ENS name as canonical merchant identity
- optional subdomain support
- persisted encrypted LLM API key storage
- autonomous execution allowed within merchant hard rules

## What Exists
| Component | Status | Notes |
|-----------|--------|-------|
| `docs/DESIGN.md` | ✅ Complete | Canonical product design source of truth |
| `docs/IMPLEMENTATION_PLAN.md` | ✅ Complete | Canonical implementation roadmap |
| `docs/STATE.md` | ✅ Updated | Project-state summary aligned to current direction |
| `STATUS.md` | ✅ Updated | High-level status aligned to current direction |
| `.env.example` | ⚠️ Legacy scaffold | Still loan-era / pre-refactor; update in early implementation commits |
| `config/shop_rules.yaml` | ⚠️ Legacy scaffold | Still loan-era / pre-refactor; replace with buyout-first schema |
| `contracts/src/PawnShop.sol` | ⚠️ Legacy scaffold | Exploratory loan contract; not the canonical MVP contract path |
| Git repository | ✅ Present | Public OSS workflow required; commit in small scoped slices |

## Blockers
No design blocker.

Main remaining work is execution:
- frontend scaffold
- backend scaffold
- buyout settlement contract
- encrypted API key storage
- ENS onboarding
- merchant rules UI and agent runtime

## Next Steps
1. Replace placeholder repo docs (`README.md`, license, API docs)
2. Scaffold `frontend/` Next.js app
3. Scaffold `backend/` FastAPI app
4. Add failing Foundry tests for buyout settlement lifecycle
5. Implement buyout-first contract flow on Base Sepolia
6. Replace legacy loan-era env/rules scaffolds with buyout-first equivalents
7. Begin merchant onboarding, encrypted key storage, and rules UI
