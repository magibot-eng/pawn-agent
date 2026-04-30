'use client';

import { useEffect, useMemo, useState } from 'react';
import MerchantChat from '../components/MerchantChat';
import {
  Negotiations,
  ProviderKeys,
  Shops,
  type CreateShop,
  type NegotiationSession,
  type ProviderKey,
  type Shop,
} from '../lib/api';

const DEMO_SHOP: CreateShop = {
  owner_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
  merchant_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
  ens_name: 'demo.pawn.eth',
  display_name: 'The Rusty Anchor',
  description: 'A fast hackathon pawn desk for distressed token buyouts.',
  merchant_persona: 'Speak like a sharp dockside merchant: direct, confident, slightly theatrical.',
  buying_preferences: 'Thin-liquidity tokens\nGovernance tokens\nVolatile long-tail assets',
  pricing_style: 'Conservative on risk. Will negotiate, but always protects downside first.',
  refusal_rules: 'Refuse unclear token details\nRefuse obvious scams\nRefuse assets outside shop appetite',
  welcome_message: 'Bring your cargo to the counter. State the token, amount, and what you want for it.',
  payout_token: '0x0000000000000000000000000000000000000000',
};

const DEFAULT_NEGOTIATION = {
  seller_address: DEMO_SHOP.owner_address,
  input_token: '0x0000000000000000000000000000000000000000',
  input_amount: '0',
};

type ProviderForm = {
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  apiKey: string;
};

const providerDefaults: Record<ProviderForm['provider'], string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  openrouter: 'openai/gpt-4o-mini',
};

function splitLines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopForm, setShopForm] = useState<CreateShop>(DEMO_SHOP);
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    provider: 'openai',
    model: providerDefaults.openai,
    apiKey: '',
  });
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopNotice, setShopNotice] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [savingShop, setSavingShop] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  async function ensureNegotiation(shopId: string) {
    const existing = await Negotiations.listByShop(shopId);
    if (existing.length > 0) {
      setNegotiation(existing[0]);
      return existing[0];
    }

    const created = await Negotiations.create({
      shop_id: shopId,
      ...DEFAULT_NEGOTIATION,
    });
    setNegotiation(created);
    return created;
  }

  async function loadProviderKeys(shopId: string) {
    try {
      const keys = await ProviderKeys.list(shopId);
      setProviderKeys(keys);
    } catch {
      setProviderKeys([]);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const existing = await Shops.list({ ens_name: DEMO_SHOP.ens_name });
        const activeShop = existing[0] ?? (await Shops.create(DEMO_SHOP));

        setShop(activeShop);
        setShopForm({
          owner_address: activeShop.owner_address,
          merchant_address: activeShop.merchant_address,
          ens_name: activeShop.ens_name,
          display_name: activeShop.display_name,
          description: activeShop.description ?? '',
          merchant_persona: activeShop.merchant_persona ?? '',
          buying_preferences: activeShop.buying_preferences ?? '',
          pricing_style: activeShop.pricing_style ?? '',
          refusal_rules: activeShop.refusal_rules ?? '',
          welcome_message: activeShop.welcome_message ?? '',
          payout_token: activeShop.payout_token,
        });

        await Promise.all([
          ensureNegotiation(activeShop.id),
          loadProviderKeys(activeShop.id),
        ]);
      } catch (err) {
        console.error(err);
        setError('Could not load the Pawn Agent backend.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const activeKey = useMemo(
    () => providerKeys.find((key) => key.is_active) ?? providerKeys[0] ?? null,
    [providerKeys]
  );

  const wantedAssets = splitLines(shopForm.buying_preferences);
  const refusalRules = splitLines(shopForm.refusal_rules);

  async function handleSaveShop() {
    setSavingShop(true);
    setShopNotice(null);
    setError(null);

    try {
      let saved: Shop;
      if (shop) {
        saved = await Shops.update(shop.id, {
          ens_name: shopForm.ens_name,
          display_name: shopForm.display_name,
          description: shopForm.description,
          merchant_persona: shopForm.merchant_persona,
          buying_preferences: shopForm.buying_preferences,
          pricing_style: shopForm.pricing_style,
          refusal_rules: shopForm.refusal_rules,
          welcome_message: shopForm.welcome_message,
          payout_token: shopForm.payout_token,
        });
      } else {
        saved = await Shops.create(shopForm);
      }

      setShop(saved);
      setShopNotice('Shop settings saved.');
      if (!negotiation) {
        await ensureNegotiation(saved.id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save shop settings.');
    } finally {
      setSavingShop(false);
    }
  }

  async function handleSaveProviderKey() {
    if (!shop) {
      setProviderNotice('Save the shop first.');
      return;
    }
    if (!providerForm.apiKey.trim()) {
      setProviderNotice('Paste an API key first.');
      return;
    }

    setSavingProvider(true);
    setProviderNotice(null);

    try {
      await ProviderKeys.add(shop.id, {
        provider: providerForm.provider,
        model: providerForm.model,
        encrypted_key: providerForm.apiKey.trim(),
        label: 'owner-dashboard',
      });
      await loadProviderKeys(shop.id);
      setProviderForm((current) => ({ ...current, apiKey: '' }));
      setProviderNotice('Provider key saved and activated.');
    } catch (err) {
      console.error(err);
      setProviderNotice('Failed to save provider key. Check the backend encryption key.');
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleNewSession() {
    if (!shop) return;
    setCreatingSession(true);
    try {
      const created = await Negotiations.create({
        shop_id: shop.id,
        ...DEFAULT_NEGOTIATION,
      });
      setNegotiation(created);
    } catch (err) {
      console.error(err);
      setError('Failed to create a fresh test chat.');
    } finally {
      setCreatingSession(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-maritime text-onSurface flex items-center justify-center">
        <p className="text-[#f0dfb4] uppercase tracking-widest text-sm">Loading the harbor…</p>
      </main>
    );
  }

  if (error && !shop) {
    return (
      <main className="min-h-screen bg-maritime text-onSurface flex items-center justify-center p-8">
        <p className="text-red-400 uppercase tracking-widest text-sm">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-maritime text-onSurface">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 lg:px-10">
        <div className="mb-5 merchant-panel rounded-panel px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.38em] text-onSurfaceVariant">
                Pawn Agent Hackathon MVP
              </p>
              <h1 className="mt-2 text-2xl text-onSurface sm:text-3xl">
                Owner Setup + Live Merchant Chat
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[#f0dfb4]">
                Configure the pawn shop owner on the left, then test the live seller-to-AI negotiation flow on the right.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.24em] lg:w-[26rem]">
              <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">
                Shop: {shopForm.ens_name}
              </div>
              <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">
                Status: {activeKey ? 'Live AI ready' : 'Scripted fallback'}
              </div>
              <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">
                Provider: {activeKey?.provider ?? 'None'}
              </div>
              <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">
                Session: {negotiation ? 'Open' : 'Missing'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[26rem_1fr]">
          <aside className="merchant-panel rounded-panel p-4 sm:p-5 space-y-5">
            <section>
              <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">Pawn Shop Owner</p>
              <h2 className="mt-2 text-xl text-onSurface">Merchant configuration</h2>
              <p className="mt-2 text-sm text-[#f0dfb4]">
                Keep this simple: set the merchant voice, what the shop buys, and which LLM runs the counter.
              </p>
            </section>

            <section className="space-y-3">
              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                ENS Name
                <input
                  value={shopForm.ens_name}
                  onChange={(e) => setShopForm((current) => ({ ...current, ens_name: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Shop Display Name
                <input
                  value={shopForm.display_name}
                  onChange={(e) => setShopForm((current) => ({ ...current, display_name: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Shop Description
                <textarea
                  rows={2}
                  value={shopForm.description ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, description: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Merchant Persona / Vibe
                <textarea
                  rows={3}
                  value={shopForm.merchant_persona ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, merchant_persona: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Assets This Shop Wants
                <textarea
                  rows={3}
                  value={shopForm.buying_preferences ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, buying_preferences: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Pricing Style
                <textarea
                  rows={2}
                  value={shopForm.pricing_style ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, pricing_style: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Refusal Rules
                <textarea
                  rows={3}
                  value={shopForm.refusal_rules ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, refusal_rules: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Welcome Message
                <textarea
                  rows={2}
                  value={shopForm.welcome_message ?? ''}
                  onChange={(e) => setShopForm((current) => ({ ...current, welcome_message: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <button
                onClick={handleSaveShop}
                disabled={savingShop}
                className="w-full rounded-panel border border-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10 disabled:opacity-50"
              >
                {savingShop ? 'Saving shop…' : 'Save Shop Settings'}
              </button>
              {shopNotice && <p className="text-xs text-emerald-300">{shopNotice}</p>}
            </section>

            <section className="border-t border-outlineVariant pt-5 space-y-3">
              <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">LLM Provider</p>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Provider
                <select
                  value={providerForm.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ProviderForm['provider'];
                    setProviderForm({ provider, model: providerDefaults[provider], apiKey: '' });
                  }}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                Model
                <input
                  value={providerForm.model}
                  onChange={(e) => setProviderForm((current) => ({ ...current, model: e.target.value }))}
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.2em] text-onSurfaceVariant">
                API Key
                <textarea
                  rows={3}
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm((current) => ({ ...current, apiKey: e.target.value }))}
                  placeholder="Paste merchant API key here"
                  className="merchant-inset mt-2 w-full rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-onSurface focus:outline-none"
                />
              </label>

              <button
                onClick={handleSaveProviderKey}
                disabled={savingProvider}
                className="w-full rounded-panel border border-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10 disabled:opacity-50"
              >
                {savingProvider ? 'Saving key…' : 'Save AI Key'}
              </button>

              {providerNotice && <p className="text-xs text-[#f0dfb4]">{providerNotice}</p>}

              <div className="merchant-inset rounded-panel p-3 text-sm text-[#f0dfb4]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Current AI status</p>
                <p className="mt-2">
                  {activeKey
                    ? `${activeKey.provider} • ${activeKey.model ?? 'default model'} • live`
                    : 'No active key saved yet. Chat will use scripted fallback responses.'}
                </p>
              </div>
            </section>
          </aside>

          <section className="space-y-5">
            <section className="merchant-panel rounded-panel p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">Seller View</p>
                  <h2 className="mt-2 text-2xl text-onSurface">{shopForm.display_name || 'Unnamed Shop'}</h2>
                  <p className="mt-1 text-sm uppercase tracking-[0.24em] text-onSurfaceVariant">
                    {shopForm.ens_name || 'no-ens-set'}
                  </p>
                  <p className="mt-3 text-sm text-[#f0dfb4]">
                    {shopForm.description || 'Set a short description on the owner side to frame the merchant.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleNewSession}
                    disabled={!shop || creatingSession}
                    className="rounded-panel border border-outline px-4 py-2 text-xs uppercase tracking-[0.18em] text-onSurfaceVariant hover:bg-white/5 disabled:opacity-50"
                  >
                    {creatingSession ? 'Creating…' : 'Fresh Test Chat'}
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-5">
                <div className="merchant-panel rounded-panel p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">Merchant voice</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#f0dfb4]">
                    {shopForm.merchant_persona || 'Configure the merchant persona on the owner side.'}
                  </p>
                </div>

                <div className="merchant-panel rounded-panel p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">What this shop wants</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {wantedAssets.length > 0 ? (
                      wantedAssets.map((asset) => (
                        <span
                          key={asset}
                          className="rounded-panel border border-outlineVariant bg-surfaceLow px-3 py-1.5 text-xs text-onPrimaryContainer"
                        >
                          {asset}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-[#f0dfb4]">No buying preferences set yet.</p>
                    )}
                  </div>
                </div>

                <div className="merchant-panel rounded-panel p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">Pricing posture</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#f0dfb4]">
                    {shopForm.pricing_style || 'No pricing posture configured yet.'}
                  </p>
                </div>

                <div className="merchant-panel rounded-panel p-4 sm:p-5">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-onSurfaceVariant">Refusal rules</p>
                  {refusalRules.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#f0dfb4]">
                      {refusalRules.map((rule) => (
                        <li key={rule}>• {rule}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#f0dfb4]">No refusal rules configured yet.</p>
                  )}
                </div>
              </div>

              <div className="merchant-panel rounded-panel p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Negotiation Chat</p>
                    <h2 className="mt-1 text-lg text-onSurface sm:text-xl">Live seller ↔ merchant loop</h2>
                  </div>
                  <p className="text-xs text-[#f0dfb4]">
                    {activeKey ? 'Using saved merchant LLM config.' : 'Using scripted fallback until an API key is saved.'}
                  </p>
                </div>

                <div className="merchant-inset rounded-panel p-4 mb-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Greeting</p>
                  <p className="mt-2 text-sm text-[#f0dfb4]">
                    {shopForm.welcome_message || 'Bring your cargo to the counter and state your ask.'}
                  </p>
                </div>

                {negotiation ? (
                  <div className="min-h-[34rem]">
                    <MerchantChat
                      key={negotiation.id}
                      negotiationId={negotiation.id}
                      shopEnsName={shopForm.ens_name || 'merchant'}
                    />
                  </div>
                ) : (
                  <div className="merchant-inset rounded-panel p-6 text-sm text-[#f0dfb4]">
                    No negotiation session yet.
                  </div>
                )}
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
