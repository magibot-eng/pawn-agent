/* Pawn Agent API client — thin fetch wrapper around the backend REST API. */

declare const process: {
  env: { [key: string]: string | undefined };
};

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ??
  "/api";

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
  status: string;
  contract_address: string | null;
  payout_token: string;
  merchant_address: string;
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
  payout_token?: string;
  merchant_address: string;
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
