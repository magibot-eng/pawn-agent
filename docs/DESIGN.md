# Pawn Agent — Design Document

> ENS-native AI token buyout storefronts on Base Sepolia.
> 
> Merchants use an ENS identity to launch a configurable AI-powered token buyout shop, define hard buyout rules, connect an LLM API key, and let the agent negotiate and auto-execute deals within those boundaries.

---

## 1. Product Overview

### What Pawn Agent is

Pawn Agent is a platform for launching **ENS-branded autonomous token buyout shops**.

Each merchant:
- connects a wallet
- proves ownership of an ENS name
- creates a shop tied to that ENS identity
- configures buyout and negotiation rules
- provides an LLM API key
- launches a storefront where sellers negotiate with the merchant's AI pawn agent

When a negotiation reaches acceptable terms, the system prepares and submits the onchain transaction on **Base Sepolia**.

### Core product thesis

Pawn Agent turns an ENS name into a persistent onchain merchant identity.

The product is not just a DeFi lending interface. It is an ENS-native merchant experience where:
- the shop has identity
- the agent has personality
- the merchant defines the rules
- the settlement happens onchain

### Prize positioning

Pawn Agent is positioned **only for the ENS prize pool**.

We are intentionally narrowing the product story to focus on:
- ENS identity
- merchant-owned agent storefronts
- discoverable naming and branding
- agent-mediated commerce tied to ENS

We are **not** positioning the MVP around:
- Uniswap as the main narrative
- multi-track hackathon optimization
- cross-chain lending networks
- generalized swarm / agent-to-agent systems

---

## 2. MVP Goal

### MVP outcome

The MVP should let any ENS holder launch a working AI token buyout shop on **Base Sepolia**.

A successful MVP allows a merchant to:
1. connect wallet
2. verify ENS ownership
3. create a shop identity
4. securely provide an LLM API key
5. configure negotiation and asset rules
6. publish a storefront
7. let sellers negotiate with the shop agent
8. auto-execute buyout deals when terms fall within hard rules

### MVP non-goals

The MVP is **not** trying to solve:
- production-grade decentralized lending
- NFT valuation and liquidation
- fully trustless cross-chain collateral markets
- highly optimized liquidation routing
- merchantless or governance-based protocol operation

The MVP is focused on **identity, configuration, negotiation, and settlement**.

---

## 3. User Roles

### Merchant / Shop Owner
The ENS holder who launches and configures the shop.

Responsibilities:
- select ENS identity
- define accepted and excluded assets
- set discount and negotiation rules
- connect LLM API key
- publish storefront
- fund settlement wallet and operational balances as needed

### Seller
The user who visits the storefront and negotiates with the Pawn Agent.

Responsibilities:
- present a token position they want to offload
- negotiate with the merchant agent
- accept or reject final terms
- complete the onchain transaction

### Pawn Agent
The AI merchant acting on behalf of the shop owner.

Responsibilities:
- interact in a merchant-like tone
- interpret merchant policy and hard rules
- negotiate within allowed boundaries
- reject out-of-policy transactions
- produce structured deal terms
- trigger execution when a valid agreement is reached

---

## 4. ENS Identity Model

### Decision
**Canonical identity = root ENS name**

Example:
- `ted.eth` is the true merchant identity
- the shop is fundamentally associated with `ted.eth`

### Optional subdomain layer
We may optionally support a storefront subdomain such as:
- `pawn.ted.eth`
- `shop.ted.eth`

### Durin / Namestone role in MVP
We should **not** make Durin the core identity dependency.

Recommended MVP approach:
- root ENS name is the canonical identity and source of trust
- Durin / Namestone is an **optional convenience layer** for shop-specific naming, routing, or branding
- if subdomain provisioning introduces chain-specific constraints, the shop still works without it

### Why this is the best model
This gives us:
- a durable merchant identity
- flexibility across future asset or chain expansion
- a stronger ENS story
- less lock-in to a single subdomain implementation path

### ENS in the MVP should power
- merchant verification
- storefront naming
- trust and discoverability
- optional branded subdomain routing
- persistent shop identity across future versions

---

## 5. Merchant Onboarding Flow

A merchant should be able to:

1. connect wallet
2. resolve ENS names owned by that wallet
3. choose a root ENS identity for the shop
4. optionally provision a subdomain
5. choose storefront name / theme
6. input LLM provider and API key
7. define hard rules and negotiation preferences
8. review generated shop profile
9. publish the shop

### Merchant onboarding outcome
After setup, the merchant should have:
- an ENS-linked shop record
- encrypted LLM credentials stored for reuse
- a rules config
- a storefront persona
- a live shop page ready for customers

---

## 6. Storefront Experience

### Experience goal
The storefront should feel like a **merchant shop in a first-person PC RPG**, not a generic SaaS dashboard.

### MVP fidelity decision
For MVP, we should choose **the easiest surface that still conveys the RPG merchant feeling**.

That means:
- **2D atmospheric interface first**
- pseudo-3D or more advanced scene work can come later

### MVP visual direction
The storefront should feel like:
- a place
- a counter
- a merchant interaction point
- a shop with mood and personality

Good UI ingredients:
- layered environment art or styled backdrop
- merchant portrait or shopkeeper framing
- dialogue panel for negotiation
- in-world looking offer / counteroffer panels
- visible ENS branding on the storefront

Avoid:
- generic crypto dashboard layouts
- default card-grid UI as the main emotional layer
- generic chatbot assistant styling

### UX principle
The customer should feel like they are **walking up to a merchant and bargaining**, not filling out a form for a pricing engine.

---

## 7. Asset and Market Scope

### Chain decision
**Base Sepolia only** for MVP.

### Asset scope decision
MVP asset support should be based on **what we can practically source from faucets and demo liquidity**, with the allowlist expanding over time.

### Collateral scope for MVP
- ERC-20 only
- no NFTs in MVP
- merchant can choose accepted assets from a supported test asset list
- merchant can also specify assets to exclude

### Practical asset strategy
Start with:
- the test tokens we can reliably obtain on Base Sepolia
- a small but usable set for demos
- expandable allowlist without redesigning the platform

### Why this is the right approach
This avoids blocking the product design on perfect token coverage. The MVP should be built so more test assets can be added incrementally.

---

## 8. LLM Provider Support and API Key Storage

### Supported providers for MVP
Recommended initial provider list:
- OpenAI
- Anthropic
- OpenRouter

Optional later:
- Ollama / local endpoint
- Gemini
- other OpenAI-compatible providers

### Storage decision
**Persisted encrypted storage is required for MVP.**

Reason:
- the shop is meant to be a persistent merchant service
- re-entering API keys every session is too fragile
- merchants need a reusable configuration layer

### MVP storage model
For MVP:
- API keys are encrypted at rest server-side
- API keys are tied to the merchant's shop record
- API keys are never re-displayed after save
- merchants can rotate or revoke keys at any time
- decryption only happens at runtime when needed for agent calls

### AWS requirement
**AWS is not required for MVP.**

Recommended MVP approach:
- use application-level encryption with a server-side master encryption key stored in environment or secure deployment config
- keep the implementation simple and auditable

Future upgrade path:
- AWS KMS
- AWS Secrets Manager
- another dedicated secret-management service

### Design principle
For MVP, we optimize for:
- secure enough persisted credentials
- low implementation complexity
- clear operational model

We do **not** need to introduce cloud-secret infrastructure unless deployment requirements force it.

---

## 9. Rules System

### Product role of rules
Rules are the primary control surface for merchant autonomy.

The merchant defines hard boundaries. The Pawn Agent can act freely **inside** those boundaries and must refuse actions **outside** them.

### Hard rules vs soft preferences
#### Hard rules
These are binding constraints.
Examples:
- accepted assets
- excluded assets
- max position size
- minimum discount required
- minimum liquidity threshold
- maximum exposure to a token
- max per-deal risk
- absolute rejection conditions

#### Soft preferences
These shape behavior but do not function as hard guardrails.
Examples:
- negotiation aggressiveness
- tone
- willingness to counteroffer
- tolerance for low-liquidity assets near thresholds

### Merchant-configurable inputs for MVP
Merchants should be able to control:
- list of desired assets
- list of excluded assets
- buy-side budget constraints
- target discount below current market rate
- discount logic based on liquidity, market cap, or similar heuristics
- min and max transaction size
- aggressiveness slider
- fallback behavior when data quality is poor
- optional persona / tone settings

### Product framing
The intended merchant behavior is:
- buyers of distressed, illiquid, or hard-to-exit assets
- willing to make discounted offers
- using rules to systematically price risk and illiquidity

This is closer to a **distressed token pawn / buyout merchant** than a generic symmetrical lending desk.

### Rules engine objective
The rules engine should translate merchant preferences into a machine-readable policy layer that the agent must follow when negotiating and executing.

---

## 10. Prompt System and Merchant Customization

### Master Pawn Agent prompt
The product needs a **master Pawn Agent prompt** that defines the default merchant behavior.

This prompt should specify:
- the agent's role
- its negotiation posture
- its obligation to obey merchant rules
- its duty to reject invalid deals
- how it converts conversation into structured terms
- how it handles ambiguity, illiquidity, and risk

### Prompt layering model
The prompt stack should be:

1. **System / master Pawn Agent prompt**
   - universal behavior and safety constraints

2. **Merchant configuration layer**
   - ENS identity
   - shop name
   - asset preferences
   - exclusion list
   - discount expectations
   - risk posture
   - aggressiveness and tone settings

3. **Live negotiation context**
   - user proposal
   - market data
   - asset liquidity indicators
   - active conversation state

### Merchant customization philosophy
Merchants should be able to customize:
- preferred assets
- excluded assets
- target discount logic
- aggressiveness
- general tone / merchant personality

They should **not** directly edit the deepest system logic in MVP.

This keeps output quality and execution safety more stable.

### Output requirement
The Pawn Agent should not behave like an open-ended assistant.
It must resolve negotiation into structured deal objects suitable for execution.

---

## 11. Negotiation Model

### Interaction style
Negotiation should feel conversational and merchant-like.

The agent can:
- request clarification
- reject the proposal
- make a counteroffer
- accept within policy bounds

### Negotiation target
The system is designed around cases where users want to offload tokens that may have:
- weak liquidity
- low confidence markets
- poor immediate exit paths

The agent therefore negotiates toward a discount relative to visible market conditions, adjusted by merchant rules.

### Inputs to negotiation
Negotiation can consider:
- current market rate
- available liquidity
- liquidity-to-market-cap relationship
- configured discount rules
- merchant exclusions and preferences
- transaction size and concentration risk

### Structured negotiation output
A valid deal should resolve into a structured record such as:
- offered asset
- offered amount
- quoted value basis
- negotiated discount
- payout asset
- payout amount
- expiry window
- merchant shop identity
- execution readiness flag

---

## 12. Execution Autonomy

### Decision
**Auto-execution is allowed in MVP.**

### Constraint model
Auto-execution only occurs when:
- the final deal is within all hard merchant rules
- required data checks pass
- the deal object is complete and valid
- contract preconditions are satisfied

### Why this works
The rules system is the safety envelope.

The merchant is explicitly choosing:
- what assets are acceptable
- what discounts are required
- how aggressive the agent may be
- what rejection criteria must be enforced

The agent should therefore be able to execute autonomously inside that envelope.

### Important product principle
Autonomy is not unrestricted improvisation.
It is **rule-bounded execution**.

### Fallback behavior
If the negotiation reaches a state where rules are ambiguous or data is insufficient, the agent should:
- refuse execution
- explain why
- ask for a revised proposal or better conditions

---

## 13. Smart Contract Role

### Contract philosophy
The contract layer should be minimal, deterministic, and execution-focused.

The contracts should:
- record finalized deal terms
- escrow assets as needed
- enforce state transitions
- settle the agreed transaction
- provide a clear source of truth for completed deals

### The contracts should not
- perform AI reasoning
- perform open-ended negotiation
- encode merchant personality
- try to solve high-complexity pricing logic onchain

### MVP contract responsibility
The smart contracts are the final settlement mechanism after successful offchain negotiation.

### Likely contract primitives for MVP
For the buyout-first MVP, contracts may need to support:
- merchant offer acceptance records
- token transfer / swap authorization
- finalized discounted purchase settlement
- deal status tracking

This should remain simple in v1.

---

## 14. System Architecture

### Frontend responsibilities
- wallet connection
- ENS detection and display
- merchant onboarding
- encrypted API key submission flow
- rules configuration UI
- storefront rendering
- chat / bargaining interface
- execution approval and transaction status display

### Backend responsibilities
- merchant and shop records
- encrypted API key storage
- prompt assembly
- provider routing
- market data retrieval
- rules evaluation support
- negotiation session persistence
- deal normalization and execution orchestration

### Agent runtime responsibilities
- load merchant configuration
- load master prompt
- ingest negotiation context
- compute compliant responses
- produce structured deal output
- trigger auto-execution when conditions are met

### Smart contract responsibilities
- settlement state
- token movement logic
- finalized transaction recordkeeping

---

## 15. Merchant Configuration Surface

The merchant should configure the shop through a simple but expressive UI.

### Required merchant controls
- shop ENS identity
- storefront/shop display name
- desired asset list
- excluded asset list
- max spend / budget constraints
- target discount settings
- liquidity-sensitive pricing behavior
- aggressiveness slider
- general merchant tone / persona
- API key provider and credentials

### Aggressiveness examples
A low-aggression merchant might:
- offer smaller discounts from market
- counter politely and more often
- accept more assets

A high-aggression merchant might:
- demand deeper discounts
- reject borderline assets faster
- place stronger weight on poor liquidity

---

## 16. Product Safety and Trust Boundaries

### What the merchant is trusting the system with
- their ENS-linked merchant identity
- their encrypted LLM API credential
- their configured rules
- the autonomous execution behavior inside those rules

### What the system must guarantee
- execution only within hard-rule bounds
- no silent drift outside configured policy
- auditability of final deal terms
- clear runtime separation between merchant settings and system constraints

### MVP trust stance
The MVP is not a trustless AI system.
It is a merchant-operated application with:
- encrypted secret storage
- configurable autonomous agent behavior
- onchain settlement after policy-compliant negotiation

That is a reasonable and honest trust model for v1.

---

## 17. Open Questions

The following can remain open for now but should be settled before implementation details are finalized:

1. Exact Base Sepolia test token set for launch demos
2. Whether optional subdomain provisioning ships in v1 or v1.1
3. How much market data sophistication is needed in the first pricing heuristic
4. Whether the storefront launches with static art, generated art, or lightweight interactive scene design

---

## 18. Locked Decisions

These decisions are now considered locked for the MVP:

- **Prize focus:** ENS only
- **Execution chain:** Base Sepolia only
- **Canonical merchant identity:** root ENS name
- **Subdomains:** optional, non-blocking enhancement
- **Durin reliance:** optional convenience, not a core dependency
- **Product model:** discounted token buyout merchant first, not collateralized lending
- **Asset type:** ERC-20 only
- **Token coverage:** start with faucet-accessible Base Sepolia assets and expand over time
- **LLM provider support:** OpenAI, Anthropic, OpenRouter
- **LLM key storage:** persisted encrypted server-side storage
- **AWS dependency:** not required for MVP
- **Execution model:** autonomous execution allowed within hard rules
- **Storefront style:** easiest viable 2D / lightweight immersive merchant-shop experience first
- **Agent customization:** structured merchant controls, not unrestricted prompt editing

---

## 19. Development and Open-Source Requirements

The project must follow these development constraints:

- **Version control is required** from the start
- The repository must remain **public** so anyone can inspect and verify the work
- The project must remain **open source**
- Work should be committed **frequently** in small, scoped commits
- Avoid large change dumps hidden inside small numbers of commits

These are product-development requirements for Pawn Agent, not optional workflow preferences.

---

## 20. MVP Summary

Pawn Agent is an ENS-native merchant platform for launching AI-powered token buyout shops on Base Sepolia.

A merchant with an ENS name creates a shop, securely stores an LLM API key, configures hard rules and negotiation preferences, and launches a storefront where users negotiate token deals with an AI merchant. The agent uses merchant-defined rules to evaluate offers, price in liquidity and discount preferences, and auto-executes compliant deals through smart contract settlement.

The product's differentiator is the combination of:
- ENS identity
- merchant-configured autonomy
- immersive storefront UX
- onchain execution within explicit merchant-defined rules

---

## 21. Source of Truth Note

This file is the canonical product design source of truth for Pawn Agent.

Implementation planning should follow the decisions and boundaries defined here unless explicitly revised.
