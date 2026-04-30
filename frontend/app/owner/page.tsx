'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProviderKeys, Shops, type CreateProviderKey, type ProviderKey, type Shop } from '../../lib/api';

const STORAGE_KEY = 'pawn-agent:selected-store';

type OwnerForm = {
  display_name: string;
  description: string;
  merchant_persona: string;
  buying_preferences: string;
  pricing_style: string;
  refusal_rules: string;
  welcome_message: string;
};

const EMPTY_FORM: OwnerForm = {
  display_name: '',
  description: '',
  merchant_persona: '',
  buying_preferences: '',
  pricing_style: '',
  refusal_rules: '',
  welcome_message: '',
};

export default function OwnerPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<OwnerForm>(EMPTY_FORM);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [provider, setProvider] = useState<CreateProviderKey['provider']>('openai');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [label, setLabel] = useState('Owner dashboard');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const query = new URLSearchParams(window.location.search);
        const ownerFromQuery = query.get('owner');
        const ensFromQuery = query.get('ens');

        let owner = ownerFromQuery;
        let ens = ensFromQuery;

        if (!owner || !ens) {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as { owner?: string; ens?: string };
            owner = owner ?? parsed.owner ?? null;
            ens = ens ?? parsed.ens ?? null;
          }
        }

        if (!active) return;
        setOwnerAddress(owner ?? null);
        setEnsName(ens ?? null);

        if (!owner || !ens) {
          setError('No owner store is selected yet. Go back to setup and create or load a storefront first.');
          setLoading(false);
          return;
        }

        const matches = await Shops.list({ owner_address: owner, ens_name: ens });
        const activeShop = matches[0] ?? null;
        if (!active) return;

        if (!activeShop) {
          setError(`No shop found for ${ens}. Return to setup and create it first.`);
          setLoading(false);
          return;
        }

        setShop(activeShop);
        setForm({
          display_name: activeShop.display_name ?? '',
          description: activeShop.description ?? '',
          merchant_persona: activeShop.merchant_persona ?? '',
          buying_preferences: activeShop.buying_preferences ?? '',
          pricing_style: activeShop.pricing_style ?? '',
          refusal_rules: activeShop.refusal_rules ?? '',
          welcome_message: activeShop.welcome_message ?? '',
        });

        const keys = await ProviderKeys.list(activeShop.id);
        if (!active) return;
        setProviderKeys(keys);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError('Could not load the owner dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, []);

  const activeKey = useMemo(() => providerKeys.find((key) => key.is_active) ?? null, [providerKeys]);
  const storefrontHref = shop ? `/shop/${encodeURIComponent(shop.ens_name)}` : '/';

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
      setNotice('Shop settings saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save shop settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveProviderKey(event: React.FormEvent<HTMLFormElement>) {
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
      setNotice('Provider key saved. New chats will use it when available.');
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

  if (!shop) {
    return (
      <main className="min-h-screen bg-maritime text-onSurface px-6 py-10">
        <div className="mx-auto max-w-3xl merchant-panel rounded-panel p-6">
          <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Pawn Agent Owner View</p>
          <h1 className="mt-2 text-3xl text-onSurface">Owner dashboard unavailable</h1>
          <p className="mt-4 text-sm text-[#f0dfb4]">{error ?? 'No store selected yet.'}</p>
          <div className="mt-6 flex gap-3">
            <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
              Back to setup
            </Link>
          </div>
        </div>
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
              <h1 className="mt-2 text-3xl text-onSurface">Configure the storefront</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#f0dfb4]">
                Wallet-bound merchant setup for <span className="text-onSurface">{shop.ens_name}</span>.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.24em] text-onSurfaceVariant">Owner {ownerAddress ?? shop.owner_address}</p>
            </div>
            <div className="flex gap-2">
              <Link href={storefrontHref} className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                Storefront chat
              </Link>
              <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                Setup
              </Link>
            </div>
          </div>

          {error ? <p className="mt-4 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p> : null}
          {notice ? <p className="mt-4 rounded-panel border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <section className="merchant-inset rounded-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Store profile</p>
                  <h2 className="mt-2 text-xl text-onSurface">{ensName ?? shop.ens_name}</h2>
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
                  <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Store description</span>
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
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Active LLM setup</p>
                <div className="mt-3 rounded-panel border border-outlineVariant bg-surfaceLowest px-4 py-4 text-sm text-[#f4e7c7]">
                  {activeKey ? (
                    <div className="space-y-2">
                      <p><span className="text-onSurfaceVariant">Provider:</span> {activeKey.provider}</p>
                      <p><span className="text-onSurfaceVariant">Model:</span> {activeKey.model ?? 'default'}</p>
                      <p><span className="text-onSurfaceVariant">Label:</span> {activeKey.label ?? 'unnamed key'}</p>
                    </div>
                  ) : (
                    <p>No active provider key yet. Storefront chat will use fallback merchant copy until you add one.</p>
                  )}
                </div>
              </section>

              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Add provider key</p>
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
