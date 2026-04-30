# Pawn Agent

ENS-native AI token buyout storefronts on Base Sepolia.

Pawn Agent lets an ENS holder launch a configurable AI-powered token buyout shop, define merchant behavior, securely connect an LLM API key, and publish a storefront where sellers negotiate discounted token exits with an autonomous merchant agent.

## Status

- **Phase:** Active hackathon MVP prototype
- **Execution:** In progress
- **Prize focus:** ENS only
- **MVP chain:** Base Sepolia
- **Product model:** Buyout-first, not collateralized lending first
- **Current reality:** frontend/backend prototype live; contracts still incomplete

See:
- `PROJECT.md` — concise project brief + resume context
- `STATUS.md` — top-level snapshot
- `TASKS.md` — current next-work queue
- `ROADMAP.md` — milestone view
- `docs/DESIGN.md` — canonical product design source of truth
- `docs/STATE.md` — current implementation-state summary
- `docs/API.md` — backend API surface

## What Exists Today

The repo already includes a working prototype loop for:
- owner-side shop configuration
- encrypted provider-key save/list
- seller-side merchant chat
- runtime visibility for live AI vs fallback behavior
- persisted negotiation sessions

This means the project has moved beyond planning/scaffolding, but it is **not** yet a complete buyout product.

## What Pawn Agent Is

Pawn Agent is an **ENS-branded autonomous token buyout platform**.

Each merchant can:
- connect a wallet
- prove ownership of a root ENS name
- create a shop tied to that ENS identity
- optionally add a shop subdomain later
- define hard buyout rules and negotiation preferences
- store an encrypted LLM provider key
- launch a storefront
- let the AI merchant negotiate within merchant boundaries

Each seller can:
- visit a storefront
- negotiate a discounted exit for a token position
- accept or reject the merchant's offer
- eventually complete settlement onchain

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

## Technical Direction

The active monorepo shape is:

- `frontend/` — Next.js storefront and owner UI prototype
- `backend/` — FastAPI app for shop config, encrypted secrets, negotiation, and early deal tracking
- `contracts/` — Foundry contract area, still incomplete relative to current MVP shell
- `config/` — rules/config examples
- `docs/` — design, implementation, API, and state docs

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

The repo still contains some legacy exploratory scaffolds from the earlier loan-first concept:
- `contracts/src/PawnShop.sol`
- `config/shop_rules.yaml`
- `.env.example`

Treat these as pre-refactor scaffolds, not the final MVP architecture.

## Current Recommended Next Step

Add **structured negotiation state** to the chat flow and show it in the UI.

That is the fastest path to making the prototype feel like a product instead of just a styled conversation demo.

## Source of Truth

If docs ever drift, follow this order:
1. `docs/DESIGN.md`
2. `docs/STATE.md`
3. `TASKS.md`
4. `ROADMAP.md`
5. `docs/API.md`
