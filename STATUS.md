# Pawn Agent — Status

## Overall: **active**

## Current Phase
Hackathon MVP is in active implementation.

The repo is no longer at planning-only stage. It now contains a working frontend/backend prototype for:
- owner-side shop configuration
- persisted encrypted provider-key storage
- seller-side merchant chat
- structured negotiation state extraction and display
- runtime-status visibility for live AI vs fallback behavior

**Verified in local audit before this feature slice:**
- backend `/health` boots and returns `200`
- `POST /shops/{shop_id}/provider-keys` returns `201 Created`
- backend tests pass (`python -m pytest -q` in `backend/`)
- frontend build passes (`npm run build` in `frontend/`)

## Product Direction
Pawn Agent is an **ENS-native AI token buyout storefront** on **Base Sepolia**.

The MVP remains:
- ENS prize focused
- buyout-first, not collateralized lending first
- ERC-20 only
- root ENS name as canonical merchant identity
- optional subdomain support later
- encrypted LLM provider-key storage
- merchant-configured AI behavior within hard rules
- lightweight immersive storefront UI

## What Exists Now
| Component | Status | Notes |
|-----------|--------|-------|
| `frontend/` | ✅ Working prototype | Seller storefront + owner setup screens exist |
| `frontend/app/page.tsx` | ✅ Implemented | Combined owner-config + live merchant chat demo surface |
| `frontend/app/owner/page.tsx` | ✅ Implemented | Dedicated owner dashboard for shop fields + provider-key save |
| `frontend/components/MerchantChat.tsx` | ✅ Implemented | Shows runtime mode and a live negotiation-state panel beside chat |
| `backend/app/main.py` | ✅ Implemented | FastAPI app boots, initializes DB, serves `/health` |
| `backend/app/api/shops.py` | ✅ Implemented | Shop CRUD + ENS identity subresource |
| `backend/app/api/provider_keys.py` | ✅ Implemented | Encrypted provider-key save/list endpoints |
| `backend/app/api/negotiations.py` | ✅ Implemented | Negotiation sessions + live chat endpoint |
| `backend/app/api/deals.py` | ⚠️ Early scaffold | Deal/execution records exist, not yet wired into full buyout lifecycle |
| `backend/app/crypto/encryption.py` | ✅ Working | AES-256-GCM save path verified live |
| `docs/DESIGN.md` | ✅ Canonical | Product/design source of truth |
| `docs/IMPLEMENTATION_PLAN.md` | ⚠️ Partially stale | Still useful, but phase ordering now lags actual implementation reality |
| `docs/STATE.md` | ✅ Updated | Current implementation snapshot |
| `docs/API.md` | ✅ Updated | Current implemented API + near-term gaps |
| `contracts/` | ⚠️ Legacy / incomplete | Buyout settlement contract still not the active MVP path |

## Main Gaps
The prototype exists, but the MVP is not feature-complete yet.

Highest-value missing pieces:
1. real merchant rules schema instead of mostly text fields
2. buyout-offer creation from negotiation outcomes
3. execution path from accepted deal to contract settlement
4. stronger tests across provider-key save/chat fallback/runtime-state paths
5. contract-side buyout settlement redesign for Base Sepolia

## Next Recommended Step
Turn the structured negotiation summary into actual product flow.

Best follow-up options:
- convert accepted negotiation states into `DealOffer` records
- normalize merchant rules beyond freeform text
- make the "next action" state drive explicit seller/merchant workflow transitions

## Resume Point
If resuming from scratch, start here:
1. Read `README.md`
2. Read `PROJECT.md`
3. Read `docs/STATE.md`
4. Read `TASKS.md`
5. Then continue with the first unchecked item under "Now / Next"
