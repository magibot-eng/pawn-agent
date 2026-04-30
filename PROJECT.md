# Pawn Agent — Project Brief

## One-line summary
ENS-native AI token buyout storefronts on Base Sepolia.

## What this project is
Pawn Agent lets an ENS holder run a merchant-style storefront where sellers negotiate token exits with an AI shopkeeper operating inside merchant-configured rules.

For the current hackathon MVP, the most real part of the product is the frontend/backend prototype loop:
- configure a shop
- save a provider key
- open a negotiation session
- chat with the merchant runtime
- see whether the reply came from live AI or fallback mode

## Current product posture
- ENS-first
- buyout-first
- ERC-20 only
- Base Sepolia targeted
- merchant-owned AI behavior
- public/open-source build discipline

## Current code reality
The repo already has:
- Next.js frontend prototype
- FastAPI backend prototype
- encrypted provider-key persistence
- negotiation-session persistence
- live/fallback merchant chat runtime states

The repo does **not** yet have:
- complete rules engine
- complete offer-generation workflow
- end-to-end contract-backed settlement
- strong automated test coverage

## Canonical source-of-truth files
Read in this order when resuming:
1. `docs/DESIGN.md`
2. `docs/STATE.md`
3. `TASKS.md`
4. `ROADMAP.md`
5. `docs/API.md`

## Current recommended next step
Implement structured negotiation state extraction + UI display.

Reason:
- fastest visible product improvement
- turns the chat into a workflow
- creates the bridge to offer creation and settlement

## Commit discipline
This repo is public-facing.

Rules:
- one concern per commit
- push each scoped commit immediately
- do not batch unrelated cleanup with feature work
- check `git status` before committing
- keep `contracts/lib/` assumptions in mind if Foundry deps are later added/untracked

## Resume note
If a session dies, resume from `TASKS.md` first. It should reflect the current “do next” stack better than older planning docs.
