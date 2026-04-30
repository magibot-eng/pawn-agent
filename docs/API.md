# Pawn Agent API Surface

> Current-state API reference for the active prototype.
> This is no longer just a planning stub.

---

## 1. Purpose

The backend currently supports:
- shop creation and editing
- ENS-linked shop records
- wallet-bound shop records via `owner_address`
- encrypted LLM provider-key management
- negotiation session persistence
- persisted structured negotiation summaries
- live merchant chat with graceful fallback behavior
- early deal/execution record endpoints

---

## 2. Verified Live Endpoints

These were verified during the 2026-04-30 audit.

### Health
- `GET /health`
  - returns service heartbeat
  - verified `200 OK`

### Provider Keys
- `POST /shops/{shop_id}/provider-keys`
  - saves an encrypted provider key
  - verified `201 Created`
- `GET /shops/{shop_id}/provider-keys`
  - lists stored provider keys without returning plaintext

### Shops
- `POST /shops`
- `GET /shops`
- `GET /shops/{shop_id}`
- `PATCH /shops/{shop_id}`
- `POST /shops/{shop_id}/ens-identities`
- `GET /shops/{shop_id}/ens-identities`

Frontend currently uses `GET /shops?owner_address=...&ens_name=...` as the minimal wallet + ENS storefront binding lookup.

### Negotiations
- `POST /negotiations`
- `GET /negotiations/{negotiation_id}`
- `PATCH /negotiations/{negotiation_id}`
- `GET /negotiations/by-shop/{shop_id}`
- `POST /negotiations/{negotiation_id}/chat`

### Deals / Executions
- `POST /deals/offers`
- `GET /deals/offers/{offer_id}`
- `PATCH /deals/offers/{offer_id}`
- `GET /deals/offers/by-shop/{shop_id}`
- `GET /deals/offers/by-chain-deal-id/{chain_deal_id}`
- `GET /deals/executions/{execution_id}`
- `GET /deals/executions/by-offer/{offer_id}`

---

## 3. Current Behavior Notes

### Provider-key save behavior
- plaintext key is submitted as `encrypted_key` in the current prototype payload shape
- backend encrypts it before persistence
- API responses never return the encrypted blob or plaintext key
- saving a new active key deactivates prior active keys for the same shop

### Chat runtime behavior
`POST /negotiations/{negotiation_id}/chat` can currently return these response modes:
- `live_llm`
- `scripted_fallback`
- `provider_error_fallback`

The chat response also returns a persisted `negotiation_state` summary object.

Frontend also models:
- `demo_disconnected`

### Fallback rules
If no active provider key exists:
- backend returns a scripted merchant reply

If a provider key exists but fails to decrypt or the provider call fails:
- backend returns a scripted merchant reply
- response marks the provider error/fallback mode

---

## 4. Important Schema Notes

### Shop model currently stores plain-language merchant config fields
Examples:
- `merchant_persona`
- `buying_preferences`
- `pricing_style`
- `refusal_rules`
- `welcome_message`

These are useful for the prototype UI but are not yet a normalized rules system.

### Negotiation session model currently stores
- seller address
- input token
- input amount
- serialized `chat_log`
- optional `outcome`
- optional `negotiation_state` summary object
- optional `agreed_payout`
- settled flag
- optional error message

### Deal / execution layer
The deal and execution routes are early persistence scaffolds. They exist in the backend, but the full buyout lifecycle is not yet wired from negotiation → offer → settlement.

---

## 5. Near-Term API Gaps

Highest-value missing additions:
- rule validation endpoints for normalized merchant policy
- explicit accept/reject/offer-generation flow from chat outcomes
- execution submission/status flow tied to real Base Sepolia contract logic
- ENS verification/resolution endpoints backed by actual chain data

---

## 6. Suggested Next API Slice

Turn the persisted `negotiation_state` summary into explicit workflow.

Possible next steps:
1. create a backend path that converts a negotiation into a `DealOffer`
2. let `next_action` become machine-readable workflow state instead of display-only text
3. add structured merchant-rule validation that constrains quote generation

---

## 7. Security Principles

The backend should continue to enforce:
- never returning plaintext provider keys
- encrypting provider keys at rest
- merchant-rule checks server-side before future execution
- explicit fallback behavior when providers fail
- auditable IDs and state transitions for negotiations, offers, and execution attempts
