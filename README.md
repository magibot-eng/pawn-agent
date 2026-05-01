# Pawn Agent

ENS-native AI token buyout storefronts on Base Sepolia.

Pawn Agent lets an ENS holder launch a configurable AI-powered token buyout shop, define merchant behavior, connect an LLM provider key, provision a separate merchant wallet, and publish a storefront where sellers negotiate discounted token exits with an autonomous merchant agent.

## Status

- **Phase:** Active hackathon MVP prototype
- **MVP chain:** Base Sepolia
- **Product model:** Buyout-first, not collateralized lending first
- **Current reality:** frontend + backend prototype is live in production and locally; contracts are still incomplete relative to the full long-term vision
- **Live frontend:** `https://pawn.solovibing.com`
- **Live backend:** `https://edhmvxs8fi.us-east-1.awsapprunner.com`
- **Real settlement path today:** accepted quotes can submit **live Base Sepolia ETH** payouts through a CDP Agentic Wallet (`awal`) flow when the merchant wallet is live-authenticated and funded with faucet ETH

## What Exists Today

Pawn Agent is already beyond planning. The current repo supports a real prototype loop for:

- wallet-first storefront setup
- ENS-tied store identity using detected primary ENS or manual `.eth` route input
- owner-side merchant configuration
- encrypted provider-key save/list/test flow
- separate managed merchant wallet provisioning
- storefront chat page at `/shop/[ens]`
- seller ↔ merchant negotiation with live LLM or fallback behavior
- quote presentation in the storefront UI
- quote acceptance from the storefront
- execution/deal record creation
- **real Base Sepolia ETH submission** for accepted quotes through the live merchant wallet path

This is enough for a meaningful end-to-end MVP demo, but it is **not yet** a complete production buyout product.

## What Pawn Agent Is

Pawn Agent is an **ENS-branded autonomous token buyout platform**.

Each merchant can:
- connect an owner wallet
- resolve a primary ENS name from that wallet when available
- create a shop tied to that ENS identity
- optionally override the storefront route with a manual `.eth` name
- define merchant behavior and hard buyout preferences
- store an encrypted LLM provider key
- provision a separate merchant wallet for automated settlement
- publish a storefront
- let the AI merchant negotiate within merchant boundaries

Each seller can:
- visit a storefront
- negotiate a discounted exit for a token position
- receive a quote
- accept or counter the quote
- trigger settlement submission when the merchant wallet is live and funded

## Current Product Flow

### 1. Setup / create store
On the home page:
1. connect the **owner wallet**
2. choose the `.eth` route for the store
3. let the backend verify the route and create or load the shop

This creates a shop record tied to:
- `owner_address`
- `ens_name`
- backend-authored ENS verification state

At this stage the merchant wallet is still unprovisioned.

### 2. Owner dashboard
On `/owner`:
1. edit merchant persona / buying preferences / pricing style / refusal rules / welcome line
2. save a provider key
3. test the provider key
4. provision the merchant wallet

Important distinction:
- the **owner wallet** is the admin wallet
- the **merchant wallet** is the operational wallet used for automated settlement

### 3. Storefront chat
On `/shop/[ens]`:
1. the app loads the shop by ENS route
2. it creates or reuses a negotiation session
3. seller messages go to the backend merchant runtime
4. the UI shows:
   - chat history
   - runtime mode (`live_llm`, `scripted_fallback`, `provider_error_fallback`, or local demo/disconnected state)
   - structured negotiation summary
   - active quote card when present

### 4. Quote acceptance
When a quote is shown, the seller can:
- **Accept**
- **Counter**

Accepting a quote currently:
1. validates the negotiation and merchant wallet state
2. creates a `DealOffer`
3. creates an `Execution`
4. marks the negotiation accepted / settled
5. if the merchant wallet is live, submits a **real Base Sepolia ETH** transfer through `awal send`
6. returns execution state + tx hash back to the storefront UI

## What Is Testable Right Now

### A. UI / owner / storefront flow
You can test:
- connect wallet
- create or load a shop
- open owner dashboard
- edit merchant settings
- save/test provider key
- open storefront chat
- negotiate with merchant
- see quote / negotiation state / execution state in UI

### B. Real settlement flow
You can also test a meaningful real settlement path now:
1. create/load shop
2. provision merchant wallet
3. negotiate a quote
4. accept the quote
5. see:
   - deal created
   - execution created
   - negotiation marked accepted/settled
   - tx hash returned
   - Base Sepolia settlement status shown in the storefront

## Real Base Sepolia Settlement Requirements

For real settlement to work today, **all** of these must be true:

1. backend is running
2. frontend is running
3. merchant wallet is provisioned in **live** mode, not stub mode
4. `awal` is authenticated locally
5. the merchant wallet has **Base Sepolia faucet ETH**
6. the payout quote is in **ETH**

### Current settlement constraints
- **Chain:** Base Sepolia only
- **Asset:** ETH payouts only for the live path
- **Wallet mode:** live `cdpwa_live_*` wallet required
- **Funding source:** faucet ETH is expected for testing

If the wallet is still stubbed or unfunded, the product flow is still usable, but real settlement submission will fail.

## Local Run Instructions

### Backend
From `backend/`:

```bash
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
From `frontend/`:

```bash
npm run build
PORT=3011 npm run start
```

Typical local URLs:
- frontend: `http://localhost:3011/`
- backend: `http://localhost:8000/`

On LAN, the frontend can be loaded from another device, e.g.:
- `http://<your-local-ip>:3011/`

### Frontend/backend connection model
The frontend defaults to same-origin `/api` calls and uses a Next.js rewrite proxy to forward to the backend.

Local rewrite target default:
- `http://127.0.0.1:8000`

Production rewrite target:
- `BACKEND_BASE_URL=https://edhmvxs8fi.us-east-1.awsapprunner.com`

So if you change backend host/port behavior, keep `frontend/next.config.ts` and the deployed `BACKEND_BASE_URL` env aligned.

## Suggested End-to-End Test Script

### Test 1: happy-path shop creation
1. open the frontend
2. connect wallet
3. enter a `.eth` route
4. create the store
5. confirm owner dashboard opens successfully

### Test 2: provider + merchant runtime
1. save an LLM provider key
2. run active-key test
3. go to storefront
4. send a seller message
5. confirm merchant responds and runtime badge reflects the right mode

### Test 3: live settlement path
1. ensure `awal` is authenticated
2. provision or re-provision merchant wallet from owner page
3. verify wallet is **live**, not stub
4. fund the merchant wallet with Base Sepolia faucet ETH
5. negotiate or present an **ETH** quote
   - example: `0.0001 ETH`
6. click **Accept**
7. verify:
   - execution state is returned
   - tx hash appears
   - payout sent shows in ETH
   - negotiation is marked settled

## Known Current Limitations

This repo is still an MVP prototype. Important limitations:

- contracts are not yet the source of truth for the full buyout lifecycle
- rule system is still mostly plain-language config, not fully normalized policy logic
- settlement path currently targets **ETH only** on Base Sepolia for real execution
- execution lifecycle does not yet provide robust post-submit confirmation tracking/polling
- ENS route claims and forward resolution are now enforced server-side, but reverse-record/subdomain handling is not fully hardened yet
- the current prototype is local-first and operationally coupled to the machine running `awal`
- wallet-library builds still emit warnings/noisy logs around MetaMask async-storage, `pino-pretty`, and Web3Modal/Reown fallback config, even though production builds complete successfully
- seller chat session continuity is browser-session scoped on the storefront route; the app avoids putting raw negotiation IDs into the public URL

## Deployment Notes

### Current production surfaces
- frontend: `https://pawn.solovibing.com`
- backend: `https://edhmvxs8fi.us-east-1.awsapprunner.com`
- frontend proxy health: `https://pawn.solovibing.com/api/health`

### App Runner image architecture gotcha
If you deploy the backend from Apple Silicon, do **not** push a default Mac-built image and assume App Runner will accept it.

The working production path used here was:
- build and push the backend image as `linux/amd64`
- then create/update the App Runner service from that image

Example:
```bash
docker buildx build --platform linux/amd64 \
  -t 047719626550.dkr.ecr.us-east-1.amazonaws.com/pawn-agent-backend:latest \
  --push .
```

The earlier `linux/arm64` image created from this Mac caused App Runner service creation to fail.

## What Is Not Done Yet

Out of scope / not complete yet:
- NFT collateral support
- collateralized lending as the main product
- cross-chain support
- generalized multi-agent systems
- production-grade liquidation routing
- full contract-backed lifecycle replacing all app-level orchestration
- hardened execution safety policy / confirmation monitoring / retries

## Repo Shape

- `frontend/` — Next.js storefront and owner UI prototype
- `backend/` — FastAPI app for shop config, encrypted secrets, negotiation, wallet flow, and settlement records
- `contracts/` — Foundry contract area, still incomplete relative to the current MVP shell
- `config/` — rules/config examples
- `docs/` — design, implementation, API, and state docs

## Source of Truth

If docs drift, use this order:
1. `docs/DESIGN.md`
2. `docs/STATE.md`
3. `docs/API.md`
4. `TASKS.md`
5. `ROADMAP.md`
6. codebase

## Important Notes for Reviewers

- this repo is intended to remain **public** and **open source**
- the most trustworthy current surface is the **frontend/backend prototype loop**, not the older contract-first scaffolds
- some files under `contracts/`, `config/`, and older root-level planning docs may reflect earlier exploratory architecture and should be read as legacy scaffolds where they conflict with the current implemented flow

## Current Recommended Next Step

The highest-value next slice after the current ENS-backed route work is:
- **refine the actual trade experience, AI shopkeeper behavior, and UI polish**

That means improving:
- seller → merchant negotiation flow
- quote / counter / accept interaction clarity
- the feel and consistency of the merchant persona in the live trade loop
