'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ProviderKeys,
  Shops,
  type CreateProviderKey,
  type ProviderKey,
  type Shop,
} from '../../lib/api';

const DEMO_SHOP = {
  owner_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
  ens_name: 'demo.pawn.eth',
  display_name: 'The Rusty Anchor',
  description: 'Distressed asset buyer on Base Sepolia. Hard rules, fair prices.',
  merchant_persona: 'A direct harbor merchant with a little theater. Brief, sharp, and skeptical.',
  buying_preferences: 'Low-float tokens, distressed positions, governance tokens with believable urgency.',
  pricing_style: 'Conservative on risky assets, fair on clean liquid names, never overpay.',
  refusal_rules: 'Refuse unclear token identity, obvious scams, missing size, or impossible payout demands.',
  welcome_message: 'State your cargo and your ask.',
  payout_token: '0x0000000000000000000000000000000000000000',
  merchant_address: '0x000000000000000000000000000000000000dEaD',
};

type OwnerForm = {
  display_name: string;
  description: string;
  merchant_persona: string;
  buying_preferences: string;
  pricing_style: string;
  refusal_rules: string;
  welcome_message: string;
};

const INITIAL_FORM: OwnerForm = {
  display_name: DEMO_SHOP.display_name,
  description: DEMO_SHOP.description,
  merchant_persona: DEMO_SHOP.merchant_persona,
  buying_preferences: DEMO_SHOP.buying_preferences,
  pricing_style: DEMO_SHOP.pricing_style,
  refusal_rules: DEMO_SHOP.refusal_rules,
  welcome_message: DEMO_SHOP.welcome_message,
};

export default function OwnerPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<OwnerForm>(INITIAL_FORM);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [provider, setProvider] = useState<CreateProviderKey['provider']>('openai');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [label, setLabel] = useState('Hackathon key');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const existing = await Shops.list({ ens_name: DEMO_SHOP.ens_name });
        const activeShop = existing[0] ?? (await Shops.create(DEMO_SHOP));
        setShop(activeShop);
        setForm({
          display_name: activeShop.display_name ?? DEMO_SHOP.display_name,
          description: activeShop.description ?? DEMO_SHOP.description,
          merchant_persona: activeShop.merchant_persona ?? DEMO_SHOP.merchant_persona,
          buying_preferences: activeShop.buying_preferences ?? DEMO_SHOP.buying_preferences,
          pricing_style: activeShop.pricing_style ?? DEMO_SHOP.pricing_style,
          refusal_rules: activeShop.refusal_rules ?? DEMO_SHOP.refusal_rules,
          welcome_message: activeShop.welcome_message ?? DEMO_SHOP.welcome_message,
        });
        const keys = await ProviderKeys.list(activeShop.id);
        setProviderKeys(keys);
      } catch (err) {
        console.error(err);
        setError('Could not load owner dashboard.');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const activeKey = useMemo(() => providerKeys.find((key) => key.is_active) ?? null, [providerKeys]);

  function updateField<K extends keyof OwnerForm>(key: K, value: OwnerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveShopSettings() {
    if (!shop) return;
    try {
      setSaving(true);
      setNotice(null);
      setError(null);
      const updated = await Shops.update(shop.id, form);
      setShop(updated);
      setNotice('Shop settings saved. Seller chat should now reflect the updated merchant behavior.');
    } catch (err) {
      console.error(err);
      setError('Could not save shop settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveProviderKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shop || !apiKey.trim()) return;

    try {
      setKeySaving(true);
      setNotice(null);
      setError(null);
      await ProviderKeys.add(shop.id, {
        provider,
        model: model.trim() || undefined,
        label: label.trim() || undefined,
        encrypted_key: apiKey.trim(),
      });
      const keys = await ProviderKeys.list(shop.id);
      setProviderKeys(keys);
      setApiKey('');
      setNotice('Provider key saved. New chats will use this provider when available.');
    } catch (err) {
      console.error(err);
      setError('Could not save provider key. Check backend encryption config.');
    } finally {
      setKeySaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-maritime text-onSurface flex items-center justify-center">
        <p className="text-[#f0dfb4] uppercase tracking-widest text-sm">Loading owner dashboard…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-maritime text-onSurface">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <div className="merchant-panel rounded-panel p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-outlineVariant pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Pawn Agent Owner View</p>
              <h1 className="mt-2 text-3xl text-onSurface">Configure the Pawn Shop</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#f0dfb4]">
                Keep this simple: set the merchant voice, what the shop buys, and which LLM key powers the counter.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                Seller View
              </Link>
            </div>
          </div>

          {error ? <p className="mt-4 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p> : null}
          {notice ? <p className="mt-4 rounded-panel border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <section className="merchant-inset rounded-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Shop Profile</p>
                  <h2 className="mt-2 text-xl text-onSurface">{shop?.ens_name ?? DEMO_SHOP.ens_name}</h2>
                </div>
                <button
                  onClick={saveShopSettings}
                  disabled={saving}
                  className="rounded-panel border border-outlineVariant bg-brassButton px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-onPrimary disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Merchant name</span>
                  <input value={form.display_name} onChange={(e) => updateField('display_name', e.target.value)} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Shop description</span>
                  <textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Merchant vibe</span>
                  <textarea value={form.merchant_persona} onChange={(e) => updateField('merchant_persona', e.target.value)} rows={4} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">What this shop buys</span>
                  <textarea value={form.buying_preferences} onChange={(e) => updateField('buying_preferences', e.target.value)} rows={3} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Pricing posture</span>
                  <textarea value={form.pricing_style} onChange={(e) => updateField('pricing_style', e.target.value)} rows={3} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">When to refuse</span>
                  <textarea value={form.refusal_rules} onChange={(e) => updateField('refusal_rules', e.target.value)} rows={3} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>

                <label className="grid gap-2 text-sm text-[#f4e7c7]">
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Welcome line</span>
                  <input value={form.welcome_message} onChange={(e) => updateField('welcome_message', e.target.value)} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                </label>
              </div>
            </section>

            <section className="grid gap-6">
              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Active LLM Setup</p>
                <div className="mt-3 rounded-panel border border-outlineVariant bg-surfaceLowest px-4 py-4 text-sm text-[#f4e7c7]">
                  {activeKey ? (
                    <div className="space-y-2">
                      <p><span className="text-onSurfaceVariant">Provider:</span> {activeKey.provider}</p>
                      <p><span className="text-onSurfaceVariant">Model:</span> {activeKey.model ?? 'default'}</p>
                      <p><span className="text-onSurfaceVariant">Label:</span> {activeKey.label ?? 'unnamed key'}</p>
                    </div>
                  ) : (
                    <p>No active provider key yet. Seller chat will use fallback merchant copy until you add one.</p>
                  )}
                </div>
              </section>

              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Add Provider Key</p>
                <form onSubmit={saveProviderKey} className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Provider</span>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as CreateProviderKey['provider'])} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none">
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Model</span>
                    <input value={model} onChange={(e) => setModel(e.target.value)} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                  </label>

                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Label</span>
                    <input value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                  </label>

                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">API key</span>
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste provider API key" className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                  </label>

                  <button type="submit" disabled={keySaving || !apiKey.trim()} className="rounded-panel border border-outlineVariant bg-primary px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-black disabled:opacity-60">
                    {keySaving ? 'Saving key…' : 'Save provider key'}
                  </button>
                </form>
              </section>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
