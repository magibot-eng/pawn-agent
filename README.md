# Pawn Agent

ENS-native AI token buyout storefronts on Base Sepolia.

Pawn Agent lets an ENS holder launch a configurable AI-powered token buyout shop, define hard buyout rules, securely connect an LLM API key, and publish a storefront where sellers negotiate discounted token exits with an autonomous merchant agent.

## Status

- **Phase:** Design locked, implementation planning complete
- **Execution:** Not started
- **Prize focus:** ENS only
- **MVP chain:** Base Sepolia
- **Product model:** Buyout-first, not collateralized lending first

See:
- `docs/DESIGN.md` — canonical product design source of truth
- `docs/IMPLEMENTATION_PLAN.md` — canonical implementation roadmap
- `docs/STATE.md` — current project-state summary
- `STATUS.md` — top-level snapshot

## What Pawn Agent Is

Pawn Agent is an **ENS-branded autonomous token buyout platform**.

Each merchant can:
- connect a wallet
- prove ownership of a root ENS name
- create a shop tied to that ENS identity
- optionally add a shop subdomain later
- define hard buyout rules and negotiation preferences
- store an encrypted LLM provider key
- launch a merchant-style storefront
- let the AI merchant negotiate and auto-execute compliant deals

Each seller can:
- visit a storefront
- negotiate a discounted exit for a token position
- accept or reject the merchant's offer
- complete settlement onchain

## MVP Scope

The MVP is intentionally narrow.

### In scope
- ENS-first merchant identity
- Base Sepolia only
- ERC-20 only
- buyout-first merchant flow
- persisted encrypted LLM API key storage
- autonomous execution inside hard merchant rules
- lightweight immersive storefront UI

### Out of scope for MVP
- NFT collateral support
- collateralized lending lifecycle as the main product
- cross-chain support
- generalized multi-agent systems
- production-grade liquidation routing

## Core Product Thesis

Pawn Agent turns an ENS name into a persistent onchain merchant identity.

The differentiator is not just AI plus DeFi. It is the combination of:
- ENS identity
- merchant-configured autonomy
- an immersive storefront experience
- rule-bounded AI negotiation
- onchain settlement on Base Sepolia

## Identity Model

### Canonical identity
The merchant's **root ENS name** is the canonical shop identity.

Example:
- `ted.eth` is the merchant identity
- the storefront and agent are associated with `ted.eth`

### Optional subdomain support
Shop-specific naming like:
- `pawn.ted.eth`
- `shop.ted.eth`

may be added as an enhancement.

Durin / Namestone is treated as an **optional convenience layer**, not a core dependency for MVP identity.

## Merchant Configuration Model

Merchants will configure structured controls rather than open-ended prompt editing.

Expected merchant inputs include:
- desired assets
- excluded assets
- buy-side budget constraints
- target discount below visible market price
- liquidity-sensitive pricing behavior
- max exposure rules
- min/max deal size
- aggressiveness slider
- merchant tone/persona presets

The AI agent can act freely **inside** those hard rules and must reject actions **outside** them.

## LLM Provider Support

Initial supported providers:
- OpenAI
- Anthropic
- OpenRouter

API keys are intended to use **persisted encrypted server-side storage**.

For MVP, AWS is **not required**. The initial implementation can use application-level encryption with a server-side master key, with room to upgrade later to KMS or a secrets manager.

## Technical Direction

The planned repo architecture is a public monorepo with:

- `frontend/` — Next.js storefront and merchant UI
- `backend/` — FastAPI app for merchant config, encrypted secrets, rules, negotiation, and execution orchestration
- `contracts/` — Foundry contracts for Base Sepolia settlement
- `config/` — rules/config examples
- `docs/` — design, implementation, and state docs

## Repository Rules

This repo is intended to remain:
- **public**
- **open source**
- easy for third parties to inspect and verify

Development rules for this project:
- use version control from the start
- commit frequently
- keep commits small and scoped
- avoid large change dumps hidden in a few commits

## Current Repo Reality

The repo currently contains some legacy exploratory scaffolds from the earlier loan-first concept:
- `contracts/src/PawnShop.sol`
- `config/shop_rules.yaml`
- `.env.example`

These should be treated as pre-refactor scaffolds, not the final MVP architecture.

## Planned Execution Order

1. Repo hygiene and docs baseline
2. Frontend/backend scaffolding
3. Buyout settlement contract redesign
4. Merchant data model and encrypted API key storage
5. ENS onboarding
6. Rules schema and UI
7. LLM negotiation runtime
8. Deal normalization and auto-execution
9. Storefront UX
10. Base Sepolia end-to-end demo

## Local Development

Detailed setup instructions will evolve as the scaffold is built.

Planned surfaces:
- Frontend: Next.js + TypeScript
- Backend: FastAPI + Python
- Contracts: Foundry + Solidity

## Source of Truth

If this README ever drifts from the project docs, follow:
1. `docs/DESIGN.md`
2. `docs/IMPLEMENTATION_PLAN.md`
3. `docs/STATE.md`

Those files are authoritative over this summary.
