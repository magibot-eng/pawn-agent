'use client';

import { Shops, Negotiations, type Shop, type NegotiationSession, type ChatResponse, type CreateNegotiation } from './api';

const API = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? 'https://pawn-agent-backend-production.up.railway.app';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function useBackend() {
  async function fetchShop(params: { owner_address?: string; ens_name?: string }): Promise<Shop | null> {
    try {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      const shops = await apiRequest<Shop[]>(`/shops?${qs}`);
      return shops[0] ?? null;
    } catch {
      return null;
    }
  }

  async function startNegotiation(data: CreateNegotiation): Promise<NegotiationSession> {
    return apiRequest<NegotiationSession>('/negotiations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async function sendChat(negotiationId: string, message: string): Promise<ChatResponse> {
    return apiRequest<ChatResponse>(`/negotiations/${negotiationId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  return { fetchShop, startNegotiation, sendChat };
}

// Mock data fallback when backend is unavailable
export const MOCK_SHOP: Shop = {
  id: 'mock-shop-1',
  owner_address: '0x1234567890123456789012345678901234567890',
  ens_name: 'tavern.pawnagent.eth',
  display_name: 'The Rusty Anchor',
  description: 'A weathered tavern where hard deals are struck under candlelight.',
  merchant_persona: 'Grizzled tavern keeper with a sharp eye for value.',
  buying_preferences: 'Tokens with clear use cases. Avoid meme coins and unverified contracts.',
  pricing_style: 'Conservative — fair for clean assets, ruthless on risky ones.',
  refusal_rules: 'No to projects that cannot explain their token utility.',
  welcome_message: 'Step closer, traveler. What brings you to my counter today?',
  merchant_portrait: 'DEFAULT',
  status: 'published',
  contract_address: null,
  payout_token: '0x0000000000000000000000000000000000000000',
  merchant_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  wallet_provider: 'cdp_agentic_wallet',
  wallet_provider_account_id: null,
  wallet_status: 'active',
  auto_settlement_enabled: false,
  ens_verification_status: 'verified',
  ens_verified_owner_address: '0x1234567890123456789012345678901234567890',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ens_identities: [],
};

export const MOCK_NEGOTIATION: NegotiationSession = {
  id: 'mock-neg-1',
  shop_id: 'mock-shop-1',
  seller_address: '0xsellersellersellersellersellerseller1234',
  input_token: '0x0000000000000000000000000000000000000000',
  input_amount: '1000000000000000000',
  settled: false,
  chat_log: '[]',
  outcome: null,
  negotiation_state: null,
  agreed_payout: null,
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const MOCK_MERCHANT_RESPONSES = [
  "Hmm, that's an interesting piece you bring. Let me have a closer look...",
  "This token... I know of it. The market has been rough lately. I could offer 0.72 on the ether.",
  "A fair price for a fair trade. But I need to know — where did you acquire this?",
  "Done. Take this note to the barkeep and he'll handle the settlement.",
];

export const MOCK_QUOTE_RESPONSE: ChatResponse = {
  merchant_response: "I've considered your offer. I can offer you 0.75 ETH for your position. Take it or leave it, friend.",
  success: true,
  error: null,
  response_mode: 'direct',
  provider: 'mock',
  model: 'mock-v1',
  used_fallback: true,
  negotiation_state: {
    token: 'ETH',
    amount: '1.0',
    seller_ask: '0.8 ETH',
    urgency: 'medium',
    merchant_stance: 'countered',
    next_action: 'await_seller',
  },
  quote: {
    status: 'quoted',
    payout_token: '0x0000000000000000000000000000000000000000',
    payout_amount: '750000000000000000',
    expiry: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    seller_ask_token: '0x0000000000000000000000000000000000000000',
    seller_ask_amount: '1000000000000000000',
    seller_ask_price: '0.8',
  },
};