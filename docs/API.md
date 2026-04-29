# Pawn Agent API Surface

> Planning document for the backend API.
> 
> This file is intentionally high-level in the early repo phase. Endpoints and payloads should be refined as backend scaffolding begins.

---

## 1. Purpose

The backend API is expected to support:
- merchant onboarding
- ENS-linked shop creation
- encrypted LLM provider key management
- merchant rules storage and retrieval
- negotiation session handling
- structured deal creation and tracking
- execution orchestration for Base Sepolia settlement

---

## 2. Planned Endpoint Groups

### Health / Service Info
- `GET /health`
- `GET /version`

### Shops / Merchant Onboarding
- `POST /shops`
- `GET /shops/{shop_id}`
- `PATCH /shops/{shop_id}`
- `GET /shops/by-ens/{ens_name}`

### ENS Identity
- `POST /ens/resolve`
- `POST /ens/verify-ownership`
- `GET /shops/{shop_id}/ens`

### Provider Keys
- `POST /shops/{shop_id}/provider-keys`
- `PATCH /shops/{shop_id}/provider-keys/{provider}`
- `DELETE /shops/{shop_id}/provider-keys/{provider}`
- `GET /shops/{shop_id}/provider-keys`

### Merchant Rules
- `GET /shops/{shop_id}/rules`
- `PUT /shops/{shop_id}/rules`
- `POST /shops/{shop_id}/rules/validate`

### Negotiation
- `POST /shops/{shop_id}/negotiations`
- `POST /shops/{shop_id}/negotiations/{session_id}/message`
- `GET /shops/{shop_id}/negotiations/{session_id}`
- `POST /shops/{shop_id}/negotiations/{session_id}/close`

### Deals
- `POST /shops/{shop_id}/deals`
- `GET /shops/{shop_id}/deals/{deal_id}`
- `GET /shops/{shop_id}/deals`
- `POST /shops/{shop_id}/deals/{deal_id}/cancel`

### Execution
- `POST /shops/{shop_id}/deals/{deal_id}/execute`
- `GET /shops/{shop_id}/executions/{execution_id}`

---

## 3. Response Principles

The API should prefer:
- explicit structured JSON
- stable IDs for shops, negotiations, deals, and executions
- machine-readable validation errors
- predictable deal status transitions

---

## 4. Security Principles

The API must:
- never return plaintext LLM API keys after save
- separate merchant configuration from execution state
- validate all hard-rule execution paths server-side
- record enough metadata to audit deal creation and execution

---

## 5. Notes

This file is a planning skeleton, not a frozen contract.

As backend scaffolding is implemented, update this file in small commits so public API intent remains easy to track on GitHub.
