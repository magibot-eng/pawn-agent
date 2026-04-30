# Pawn Agent — Project State

**Status:** Active Hackathon MVP | Frontend/Backend Prototype Live | Contracts Incomplete
**Last Updated:** 2026-04-30
**Verification baseline:** local audit + passing backend tests + passing frontend build before this feature push

## Executive Summary
Pawn Agent is no longer in a planning-only state.

The current repo already supports a real prototype loop:
- connect a wallet and detect a primary ENS name when available
- override with a manual ENS/subdomain for storefront identity
- create/load a wallet-bound store
- edit merchant-facing shop settings
- save encrypted provider API keys
- open a dedicated storefront chat page by ENS route
- chat with the merchant runtime
- inspect a structured negotiation summary beside the chat
- visibly distinguish live LLM, scripted fallback, provider-error fallback, and disconnected demo mode

This is enough for a convincing hackathon MVP demo shell, but not enough for a complete buyout product yet.

## Verified During This Audit
Read-only/runtime checks performed on 2026-04-30:
- `backend`: `python -m pytest -q` → **1 passed**
- fresh Uvicorn boot on temp port → `/health` returned **200**
- fresh `POST /shops/{shop_id}/provider-keys` → **201 Created**
- local SQLite state confirmed existing shops, provider keys, and negotiation sessions

Important note:
- the reported ASGI crash was caused by an **older runtime instance** using the bad `AESGCM.encrypt(..., aad=None)` call shape
- current checked-in `backend/app/crypto/encryption.py` already uses the corrected call and the route now works live

## What Is Implemented

### Frontend
- `frontend/app/page.tsx`
  - wallet-first storefront setup
  - detects primary ENS from connected wallet when available
  - accepts manual ENS/subdomain override
  - creates/loads stores bound to `owner_address + ens_name`
- `frontend/app/owner/page.tsx`
  - dedicated owner dashboard
  - loads the selected wallet/ENS-bound store
  - edits merchant persona, buying preferences, pricing posture, refusal rules, welcome line
  - saves provider keys
- `frontend/app/shop/[ens]/page.tsx`
  - dedicated storefront chat page
  - loads a shop by ENS route
  - creates/loads a negotiation session for that storefront
- `frontend/components/MerchantChat.tsx`
  - loads persisted chat history
  - sends seller messages to backend chat route
  - displays runtime badge for:
    - `demo_disconnected`
    - `scripted_fallback`
    - `live_llm`
    - `provider_error_fallback`
  - shows a structured negotiation summary panel beside the chat

### Backend
- `backend/app/main.py`
  - FastAPI app, CORS, DB startup init, `/health`
- `backend/app/api/shops.py`
  - create/list/get/update shop
  - add/list ENS identities
- `backend/app/api/provider_keys.py`
  - save/list encrypted provider keys
- `backend/app/api/negotiations.py`
  - create/get/update negotiation session
  - list sessions by shop
  - seller chat endpoint
  - returns persisted structured negotiation state in chat/session responses
- `backend/app/api/deals.py`
  - early deal/execution record endpoints exist
- `backend/app/services/negotiations.py`
  - loads shop + active provider key
  - decrypts provider key when present
  - calls provider runtime when available
  - falls back gracefully to scripted merchant text on provider/decryption failure
  - derives a compact structured negotiation summary after each seller message
- `backend/app/crypto/encryption.py`
  - AES-256-GCM encryption/decryption with debug/dev fallback master key
- `backend/app/db.py`
  - SQLite async engine
  - startup table creation
  - lightweight shop-column migration helper

### Persistence Model
Current DB-backed entities include:
- shops
- shop ENS identities
- provider keys
- negotiation sessions
- deal offers
- execution records

## What Is Not Done Yet
- rule schema normalization beyond freeform text fields
- turning chat outcomes into explicit deal offers automatically
- contract-backed buyout settlement flow wired end-to-end
- production-grade ENS ownership verification/onchain integration
- serious backend test coverage
- updated implementation plan reflecting current actual milestone order

## Reality vs Older Docs
The following older statements are no longer true and should not be repeated:
- "execution not started"
- "backend scaffold not created"
- "encrypted API key storage not implemented"

The repo is now in **prototype implementation** phase, not planning phase.

## Recommended Next Slice
**Turn structured negotiation state into actual workflow.**

Best follow-ups:
1. convert accepted negotiation states into `DealOffer` records
2. define normalized merchant-rule schema
3. make `next_action` drive explicit seller/merchant workflow transitions

## Secondary Follow-Up Slice
After structured negotiation state:
1. define normalized merchant-rule schema
2. convert accepted negotiation states into `DealOffer` records
3. connect offer acceptance to contract/execution planning

## Source of Truth Order
When resuming work, use this order:
1. `docs/DESIGN.md`
2. `PROJECT.md`
3. `docs/STATE.md`
4. `TASKS.md`
5. `ROADMAP.md`
6. codebase

## Notes for Future Mira / Arie Resume
- treat `contracts/` as incomplete/legacy relative to the current MVP shell
- current most trustworthy product surface is the frontend/backend demo loop, not the old execution plan ordering
- keep commits single-concern and push immediately because the repo is public hackathon-facing
- check `git status` before commit because scope discipline matters more than speed here
