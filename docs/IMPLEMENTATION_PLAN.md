# Pawn Agent Implementation Plan

> **For Hermes:** Use this plan as the execution source of truth. Implement in small, reviewable commits. Do not batch large changes into a small number of commits.

**Goal:** Build an ENS-native AI token buyout platform on Base Sepolia where merchants launch ENS-branded storefronts, configure hard buyout rules, securely store LLM API keys, and let an AI merchant negotiate and auto-execute discounted token buyout deals.

**Architecture:** Use a single public monorepo with three main surfaces: a Next.js frontend for onboarding/storefront UX, a Python FastAPI backend for merchant config + encrypted secrets + negotiation/execution orchestration, and Foundry contracts for Base Sepolia deal settlement. Keep the first version buyout-first and rule-bounded, with deterministic contracts and offchain agent intelligence.

**Tech Stack:**
- Frontend: Next.js, TypeScript, Tailwind, wagmi, viem, RainbowKit
- Backend: Python 3.11+, FastAPI, SQLAlchemy, Pydantic, Alembic, cryptography, httpx
- Database: SQLite for local dev, PostgreSQL-ready schema
- Contracts: Solidity, Foundry, OpenZeppelin
- Web3: viem/wagmi on frontend, web3.py or viem-compatible backend calls only where needed
- LLM providers: OpenAI, Anthropic, OpenRouter

---

## 0. Repository Strategy and Commit Discipline

### Required workflow constraints
- Repository remains **public**.
- Project remains **open source**.
- Every milestone is split into **small scoped commits**.
- No "giant hidden diff" commits.
- Prefer 1 focused concern per commit.

### Commit shape rule
Good commit examples:
- `docs: add repo architecture section to README`
- `feat(frontend): scaffold wallet connect shell`
- `feat(backend): add encrypted provider-key model`
- `feat(contracts): add BuyoutEscrow struct and events`
- `test(agent): add negotiation rules validation cases`

Bad commit examples:
- `update project`
- `many fixes`
- `initial implementation` with 50 files changed

### Branch strategy
- `main` stays deployable or close to deployable
- feature branches allowed, but merge in small reviewed slices
- if working directly on `main`, commits must be even smaller and safer

---

## 1. Target Repository Layout

This plan assumes the repo evolves into:

```text
pawn-agent/
├── README.md
├── LICENSE
├── .env.example
├── .gitignore
├── docs/
│   ├── DESIGN.md
│   ├── STATE.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── API.md
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── public/
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/
│   │   ├── services/
│   │   ├── agent/
│   │   └── crypto/
│   └── tests/
├── contracts/
│   ├── foundry.toml
│   ├── src/
│   ├── test/
│   ├── script/
│   └── lib/
└── config/
    └── shop_rules.yaml
```

### Important note
The current `contracts/src/PawnShop.sol` and `config/shop_rules.yaml` are loan-oriented scaffolds. They should be treated as **legacy exploratory scaffolds** and migrated toward the buyout-first model rather than extended blindly.

---

## 2. Phase Overview

Implementation should proceed in this order:

1. Repo hygiene and documentation baseline
2. Frontend/backend scaffolding
3. Contract redesign for buyout-first flow
4. Merchant data model + encrypted API key storage
5. ENS onboarding flow
6. Merchant rules schema + UI
7. LLM negotiation runtime + master prompt
8. Deal normalization and auto-execution orchestration
9. Storefront RPG-style presentation layer
10. End-to-end Base Sepolia demo flow
11. Public repo polish and launch readiness

---

## 3. Phase 1 — Repo Hygiene and Baseline Docs

### Objective
Make the repo credible as a public OSS project before feature work expands.

### Files
- Modify: `README.md`
- Create: `LICENSE`
- Create: `docs/API.md`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `docs/STATE.md`

### Tasks

#### Task 1.1: Replace placeholder README
**Commit:** `docs: add public project overview and repo map`

Add:
- product summary
- ENS-only positioning
- buyout-first model
- repo architecture
- local dev overview
- public OSS statement

#### Task 1.2: Add OSS license
**Commit:** `docs: add open source license`

Recommended default unless directed otherwise:
- `MIT`

#### Task 1.3: Add API surface placeholder doc
**Commit:** `docs: add initial API documentation skeleton`

Create `docs/API.md` with planned endpoints grouped by:
- auth/session
- ENS/shop onboarding
- provider key management
- merchant rules
- negotiation
- execution

#### Task 1.4: Fix environment sample around current product model
**Commit:** `docs: align env example with buyout-first architecture`

Update `.env.example` to:
- remove loan-specific naming
- add backend encryption key env var
- add Base Sepolia RPC naming
- add frontend public env placeholders

#### Task 1.5: Update project state doc
**Commit:** `docs: update state doc for buyout-first ENS MVP`

`docs/STATE.md` should reflect:
- loan-first idea replaced by buyout-first MVP
- current implementation not yet started
- public repo + small commits rule

### Verification
- `git diff --stat`
- manually inspect README, LICENSE, STATE, env docs

---

## 4. Phase 2 — App Scaffolding

### Objective
Create clean frontend/backend skeletons before business logic.

### Files
- Create: `frontend/package.json`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/components/`
- Create: `frontend/lib/`
- Create: `backend/pyproject.toml`
- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/tests/test_health.py`

### Tasks

#### Task 2.1: Scaffold frontend app
**Commit:** `feat(frontend): scaffold nextjs storefront app shell`

Include:
- Next.js app router
- TypeScript
- Tailwind
- base layout
- placeholder homepage

#### Task 2.2: Scaffold backend app
**Commit:** `feat(backend): scaffold fastapi service shell`

Include:
- FastAPI app
- `/health`
- config loader
- app startup wiring

#### Task 2.3: Add Python dependency split
**Commit:** `chore(backend): add backend dependency manifest`

Move runtime dependencies to `backend/requirements.txt` or `pyproject.toml`.
Root `requirements.txt` can remain temporarily, but backend becomes canonical.

#### Task 2.4: Add baseline tests
**Commit:** `test(backend): add health endpoint smoke test`

### Verification
Frontend:
- `cd frontend && npm install && npm run lint`
- `cd frontend && npm run dev`

Backend:
- `cd backend && python -m pytest -q`
- `cd backend && uvicorn app.main:app --reload`

---

## 5. Phase 3 — Contract Redesign (Buyout-First)

### Objective
Replace the loan-oriented PawnShop contract direction with a buyout-first settlement contract.

### Product model to implement
The first contract should support:
- a merchant-approved or agent-approved buyout offer
- a seller accepting that offer
- settlement execution on Base Sepolia
- event emission for indexing and auditability

### Files
- Modify or replace: `contracts/src/PawnShop.sol`
- Create: `contracts/src/BuyoutSettlement.sol`
- Create: `contracts/test/BuyoutSettlement.t.sol`
- Create: `contracts/script/DeployBuyoutSettlement.s.sol`

### Recommendation
Do **not** keep the existing loan contract as the main MVP primitive. Either:
- replace `PawnShop.sol` with buyout semantics, or
- keep it as historical scaffold but make `BuyoutSettlement.sol` the canonical contract

Preferred path: create `BuyoutSettlement.sol` and later remove or archive the loan scaffold.

### Contract responsibilities
MVP contract should support:
- merchant address
- seller address
- input token
- input amount
- payout token
- payout amount
- expiry timestamp
- deal status enum
- execution function
- cancel/expire path
- events for creation, acceptance, execution, cancellation

### Tasks

#### Task 3.1: Add buyout contract spec comments
**Commit:** `docs(contracts): define buyout settlement invariants`

Document invariants at top of contract file or dedicated comments.

#### Task 3.2: Write failing Foundry tests for deal lifecycle
**Commit:** `test(contracts): add failing buyout lifecycle tests`

Test cases:
- create offer
- accept valid offer
- reject expired offer
- prevent double execution
- only authorized path can cancel where applicable

#### Task 3.3: Implement minimal buyout contract
**Commit:** `feat(contracts): add buyout settlement contract`

#### Task 3.4: Add deploy script
**Commit:** `feat(contracts): add base sepolia deploy script`

### Verification
- `cd contracts && forge test -vv`
- `cd contracts && forge build`

---

## 6. Phase 4 — Database and Merchant Models

### Objective
Create the backend persistence layer for shops, ENS identities, provider credentials, and rules.

### Files
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/shop.py`
- Create: `backend/app/models/provider_key.py`
- Create: `backend/app/models/negotiation.py`
- Create: `backend/app/models/deal.py`
- Create: `backend/app/schemas/shop.py`
- Create: `backend/app/schemas/provider_key.py`
- Create: `backend/alembic/...`
- Create: `backend/tests/test_models.py`

### Core tables
- `shops`
- `shop_ens_identities`
- `provider_keys`
- `shop_rules`
- `negotiation_sessions`
- `deal_offers`
- `executions`

### Tasks

#### Task 4.1: Add DB engine/session wiring
**Commit:** `feat(backend): add database engine and session management`

#### Task 4.2: Add merchant shop model
**Commit:** `feat(backend): add merchant shop persistence model`

#### Task 4.3: Add encrypted provider-key model
**Commit:** `feat(backend): add encrypted provider credential model`

#### Task 4.4: Add alembic init and first migration
**Commit:** `feat(backend): add initial database migration`

### Verification
- `cd backend && alembic upgrade head`
- `cd backend && python -m pytest -q`

---

## 7. Phase 5 — Encrypted API Key Storage

### Objective
Implement persisted encrypted storage for merchant LLM keys without requiring AWS.

### Files
- Create: `backend/app/crypto/envelope.py`
- Create: `backend/app/services/provider_keys.py`
- Create: `backend/app/api/provider_keys.py`
- Create: `backend/tests/test_provider_key_crypto.py`

### Implementation choice
Use app-level encryption with a master key from env:
- `PAWN_AGENT_MASTER_ENCRYPTION_KEY`

Recommended approach:
- Fernet or AES-GCM wrapper
- store encrypted blob + metadata
- never store plaintext in DB

### Tasks

#### Task 5.1: Add encryption utility
**Commit:** `feat(backend): add application-level secret encryption utility`

#### Task 5.2: Add provider key service
**Commit:** `feat(backend): add persisted provider key service`

#### Task 5.3: Add API routes for key save/rotate/delete
**Commit:** `feat(backend): add provider key management endpoints`

#### Task 5.4: Add crypto tests
**Commit:** `test(backend): add encrypted credential storage tests`

### Verification
- `cd backend && python -m pytest backend/tests/test_provider_key_crypto.py -q`
- manually verify DB contains ciphertext only

---

## 8. Phase 6 — ENS Onboarding

### Objective
Allow merchant wallet connection and ENS identity selection.

### Files
- Create: `frontend/components/wallet/connect-wallet.tsx`
- Create: `frontend/components/onboarding/ens-picker.tsx`
- Create: `frontend/lib/wagmi.ts`
- Create: `backend/app/api/shops.py`
- Create: `backend/app/services/ens.py`
- Create: `backend/tests/test_ens_service.py`

### UX scope
Merchant flow:
- connect wallet
- fetch owned ENS names
- select canonical root ENS
- optional subdomain toggle placeholder
- create shop record

### Tasks

#### Task 6.1: Add wallet connection shell
**Commit:** `feat(frontend): add wallet connection shell`

#### Task 6.2: Add ENS fetch service
**Commit:** `feat(backend): add ENS resolution service`

#### Task 6.3: Add shop creation API
**Commit:** `feat(backend): add shop creation endpoint`

#### Task 6.4: Add ENS picker UI
**Commit:** `feat(frontend): add ENS identity selection flow`

### Verification
- connect wallet in local UI
- create shop with selected ENS identity
- verify shop record saved in DB

---

## 9. Phase 7 — Merchant Rules Schema

### Objective
Replace the loan-era YAML-first rules model with a merchant-facing structured buyout rules schema.

### Files
- Modify: `config/shop_rules.yaml`
- Create: `backend/app/schemas/rules.py`
- Create: `backend/app/services/rules.py`
- Create: `backend/app/api/rules.py`
- Create: `frontend/components/rules/rules-form.tsx`
- Create: `backend/tests/test_rules_engine.py`

### MVP rules fields
- desired assets
- excluded assets
- buy-side budget
- min/max deal size
- target discount basis
- liquidity sensitivity
- max exposure per token
- max total exposure
- aggressiveness
- poor-data fallback behavior
- tone/persona preset

### Tasks

#### Task 7.1: Redesign YAML example to buyout-first semantics
**Commit:** `docs(config): rewrite sample shop rules for buyout model`

#### Task 7.2: Add Pydantic rules schema
**Commit:** `feat(backend): add merchant rules schema validation`

#### Task 7.3: Add rules API
**Commit:** `feat(backend): add shop rules endpoints`

#### Task 7.4: Add merchant rules UI form
**Commit:** `feat(frontend): add merchant rules configuration form`

#### Task 7.5: Add validation tests
**Commit:** `test(backend): add rules validation cases`

### Verification
- save valid rules from UI
- reject malformed/excessive configs
- render saved config back into UI

---

## 10. Phase 8 — Master Prompt and Agent Runtime

### Objective
Build the negotiation engine with a stable prompt hierarchy.

### Files
- Create: `backend/app/agent/master_prompt.md`
- Create: `backend/app/agent/prompt_builder.py`
- Create: `backend/app/agent/providers/openai_client.py`
- Create: `backend/app/agent/providers/anthropic_client.py`
- Create: `backend/app/agent/providers/openrouter_client.py`
- Create: `backend/app/agent/negotiator.py`
- Create: `backend/tests/test_prompt_builder.py`
- Create: `backend/tests/test_negotiator.py`

### Prompt layers
1. master system prompt
2. merchant config layer
3. live negotiation context

### Runtime requirement
The agent must return a structured output, not freeform only.

Required outputs:
- action: reject / counter / accept / ask_clarifying_question
- rationale summary
- normalized deal proposal
- execution eligibility boolean
- violated rules if any

### Tasks

#### Task 8.1: Write master prompt
**Commit:** `feat(agent): add master pawn agent prompt`

#### Task 8.2: Add prompt builder
**Commit:** `feat(agent): add layered prompt builder`

#### Task 8.3: Add provider adapters
**Commit:** `feat(agent): add initial LLM provider adapters`

#### Task 8.4: Add structured negotiator service
**Commit:** `feat(agent): add structured negotiation engine`

#### Task 8.5: Add negotiation tests with mocked providers
**Commit:** `test(agent): add negotiation output contract tests`

### Verification
- unit tests pass
- mocked negotiation produces structured counteroffers
- invalid rule paths produce rejections

---

## 11. Phase 9 — Deal Orchestration and Auto-Execution

### Objective
Turn accepted negotiations into contract-ready execution.

### Files
- Create: `backend/app/services/market_data.py`
- Create: `backend/app/services/deals.py`
- Create: `backend/app/services/execution.py`
- Create: `backend/app/api/negotiations.py`
- Create: `backend/app/api/deals.py`
- Create: `backend/tests/test_execution_policy.py`

### Responsibilities
- load merchant rules
- get market context
- run negotiation
- normalize accepted deal
- verify hard-rule compliance one last time
- create execution payload
- submit settlement transaction or prepare it for signer path

### Tasks

#### Task 9.1: Add market data abstraction
**Commit:** `feat(backend): add market data service abstraction`

#### Task 9.2: Add deal normalization service
**Commit:** `feat(backend): add negotiated deal normalization`

#### Task 9.3: Add hard-rule execution gate
**Commit:** `feat(backend): add execution policy gate`

#### Task 9.4: Add contract execution service
**Commit:** `feat(backend): add buyout settlement execution service`

#### Task 9.5: Add API routes for negotiation and deal state
**Commit:** `feat(backend): add negotiation and deal endpoints`

### Verification
- mocked accepted deal reaches execution-ready state
- rules-violating deal is blocked
- execution payload matches contract expectations

---

## 12. Phase 10 — Storefront UX

### Objective
Deliver the merchant-shop feeling without overbuilding graphics.

### Files
- Create: `frontend/app/shop/[slug]/page.tsx`
- Create: `frontend/components/storefront/merchant-frame.tsx`
- Create: `frontend/components/storefront/dialogue-panel.tsx`
- Create: `frontend/components/storefront/offer-sheet.tsx`
- Create: `frontend/components/storefront/shop-header.tsx`
- Create: `frontend/components/storefront/scene-shell.tsx`
- Create: `frontend/lib/api.ts`

### UX principles
- 2D atmospheric first
- clear ENS identity presence
- merchant portrait / counter framing
- bargain language over form language

### Tasks

#### Task 10.1: Add storefront route shell
**Commit:** `feat(frontend): add storefront route shell`

#### Task 10.2: Add merchant-themed layout components
**Commit:** `feat(frontend): add RPG-style merchant storefront framing`

#### Task 10.3: Add negotiation chat panel
**Commit:** `feat(frontend): add storefront negotiation panel`

#### Task 10.4: Add offer/counteroffer UI
**Commit:** `feat(frontend): add offer sheet and counteroffer UI`

### Verification
- merchant storefront renders from seeded shop data
- negotiation UI works end-to-end with mocked backend

---

## 13. Phase 11 — End-to-End Demo Path

### Objective
Prove a complete Base Sepolia merchant demo.

### Demo story
1. merchant connects wallet
2. merchant selects ENS identity
3. merchant stores API key
4. merchant saves rules
5. merchant publishes shop
6. seller visits storefront
7. seller negotiates token sell-off
8. agent produces acceptable discounted offer
9. deal auto-executes through contract
10. UI shows completed settlement

### Files
- Create: `backend/tests/test_demo_flow.py`
- Create: `frontend/e2e/` (if Playwright chosen)
- Create: `docs/DEMO.md`

### Tasks

#### Task 11.1: Seed a demo merchant config
**Commit:** `chore(demo): add seeded merchant demo data`

#### Task 11.2: Add backend integration demo test
**Commit:** `test(backend): add demo flow integration test`

#### Task 11.3: Add frontend e2e scenario
**Commit:** `test(frontend): add storefront e2e demo path`

#### Task 11.4: Add demo runbook
**Commit:** `docs: add base sepolia demo walkthrough`

### Verification
- full local happy-path walkthrough completes
- Base Sepolia test run succeeds with deployed contract address

---

## 14. Phase 12 — Public Launch Hygiene

### Objective
Make the repo legible for external reviewers.

### Files
- Modify: `README.md`
- Modify: `docs/API.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/pull_request_template.md`

### Tasks

#### Task 12.1: Add CI for backend + contracts + frontend checks
**Commit:** `ci: add frontend backend and foundry validation`

#### Task 12.2: Add architecture doc
**Commit:** `docs: add architecture walkthrough`

#### Task 12.3: Expand README for public verification
**Commit:** `docs: add setup verification and demo guidance`

#### Task 12.4: Add PR template reinforcing small commits
**Commit:** `chore: add public repo PR template`

### Verification
- CI passes
- clean clone instructions work
- docs are sufficient for third-party review

---

## 15. Suggested Execution Order by Real Milestones

### Milestone A — Public skeleton
Includes:
- Phase 1
- Phase 2

### Milestone B — Deal foundation
Includes:
- Phase 3
- Phase 4
- Phase 5

### Milestone C — Merchant setup
Includes:
- Phase 6
- Phase 7

### Milestone D — Agent intelligence
Includes:
- Phase 8
- Phase 9

### Milestone E — Demoable product
Includes:
- Phase 10
- Phase 11
- Phase 12

---

## 16. Commands Reference

### Frontend
```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest -q
alembic upgrade head
```

### Contracts
```bash
cd contracts
forge build
forge test -vv
forge script script/DeployBuyoutSettlement.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

---

## 17. Immediate First Commits Recommended

If starting execution now, use this exact opening sequence:

1. `docs: replace placeholder readme with public project overview`
2. `docs: add MIT license`
3. `docs: update state doc for buyout-first ENS MVP`
4. `feat(frontend): scaffold nextjs storefront app shell`
5. `feat(backend): scaffold fastapi service shell`
6. `test(backend): add health endpoint smoke test`
7. `test(contracts): add failing buyout lifecycle tests`
8. `feat(contracts): add buyout settlement contract`

This gives a clean public progression with visible momentum and minimal oversized diffs.

---

## 18. Definition of Done for MVP

Pawn Agent MVP is done when:
- a merchant can connect wallet and select ENS identity
- merchant can save encrypted LLM credentials
- merchant can configure buyout rules in UI
- a storefront exists with merchant-shop presentation
- a seller can negotiate with the AI merchant
- accepted deals are normalized and checked against hard rules
- compliant deals auto-execute on Base Sepolia
- the public repo contains enough docs/tests for third-party verification

---

## 19. Source of Truth Note

This file is the implementation source of truth derived from `docs/DESIGN.md`.

If implementation decisions conflict with the design doc, update the design doc first or explicitly record the reason in `docs/STATE.md` before proceeding.
