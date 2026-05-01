# Pawn Agent

**ENS-native AI token buyout storefronts on Base Sepolia.**

Pawn Agent lets an ENS holder launch a configurable AI-powered token buyout shop, define merchant behavior, connect an LLM provider key, provision a separate merchant wallet, and publish a storefront where sellers negotiate discounted token exits with an autonomous merchant agent.

---

## What Pawn Agent Is

Each **merchant** can:
- connect an owner wallet
- resolve a primary ENS name from that wallet
- create a shop tied to that ENS identity
- define merchant behavior, pricing style, and refusal rules
- store an encrypted LLM provider key
- provision a separate merchant wallet for automated settlement
- publish a storefront where the AI merchant negotiates within configured boundaries

Each **seller** can:
- visit a storefront by ENS name
- negotiate a discounted exit for a token position
- receive a quote and accept or counter it
- trigger on-chain settlement when the merchant wallet is funded

---

## Architecture

```
frontend/          Next.js storefront and owner UI
backend/           FastAPI: shop config, encrypted secrets, negotiation, wallet flow, settlement
contracts/         Foundry contracts (in progress)
config/            Merchant rule / behavior configuration examples
docs/              Design and API documentation
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- [Foundry](https://getfoundry.sh/) (for contract work)
- A browser with a Web3 wallet (MetaMask, Coinbase Wallet, etc.)
- An ENS name you control
- An LLM provider API key (OpenAI, Anthropic, or OpenRouter)
- Base Sepolia ETH for testing

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run build
PORT=3011 npm run start
```

Open `http://localhost:3011` and connect your wallet.

---

## Product Flow

### 1. Create a shop
1. Connect your wallet
2. Enter your `.eth` name (or let the app detect your primary ENS)
3. The backend verifies ENS ownership and creates the shop

### 2. Configure the merchant
On the owner dashboard:
1. Set the merchant persona, pricing style, and refusal rules
2. Save and test an LLM provider key
3. Provision a separate merchant wallet for settlement

### 3. Open the storefront
Your shop is live at `/shop/<ens>`. Sellers can:
- Open the storefront and start a negotiation
- Chat with the AI merchant (live LLM or scripted fallback)
- Receive structured quotes and decide to accept or counter

### 4. Settle
When a quote is accepted and the merchant wallet is funded, the settlement transaction is submitted on-chain.

---

## Supported Chains and Assets

| | |
|---|---|
| **Chain** | Base Sepolia (testnet) |
| **Payout asset** | ETH |
| **Supported tokens** | ERC-20 |
| **Collateral** | Not yet — MVP focuses on buyout-first flow |

---

## Current Status

Pawn Agent is an **active MVP prototype**. The core loop — shop creation, negotiation, quote, and on-chain settlement — is functional, but the product is not yet production-complete.

**What's working:**
- ENS-tied shop identity with server-side ownership verification
- Merchant configuration and provider key management
- Seller ↔ merchant negotiation with live LLM or scripted fallback
- Quote presentation, counter, and accept flow
- On-chain ETH settlement when merchant wallet is funded

**Not yet implemented:**
- NFT collateral support
- Collateralized lending
- Cross-chain support
- Generalized multi-agent systems
- Full contract-backed lifecycle (app-level orchestration handles the MVP loop)
- Production-grade post-submit confirmation tracking

---

## Docs

| | |
|---|---|
| `docs/DESIGN.md` | Product design and goals |
| `docs/API.md` | Backend API reference |

For internal state and execution tracking, see the project's internal documentation.

---

## Contributing

See `CONTRIBUTING.md` for guidelines.

---

## License

Open source. See individual module licenses.
