# Tech Stack

## Frontend

| Library | Purpose |
|---------|---------|
| **Next.js 15** | React framework, storefront and owner UI |
| **React 19** | UI library |
| **@rainbow-me/rainbowkit 2** | Wallet connection (MetaMask, Coinbase Wallet, etc.) |
| **wagmi 2** | Ethereum wallet and transaction hooks |
| **viem 2** | Ethereum RPC/ABI types and utilities |
| **@tanstack/react-query 5** | Server state and API data fetching |
| **@chatscope/chat-ui-kit-react** | Chat UI for negotiation interface |
| **@chatscope/chat-ui-kit-styles** | Chat UI styling |
| **framer-motion** | Animations |
| **Tailwind CSS 3** | Utility-first styling |

---

## Backend

| Library | Purpose |
|---------|---------|
| **FastAPI 0.115** | Python web framework |
| **uvicorn** | ASGI server |
| **Pydantic 2** | Data validation and settings management |
| **pydantic-settings** | Environment-based config |
| **httpx** | Async HTTP client |
| **cryptography** | Server-side LLM API key encryption at rest |
| **python-dotenv** | `.env` loading |
| **aiosqlite** | Async SQLite driver (local dev) |
| **asyncpg** | Async PostgreSQL driver (production) |
| **SQLAlchemy 2** (async) | ORM |
| **Alembic** | Database migrations |
| **pycryptodome** | Low-level cryptographic primitives for key encryption |

---

## Database

| Component | Detail |
|----------|--------|
| **SQLite** | Local dev (`sqlite+aiosqlite://`) |
| **PostgreSQL** | Production (`postgresql+asyncpg`) via AWS RDS or self-hosted |
| **ORM** | SQLAlchemy 2 async |
| **Migrations** | Alembic |

---

## Infra / Blockchain

| Component | Detail |
|----------|--------|
| **Chain** | Base Sepolia (testnet) |
| **RPC** | Alchemy (free tier) — `${BASE_SEPOLIA_RPC_URL}` |
| **Wallet / Settlement** | CDP Agentic Wallet via `npxawal` CLI; Alchemy replaces it in live wallet mode |
| **Wallet derivation** | Per-shop merchant private keys derived from `ALCHEMY_WALLET_MASTER_SEED` (32-byte hex, generated via `secrets.token_hex(32)`) |
| **CDP config** | `CDP_WALLET_CHAIN=base-sepolia`, `CDP_WALLET_LIVE_ENABLED=false` by default |
| **Settlement** | On-chain ETH transfer after quote acceptance |
| **Payout asset** | ETH only (MVP) |

---

## Smart Contracts (Foundry)

| Contract | Purpose |
|----------|---------|
| **PawnShop.sol** | Exploratory loan-era scaffold; canonical direction is buyout-first |
| **PawnToken.sol** | Token contract scaffold |
| **BuyoutSettlement.sol** | Buyout settlement logic (canonical MVP contract) |
| **OpenZeppelin** | ReentrancyGuard, ERC20, ERC721 imports |
| **Tooling** | Foundry (solc 0.8.24, optimizer enabled) |
| **RPC endpoints** | `base_sepolia`, `sepolia`, `mainnet` via foundry.toml |

---

## LLM / AI

| Component | Detail |
|----------|--------|
| **Supported providers** | OpenAI, Anthropic, OpenRouter |
| **API key storage** | Encrypted at rest using `cryptography` + server-side `MASTER_ENCRYPTION_KEY` (32-byte hex) |
| **Key delivery** | Keys decrypted at runtime only when needed for agent calls, never re-displayed after save |
| **Negotiation agent** | Master Pawn Agent prompt assembled from: system prompt + merchant config + live negotiation context; outputs structured deal objects |
| **Merchant config inputs** | Asset allowlist/excludelist, discount rules, aggressiveness, tone, max position size, liquidity thresholds |
| **Fallback** | Scripted fallback if LLM is unavailable |

---

## Deployment

| Component | Detail |
|----------|--------|
| **Backend host** | Not specified (standard Python host); runs via `uvicorn` |
| **Frontend host** | Vercel or standard Node host; `PORT=3011 npm start` |
| **Process manager** | Not explicitly specified in config; `pm2` is a reasonable convention for production |
| **CORS** | `FRONTEND_URL` + `FRONTEND_ORIGINS` env vars |
| **Secrets** | `.env` file; `MASTER_ENCRYPTION_KEY`, `ALCHEMY_API_KEY`, `ALCHEMY_WALLET_MASTER_SEED` |
| **AWS** | Not required for MVP |
| **Database** | SQLite locally, PostgreSQL RDS in production |
