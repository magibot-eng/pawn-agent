'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProviderKeys, Shops, type CreateProviderKey, type ProviderKey, type ProviderKeyTestResult, type Shop } from '../../lib/api';

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

const PROVIDER_DEFAULTS: Record<CreateProviderKey['provider'], { model: string; help: string }> = {
  openai: {
    model: 'gpt-4.1-mini',
    help: 'Best for the current live-path test. Recommended default: gpt-4.1-mini.',
  },
  anthropic: {
    model: 'claude-3-5-sonnet-20241022',
    help: 'Use a Claude Messages API key. Recommended default: claude-3-5-sonnet-20241022.',
  },
  openrouter: {
    model: 'openai/gpt-4o-mini',
    help: 'Use an OpenRouter key and include the full model slug.',
  },
};

export default function OwnerPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<OwnerForm>(EMPTY_FORM);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [provider, setProvider] = useState<CreateProviderKey['provider']>('openai');
  const [model, setModel] = useState(PROVIDER_DEFAULTS.openai.model);
  const [label, setLabel] = useState('Owner dashboard');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<ProviderKeyTestResult | null>(null);
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

  function updateProvider(nextProvider: CreateProviderKey['provider']) {
    const currentDefault = PROVIDER_DEFAULTS[provider].model;
    setProvider(nextProvider);
    setModel((current) => (current.trim() === '' || current === currentDefault ? PROVIDER_DEFAULTS[nextProvider].model : current));
  }

  async function runActiveKeyTest() {
    if (!shop || !activeKey) return;

    try {
      setKeyTesting(true);
      setNotice(null);
      setError(null);
      const result = await ProviderKeys.testActive(shop.id);
      setKeyTestResult(result);
      setNotice(result.ok ? 'Active provider key responded successfully.' : null);
      if (!result.ok) {
        setError(null);
      }
    } catch (err) {
      console.error(err);
      setKeyTestResult(null);
      setError(err instanceof Error ? err.message : 'Could not test the active provider key.');
    } finally {
      setKeyTesting(false);
    }
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
      setKeyTestResult(null);
      await ProviderKeys.add(shop.id, {
        provider,
        model: model.trim() || undefined,
        label: label.trim() || undefined,
        encrypted_key: apiKey.trim(),
      });
      const keys = await ProviderKeys.list(shop.id);
      setProviderKeys(keys);
      setApiKey('');
      setNotice('Provider key saved and set active. Run the connection test to verify live chat.');
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Active LLM setup</p>
                    <p className="mt-2 text-sm text-[#f0dfb4]">This is the key storefront chat will try first before falling back to scripted responses.</p>
                  </div>
                  {activeKey ? (
                    <button
                      onClick={runActiveKeyTest}
                      disabled={keyTesting}
                      className="rounded-panel border border-outlineVariant px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow disabled:opacity-60"
                    >
                      {keyTesting ? 'Testing…' : 'Test active key'}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 rounded-panel border border-outlineVariant bg-surfaceLowest px-4 py-4 text-sm text-[#f4e7c7]">
                  {activeKey ? (
                    <div className="space-y-2">
                      <p><span className="text-onSurfaceVariant">Status:</span> Active key configured</p>
                      <p><span className="text-onSurfaceVariant">Provider:</span> {activeKey.provider}</p>
                      <p><span className="text-onSurfaceVariant">Model:</span> {activeKey.model ?? 'default'}</p>
                      <p><span className="text-onSurfaceVariant">Label:</span> {activeKey.label ?? 'unnamed key'}</p>
                      <p><span className="text-onSurfaceVariant">Last used:</span> {activeKey.last_used_at ? new Date(activeKey.last_used_at).toLocaleString() : 'Not used in live chat yet'}</p>
                    </div>
                  ) : (
                    <p>No active provider key yet. Storefront chat will use fallback merchant copy until you add one.</p>
                  )}
                </div>

                {keyTestResult ? (
                  <div className={`mt-3 rounded-panel border px-4 py-3 text-sm ${keyTestResult.ok ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'}`}>
                    <p className="text-[10px] uppercase tracking-[0.24em]">Connection test</p>
                    <p className="mt-2">
                      {keyTestResult.ok
                        ? `Live probe succeeded for ${keyTestResult.provider}${keyTestResult.model ? ` • ${keyTestResult.model}` : ''}.`
                        : `Probe failed for ${keyTestResult.provider}${keyTestResult.model ? ` • ${keyTestResult.model}` : ''}.`}
                    </p>
                    {keyTestResult.message ? <p className="mt-2 text-xs text-current/90">Provider reply: {keyTestResult.message}</p> : null}
                    {keyTestResult.error ? <p className="mt-2 text-xs text-current/90">Error: {keyTestResult.error}</p> : null}
                  </div>
                ) : null}
              </section>

              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Add provider key</p>
                <form onSubmit={saveProviderKey} className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Provider</span>
                    <select value={provider} onChange={(e) => updateProvider(e.target.value as CreateProviderKey['provider'])} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none">
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-[#f4e7c7]">
                    <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Model</span>
                    <input value={model} onChange={(e) => setModel(e.target.value)} className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none" />
                    <span className="text-xs text-[#d8caa3]">{PROVIDER_DEFAULTS[provider].help}</span>
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
