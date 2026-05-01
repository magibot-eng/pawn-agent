/* Pawn Agent API client — thin fetch wrapper around the backend REST API. */

declare const process: {
  env: { [key: string]: string | undefined };
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

export interface Shop {
  id: string;
  owner_address: string;
  ens_name: string;
  display_name: string;
  description: string | null;
  merchant_persona: string | null;
  buying_preferences: string | null;
  pricing_style: string | null;
  refusal_rules: string | null;
  welcome_message: string | null;
  merchant_portrait: string;
  status: string;
  contract_address: string | null;
  payout_token: string;
  merchant_address: string;
  wallet_provider: string;
  wallet_provider_account_id: string | null;
  wallet_status: string;
  auto_settlement_enabled: boolean;
  ens_verification_status: string;
  ens_verified_owner_address: string | null;
  created_at: string;
  updated_at: string;
  ens_identities: ShopEnsIdentity[];
}

export interface ShopEnsIdentity {
  id: string;
  shop_id: string;
  ens_name: string;
  ens_type: string;
  is_primary: boolean;
  resolver_address: string | null;
  created_at: string;
}

export interface CreateShop {
  owner_address: string;
  ens_name: string;
  display_name: string;
  description?: string;
  merchant_persona?: string;
  buying_preferences?: string;
  pricing_style?: string;
  refusal_rules?: string;
  welcome_message?: string;
  merchant_portrait?: string;
  payout_token?: string;
  merchant_address?: string;
  wallet_provider?: string;
  wallet_provider_account_id?: string;
  wallet_status?: string;
  auto_settlement_enabled?: boolean;
  ens_verification_status?: string;
  ens_verified_owner_address?: string;
}

export interface ShopWalletHolding {
  asset: string;
  balance: string;
  chain: string | null;
}

export interface ShopWalletStatus {
  wallet_provider: string;
  wallet_status: string;
  merchant_address: string;
  wallet_provider_account_id: string | null;
  provisioning_mode: string;
  authenticated: boolean;
  authenticated_email: string | null;
  balance: string | null;
  balance_symbol: string | null;
  holdings: ShopWalletHolding[];
}

export interface ShopWalletTransferResponse {
  success: boolean;
  recipient_address: string;
  amount_eth: string;
  amount_wei: string;
  state: string;
  tx_hash: string;
}

export const Shops = {
  create: (data: CreateShop) =>
    request<Shop>("/shops", { method: "POST", body: JSON.stringify(data) }),

  list: (params?: { owner_address?: string; ens_name?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Shop[]>(`/shops${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => request<Shop>(`/shops/${id}`),

  update: (id: string, data: Partial<Shop>) =>
    request<Shop>(`/shops/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  provisionWallet: (id: string) =>
    request<Shop>(`/shops/${id}/wallet/provision`, { method: "POST" }),

  walletStatus: (id: string) =>
    request<ShopWalletStatus>(`/shops/${id}/wallet/status`),

  withdrawToOwner: (id: string, amount_eth: string) =>
    request<ShopWalletTransferResponse>(`/shops/${id}/wallet/withdraw`, {
      method: "POST",
      body: JSON.stringify({ amount_eth }),
    }),
};

export interface PrimaryEnsLookup {
  address: string;
  primary_ens: string | null;
  verified: boolean;
}

export const Ens = {
  primary: (address: string) => request<PrimaryEnsLookup>(`/ens/primary/${encodeURIComponent(address)}`),
};

// ---------------------------------------------------------------------------
// Negotiations
// ---------------------------------------------------------------------------

export interface NegotiationState {
  token: string;
  amount: string;
  seller_ask: string;
  urgency: string;
  merchant_stance: string;
  next_action: string;
}

export interface NegotiationQuote {
  status: string;            // "quoted" | "accepted" | "countered" | "expired"
  payout_token: string;
  payout_amount: string;
  expiry: string;
  seller_ask_token: string;
  seller_ask_amount: string;
  seller_ask_price: string;
}

export interface DealOffer {
  id: string;
  shop_id: string;
  negotiation_id: string | null;
  chain_deal_id: string;
  seller: string;
  input_token: string;
  input_amount: string;
  payout_amount: string;
  expires_at: string;
  state: string;
  created_at: string;
}

export interface ExecutionRecord {
  id: string;
  shop_id: string;
  deal_offer_id: string;
  tx_hash: string | null;
  payout_sent_wei: string | null;
  tokens_received: string | null;
  state: string;
  error_message: string | null;
  created_at: string;
}

export interface NegotiationSession {
  id: string;
  shop_id: string;
  seller_address: string;
  input_token: string;
  input_amount: string;
  settled: boolean;
  chat_log: string; // JSON string
  outcome: string | null;
  negotiation_state: NegotiationState | null;
  agreed_payout: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNegotiation {
  shop_id: string;
  seller_address: string;
  input_token: string;
  input_amount: string;
}

export interface ChatResponse {
  merchant_response: string;
  success: boolean;
  error: string | null;
  response_mode: string | null;
  provider: string | null;
  model: string | null;
  used_fallback: boolean;
  negotiation_state: NegotiationState | null;
  quote: NegotiationQuote | null;
}

export interface AcceptQuoteResponse {
  success: boolean;
  deal_offer: DealOffer;
  execution: ExecutionRecord;
  negotiation: NegotiationSession;
}

export const Negotiations = {
  create: (data: CreateNegotiation) =>
    request<NegotiationSession>("/negotiations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (id: string) => request<NegotiationSession>(`/negotiations/${id}`),

  chat: (id: string, message: string) =>
    request<ChatResponse>(`/negotiations/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  acceptQuote: (id: string, payload: { payout_token: string; payout_amount: string; expiry: string }) =>
    request<AcceptQuoteResponse>(`/negotiations/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listByShop: (shopId: string, settled?: boolean) => {
    const qs = settled !== undefined ? `?settled=${settled}` : "";
    return request<NegotiationSession[]>(`/negotiations/by-shop/${shopId}${qs}`);
  },
};

// ---------------------------------------------------------------------------
// Provider Keys
// ---------------------------------------------------------------------------

export interface ProviderKey {
  id: string;
  shop_id: string;
  provider: string;
  model: string | null;
  label: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderKeyTestResult {
  ok: boolean;
  provider: string;
  model: string | null;
  message: string | null;
  error: string | null;
}

export interface CreateProviderKey {
  provider: "openai" | "anthropic" | "openrouter";
  encrypted_key: string;
  model?: string;
  label?: string;
}

export const ProviderKeys = {
  add: (shopId: string, data: CreateProviderKey) =>
    request<ProviderKey>(`/shops/${shopId}/provider-keys`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  list: (shopId: string) =>
    request<ProviderKey[]>(`/shops/${shopId}/provider-keys`),

  testActive: (shopId: string) =>
    request<ProviderKeyTestResult>(`/shops/${shopId}/provider-keys/test-active`, {
      method: "POST",
    }),
};
