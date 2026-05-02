'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, formatEther, getAddress, http, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useSendTransaction, useSwitchChain } from 'wagmi';
import RainbowConnectAction from '../../components/RainbowConnectAction';
import { ProviderKeys, Shops, type CreateProviderKey, type ProviderKey, type ProviderKeyTestResult, type Shop, type ShopWalletStatus, type ShopWalletTransferResponse } from '../../lib/api';
import { DEFAULT_MERCHANT_PORTRAIT_ID, MERCHANT_PORTRAITS, getMerchantPortraitById } from '../../lib/merchantPortraits';
import { useUnifiedWallet } from '../../lib/useUnifiedWallet';

const STORAGE_KEY = 'pawn-agent:selected-store';
const baseSepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });

function formatWallet(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function normalizeEthAmount(value: string) {
  return value.trim();
}

function formatBalanceLine(balance: string | null | undefined, symbol: string | null | undefined) {
  if (!balance) return 'Unavailable';
  return `${balance} ${symbol ?? ''}`.trim();
}

function formatHoldingLabel(asset: string, chain?: string | null) {
  return chain ? `${asset} • ${chain}` : asset;
}

/** Convert a hex token balance (wei-style) to a decimal string with 2 decimal places. */
function formatTokenBalance(hexBalance: string): string {
  if (!hexBalance || hexBalance === '0' || hexBalance === '0x0') return '0.00';
  try {
    const hex = hexBalance.startsWith('0x') ? hexBalance.slice(2) : hexBalance;
    const decimals = 18;
    const padded = hex.padStart(Math.ceil(hex.length / 16) * 16, '0');
    const whole = BigInt('0x' + padded.slice(0, -decimals) || '0');
    const frac = BigInt('0x' + padded.slice(-decimals) || '0');
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2);
    return `${whole}.${fracStr}`;
  } catch {
    return hexBalance;
  }
}

function ensVerificationLabel(status: string | null | undefined) {
  return (status ?? 'manual').toLowerCase() === 'verified' ? 'Verified ENS storefront' : 'Manual ENS route';
}

type OwnerForm = {
  display_name: string;
  description: string;
  merchant_persona: string;
  buying_preferences: string;
  pricing_style: string;
  refusal_rules: string;
  welcome_message: string;
  merchant_portrait: string;
};

const EMPTY_FORM: OwnerForm = {
  display_name: '',
  description: '',
  merchant_persona: '',
  buying_preferences: '',
  pricing_style: '',
  refusal_rules: '',
  welcome_message: '',
  merchant_portrait: DEFAULT_MERCHANT_PORTRAIT_ID,
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
  const {
    walletAddress: connectedWallet,
    walletConnectorName,
    disconnectWallet,
    connectError,
  } = useUnifiedWallet();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<OwnerForm>(EMPTY_FORM);
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [walletStatus, setWalletStatus] = useState<ShopWalletStatus | null>(null);
  const [walletStatusLoading, setWalletStatusLoading] = useState(false);
  const [walletStatusError, setWalletStatusError] = useState<string | null>(null);
  const [provider, setProvider] = useState<CreateProviderKey['provider']>('openai');
  const [model, setModel] = useState(PROVIDER_DEFAULTS.openai.model);
  const [label, setLabel] = useState('Owner dashboard');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [walletProvisioning, setWalletProvisioning] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<ProviderKeyTestResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletMismatch, setWalletMismatch] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [ownerWalletBalance, setOwnerWalletBalance] = useState<string | null>(null);
  const [merchantChainBalance, setMerchantChainBalance] = useState<string | null>(null);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [fundAmount, setFundAmount] = useState('0.0001');
  const [withdrawAmount, setWithdrawAmount] = useState('0.0001');
  const [funding, setFunding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [fundTransfer, setFundTransfer] = useState<{ tx_hash: string; amount_eth: string } | null>(null);
  const [withdrawTransfer, setWithdrawTransfer] = useState<ShopWalletTransferResponse | null>(null);

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

        // Prevent cross-wallet access: if a browser wallet is already connected, it must match the shop owner.
        if (connectedWallet && getAddress(owner) !== getAddress(connectedWallet)) {
          setError(`Wrong wallet. Connect ${formatWallet(owner)} to access this dashboard.`);
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
          merchant_portrait: activeShop.merchant_portrait ?? DEFAULT_MERCHANT_PORTRAIT_ID,
        });

        const keys = await ProviderKeys.list(activeShop.id);
        if (!active) return;
        setProviderKeys(keys);
        setWalletStatus(null);
        setWalletStatusError(null);
        setWalletStatusLoading(true);
        Shops.walletStatus(activeShop.id)
          .then((wallet) => {
            if (!active) return;
            setWalletStatus(wallet);
            setWalletStatusError(null);
          })
          .catch((walletErr) => {
            console.error(walletErr);
            if (!active) return;
            setWalletStatusError(walletErr instanceof Error ? walletErr.message : 'Could not load wallet diagnostics.');
          })
          .finally(() => {
            if (!active) return;
            setWalletStatusLoading(false);
          });
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

  useEffect(() => {
    async function loadWalletBalances() {
      try {
        if (ownerAddress) {
          const ownerWei = await baseSepoliaClient.getBalance({ address: getAddress(ownerAddress) });
          setOwnerWalletBalance(formatEther(ownerWei));
        } else {
          setOwnerWalletBalance(null);
        }

        const merchantAddress = walletStatus?.merchant_address ?? shop?.merchant_address ?? null;
        if (merchantAddress && merchantAddress !== '0x0000000000000000000000000000000000000000') {
          const merchantWei = await baseSepoliaClient.getBalance({ address: getAddress(merchantAddress) });
          setMerchantChainBalance(formatEther(merchantWei));
        } else {
          setMerchantChainBalance(null);
        }
      } catch (err) {
        console.error(err);
        setOwnerWalletBalance(null);
        setMerchantChainBalance(null);
      }
    }

    loadWalletBalances();
  }, [ownerAddress, walletStatus?.merchant_address, shop?.merchant_address]);

  // Guard: if the connected wallet ever stops matching the shop owner, lock the UI.
  useEffect(() => {
    if (!shop || !connectedWallet) return;
    const shopOwner = shop.owner_address;
    const connected = connectedWallet;
    if (getAddress(shopOwner) !== getAddress(connected)) {
      setWalletMismatch(true);
      setError(`Wrong wallet. Connect ${formatWallet(shopOwner)} to access this dashboard.`);
      // Clear the shop so nothing can be submitted
      setShop(null);
    } else {
      setWalletMismatch(false);
    }
  }, [shop, connectedWallet]);

  const activeKey = useMemo(() => providerKeys.find((key) => key.is_active) ?? null, [providerKeys]);
  const selectedPortrait = useMemo(() => getMerchantPortraitById(form.merchant_portrait || shop?.merchant_portrait), [form.merchant_portrait, shop?.merchant_portrait]);
  const storefrontHref = shop ? `/shop/${encodeURIComponent(shop.ens_name)}` : '/';
  const walletError = error ?? connectError;

  async function refreshWalletStatus(shopId: string) {
    setWalletStatusLoading(true);
    setWalletStatusError(null);
    try {
      const wallet = await Shops.walletStatus(shopId);
      setWalletStatus(wallet);
      return wallet;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load wallet diagnostics.';
      setWalletStatusError(message);
      throw err;
    } finally {
      setWalletStatusLoading(false);
    }
  }

  async function refreshTreasuryData(shopId: string) {
    try {
      setWalletRefreshing(true);
      const refreshedWallet = await refreshWalletStatus(shopId);

      if (ownerAddress) {
        const ownerWei = await baseSepoliaClient.getBalance({ address: getAddress(ownerAddress) });
        setOwnerWalletBalance(formatEther(ownerWei));
      }

      const merchantAddress = refreshedWallet.merchant_address || shop?.merchant_address;
      if (merchantAddress && merchantAddress !== '0x0000000000000000000000000000000000000000') {
        const merchantWei = await baseSepoliaClient.getBalance({ address: getAddress(merchantAddress) });
        setMerchantChainBalance(formatEther(merchantWei));
      } else {
        setMerchantChainBalance(null);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not refresh wallet diagnostics.');
    } finally {
      setWalletRefreshing(false);
    }
  }

  async function disconnectOwnerWallet() {
    try {
      await disconnectWallet();
      setNotice('Browser wallet disconnected from this page.');
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not disconnect owner wallet.');
    }
  }

  async function ensureBaseSepoliaChain() {
    try {
      await switchChainAsync({ chainId: baseSepolia.id });
    } catch (err) {
      throw new Error('Switch the connected browser wallet to Base Sepolia before funding the merchant wallet.');
    }
  }

  async function fundMerchantWallet() {
    if (!shop) return;
    if (!connectedWallet) {
      setError('Connect the owner wallet in this browser before funding the merchant wallet.');
      return;
    }
    if (!ownerAddress || getAddress(connectedWallet) !== getAddress(ownerAddress)) {
      setError('The connected browser wallet must match the shop owner wallet before funding the merchant wallet.');
      return;
    }
    if (!shop.merchant_address || shop.merchant_address === '0x0000000000000000000000000000000000000000') {
      setError('Provision the merchant wallet before funding it.');
      return;
    }

    const amountEth = normalizeEthAmount(fundAmount);
    if (!amountEth) {
      setError('Enter an ETH amount to fund the merchant wallet.');
      return;
    }

    try {
      setFunding(true);
      setError(null);
      setNotice(null);
      setFundTransfer(null);
      await ensureBaseSepoliaChain();
      const txHash = await sendTransactionAsync({
        account: connectedWallet as `0x${string}`,
        to: shop.merchant_address as `0x${string}`,
        value: parseEther(amountEth),
        chainId: baseSepolia.id,
      });
      setFundTransfer({ tx_hash: txHash, amount_eth: amountEth });
      await refreshTreasuryData(shop.id);
      setNotice(`Funding transaction submitted from owner wallet to merchant wallet. Tx ${txHash}.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not fund the merchant wallet.');
    } finally {
      setFunding(false);
    }
  }

  async function withdrawMerchantFunds() {
    if (!shop) return;

    const amountEth = normalizeEthAmount(withdrawAmount);
    if (!amountEth) {
      setError('Enter an ETH amount to withdraw to the owner wallet.');
      return;
    }

    try {
      setWithdrawing(true);
      setError(null);
      setNotice(null);
      setWithdrawTransfer(null);
      const transfer = await Shops.withdrawToOwner(shop.id, amountEth);
      setWithdrawTransfer(transfer);
      await refreshTreasuryData(shop.id);
      setNotice(`Merchant-wallet withdrawal submitted back to owner wallet. Tx ${transfer.tx_hash}.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not withdraw funds from the merchant wallet.');
    } finally {
      setWithdrawing(false);
    }
  }

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

  async function provisionMerchantWallet() {
    if (!shop) return;
    try {
      setWalletProvisioning(true);
      setNotice(null);
      setError(null);
      const updated = await Shops.provisionWallet(shop.id);
      setShop(updated);
      await refreshTreasuryData(shop.id);
      setNotice('Merchant wallet provisioned. This shop can now use a separate operational wallet for automated settlement.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not provision merchant wallet.');
    } finally {
      setWalletProvisioning(false);
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
      setNotice('Provider key saved and set active. A masked placeholder remains visible below so you know it is stored. Run the connection test to verify live chat.');
    } catch (err) {
      console.error(err);
      setError('Could not save provider key. Check backend encryption config.');
    } finally {
      setKeySaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen relative flex items-center justify-center" style={{ background: 'var(--wood-dark)' }}>
        <div className="candle-edge-glow" />
        <p className="tavern-muted" style={{ position: 'relative', zIndex: 1 }}>Loading owner dashboard…</p>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="min-h-screen relative px-6 py-10" style={{ background: 'var(--wood-dark)' }}>
        <div className="candle-edge-glow" />
        <div className="mx-auto max-w-3xl" style={{ position: 'relative', zIndex: 1 }}>
          <div className="shop-card rounded-panel p-6">
            <p className="tavern-muted">Pawn Agent Owner View</p>
            <h1 className="tavern-heading mt-2 text-3xl">Owner dashboard unavailable</h1>
            <p className="tavern-body-text mt-4">{error ?? 'No store selected yet.'}</p>
            <div className="mt-6 flex gap-3">
              <Link href="/" className="tavern-sign-link">
                Back to setup
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative merchant-study" style={{ background: '#1e1208' }}>
      <div className="candle-edge-glow" />

      {walletMismatch ? (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8" style={{ position: 'relative', zIndex: 1 }}>
          <div className="rounded-panel border p-6 text-center treasury-card">
            <p className="font-bold uppercase tracking-widest" style={{ color: 'var(--amber)' }}>Access Denied</p>
            <p className="text-sm mt-2" style={{ color: 'rgba(216,202,163,0.75)' }}>
              This dashboard belongs to a different wallet. Switch to the correct wallet to continue.
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8" style={{ position: 'relative', zIndex: 1 }}>
          {/* ── Ledger shell ── */}
          <div className="treasury-card rounded-panel p-6">
          {/* ── Header ── */}
          <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: 'rgba(196,168,112,0.2)' }}>
            <div className="min-w-0 flex-1">
              <p className="tavern-muted">Pawn Agent Owner View</p>
              <h1 className="tavern-heading mt-2 break-words text-3xl">Configure the storefront</h1>
              <p className="mt-2 max-w-2xl break-words tavern-body-text leading-6">
                Owner-administered storefront for <span className="text-onSurface">{shop.ens_name}</span>, with a separate merchant wallet for automated settlement.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.22em]" style={{ color: 'rgba(216,202,163,0.8)' }}>{ensVerificationLabel(shop.ens_verification_status)}</p>
              {shop.ens_verified_owner_address ? <p className="mt-2 break-words text-xs" style={{ color: 'rgba(196,168,112,0.8)' }}>Resolved owner {shop.ens_verified_owner_address}</p> : null}
              <p className="mt-2 break-words text-xs uppercase tracking-[0.24em] tavern-muted">Owner {ownerAddress ?? shop.owner_address}</p>
            </div>

            {/* Portrait */}
            <div className="merchant-inset rounded-panel p-3 sm:min-w-[13rem] min-w-0" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '112px', height: '128px', position: 'relative', overflow: 'hidden' }}>
                <Image
                  src={selectedPortrait.imageSrc}
                  alt={selectedPortrait.name}
                  fill
                  className="object-cover"
                  sizes="112px"
                  style={{
                    objectPosition: selectedPortrait.objectPosition ?? 'center 20%',
                    transform: `scale(${selectedPortrait.scale ?? 1.2})`,
                    transformOrigin: 'center top',
                  }}
                />
              </div>
              <p className="mt-3 text-center text-sm text-onSurface">{selectedPortrait.name}</p>
              <p className="mt-1 text-center text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>{selectedPortrait.vibe}</p>
            </div>

            {/* Nav */}
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end flex-shrink-0">
              <Link href={storefrontHref} className="tavern-sign-link text-center" style={{ flex: '1 1 auto', maxWidth: '12rem' }}>
                Storefront chat
              </Link>
              <Link href="/" className="tavern-sign-link text-center" style={{ flex: '1 1 auto', maxWidth: '8rem' }}>
                Setup
              </Link>
            </div>
          </div>

          {/* Notices */}
          {walletError ? (
            <p className="mt-4 rounded-panel border px-4 py-3 text-sm treasury-card">
              {walletError}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-panel border px-4 py-3 text-sm treasury-card">
              {notice}
            </p>
          ) : null}

          {/* ── Main content grid ── */}
          <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            {/* ── Left: Store profile ── */}
            <section className="merchant-inset min-w-0 overflow-hidden rounded-panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="study-section-header">Store Profile</h2>
                </div>
                <button
                  onClick={saveShopSettings}
                  disabled={saving}
                  className="brass-seal-btn shrink-0"
                >
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                {/* Portrait picker */}
                <div className="grid gap-3">
                  <span className="tavern-muted">Store keeper portrait</span>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {MERCHANT_PORTRAITS.map((portrait) => {
                      const selected = form.merchant_portrait === portrait.id;
                      return (
                        <button
                          key={portrait.id}
                          type="button"
                          onClick={() => updateField('merchant_portrait', portrait.id)}
                          className={`wall-frame${selected ? ' wall-frame--selected' : ''}`}
                        >
                          <div style={{ position: 'relative', height: '160px', width: '100%', overflow: 'hidden', borderRadius: '4px', background: '#120e04' }}>
                            <Image
                              src={portrait.imageSrc}
                              alt={portrait.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 50vw, 25vw"
                              style={{
                                objectPosition: portrait.objectPosition ?? 'center 20%',
                                transform: `scale(${portrait.scale ?? 1.2})`,
                                transformOrigin: 'center top',
                              }}
                            />
                          </div>
                          <p className="mt-3 break-words text-sm text-onSurface">{portrait.name}</p>
                          <p className="mt-1 break-words text-xs leading-5" style={{ color: 'rgba(216,202,163,0.75)' }}>{portrait.vibe}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Text fields */}
                {[
                  { key: 'display_name' as const, label: 'Merchant name' },
                  { key: 'description' as const, label: 'Store description', rows: 3 },
                  { key: 'merchant_persona' as const, label: 'Merchant vibe', rows: 4 },
                  { key: 'buying_preferences' as const, label: 'What this shop buys', rows: 3 },
                  { key: 'pricing_style' as const, label: 'Pricing posture', rows: 3 },
                  { key: 'refusal_rules' as const, label: 'When to refuse', rows: 3 },
                  { key: 'welcome_message' as const, label: 'Welcome line' },
                ].map(({ key, label: fieldLabel, rows }) => (
                  <label key={key} className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">{fieldLabel}</span>
                    {rows ? (
                      <textarea
                        value={form[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        rows={rows}
                        className="ledger-input"
                      />
                    ) : (
                      <input
                        value={form[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        className="ledger-input"
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>

            {/* ── Right: Treasury + LLM setup ── */}
            <section className="grid gap-6">
              {/* Treasury ledger */}
              <section className="treasury-coin-purse">
                <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: 'rgba(212,175,55,0.16)' }}>
                  <div>
                    <p className="tavern-muted">Treasury</p>
                    <p className="mt-2 max-w-2xl tavern-body-text">
                      This section shows the two wallets that matter operationally: the owner wallet that funds the system, and the merchant wallet that holds acquired assets and settles trades.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RainbowConnectAction
                      connectLabel="Choose owner wallet"
                      connectedLabel="Wallet connected"
                      className="tavern-sign-link"
                    />
                    {connectedWallet ? (
                      <button onClick={disconnectOwnerWallet} className="tavern-sign-link">Disconnect</button>
                    ) : null}
                    <button
                      onClick={() => refreshTreasuryData(shop.id)}
                      disabled={walletRefreshing}
                      className="tavern-sign-link"
                    >
                      {walletRefreshing ? 'Refreshing…' : 'Refresh balances'}
                    </button>
                  </div>
                </div>

                {/* Owner + Merchant wallet cards */}
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {/* Owner wallet */}
                  <div className="treasury-card rounded-panel p-4">
                    <p className="tavern-muted">Owner wallet</p>
                    <p className="mt-2 text-lg text-onSurface">{ownerAddress ? formatWallet(ownerAddress) : 'Unknown'}</p>
                    <p className="mt-1 break-words text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>{ownerAddress ?? 'No owner wallet found for this shop.'}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="tavern-muted">Connected browser</p>
                        <p className="mt-1 text-sm text-onSurface">{connectedWallet ? formatWallet(connectedWallet) : 'Not connected'}</p>
                        <p className="mt-1 text-xs" style={{ color: 'rgba(205,185,141,0.8)' }}>{connectedWallet ? (walletConnectorName ?? 'Wallet connected') : 'Choose a wallet above to fund from this browser.'}</p>
                      </div>
                      <div>
                        <p className="tavern-muted">Base Sepolia ETH</p>
                        <p className="mt-1 text-sm text-onSurface">{formatBalanceLine(ownerWalletBalance, 'ETH')}</p>
                        <p className="mt-1 text-xs" style={{ color: 'rgba(205,185,141,0.8)' }}>Read directly from the owner wallet address on-chain.</p>
                      </div>
                    </div>
                  </div>

                  {/* Merchant wallet */}
                  <div className="treasury-card rounded-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="tavern-muted">Merchant wallet</p>
                        <p className="mt-2 text-lg text-onSurface">
                          {(walletStatus?.wallet_status ?? shop.wallet_status) === 'pending'
                            ? 'Not provisioned yet'
                            : formatWallet(walletStatus?.merchant_address ?? shop.merchant_address)}
                        </p>
                        <p className="mt-1 break-words text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>{walletStatus?.merchant_address ?? shop.merchant_address}</p>
                      </div>
                      <button
                        onClick={provisionMerchantWallet}
                        disabled={walletProvisioning || walletStatusLoading || shop.wallet_status === 'active'}
                        className="tavern-sign-link"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {shop.wallet_status === 'active' ? 'Wallet active' : walletProvisioning ? 'Provisioning…' : walletStatusLoading ? 'Checking…' : 'Provision wallet'}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="tavern-muted">Status</p>
                        <p className="mt-1 text-sm text-onSurface">{walletStatus?.wallet_status ?? shop.wallet_status}</p>
                      </div>
                      <div>
                        <p className="tavern-muted">Mode</p>
                        <p className="mt-1 text-sm text-onSurface">
                          {(walletStatus?.wallet_provider_account_id ?? shop.wallet_provider_account_id ?? '').startsWith('alchemy_live_') ||
                          (walletStatus?.wallet_provider_account_id ?? shop.wallet_provider_account_id ?? '').startsWith('cdpwa_live_')
                            ? 'live'
                            : 'stub'}
                        </p>
                      </div>
                      <div>
                        <p className="tavern-muted">On-chain ETH</p>
                        <p className="mt-1 text-sm text-onSurface">{formatBalanceLine(merchantChainBalance, 'ETH')}</p>
                      </div>
                      <div>
                        <p className="tavern-muted">Live wallet primary balance</p>
                        <p className="mt-1 text-sm text-onSurface">{formatBalanceLine(walletStatus?.balance, walletStatus?.balance_symbol)}</p>
                      </div>
                      <div>
                        <p className="tavern-muted">Authenticated</p>
                        <p className="mt-1 text-sm text-onSurface">{walletStatus?.authenticated ? `Yes${walletStatus.authenticated_email ? ` • ${walletStatus.authenticated_email}` : ''}` : 'No'}</p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-panel border px-4 py-3 text-xs treasury-card">
                      Live settlement, holdings, and merchant-wallet withdrawals require a live `awal` wallet on Base Sepolia. Stub wallets are useful for flow testing only.
                    </div>
                    {walletStatusError ? (
                      <div className="mt-4 rounded-panel border px-4 py-3 text-xs treasury-card">
                        {walletStatusError}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Holdings + transfers */}
                <div className="mt-4 grid gap-4">
                  {/* Holdings */}
                  <div className="treasury-card rounded-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="tavern-muted">Merchant holdings</p>
                        <p className="mt-2 text-sm tavern-body-text">Current balances reported by the live merchant wallet on Base Sepolia.</p>
                      </div>
                      <p className="tavern-muted">{walletStatus?.holdings?.length ?? 0} assets</p>
                    </div>
                    {walletStatus?.holdings && walletStatus.holdings.length > 0 ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {walletStatus.holdings.map((holding) => (
                          <div key={`${holding.asset}-${holding.chain ?? 'unknown'}`} className="treasury-holding rounded-panel px-3 py-3">
                            <p className="tavern-muted">{formatHoldingLabel(holding.asset, holding.chain)}</p>
                            <p className="mt-1 text-base font-mono text-onSurface">{formatTokenBalance(holding.balance)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-panel border px-4 py-4 text-sm treasury-card">
                        No live token holdings are available yet. Authenticate `awal`, fund the merchant wallet, or let the merchant acquire assets through the settlement flow to populate this section.
                      </div>
                    )}
                  </div>

                  {/* Fund / withdraw */}
                  <div className="grid gap-4">
                    {/* Fund */}
                    <div className="treasury-card rounded-panel p-4">
                      <p className="tavern-muted">Owner → Merchant</p>
                      <p className="mt-2 text-sm tavern-body-text">Use the connected browser owner wallet to top up the merchant wallet with Base Sepolia ETH.</p>
                      <label className="mt-3 grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                        <span className="tavern-muted">Amount (ETH)</span>
                        <input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} className="ledger-input" />
                      </label>
                      <button
                        onClick={fundMerchantWallet}
                        disabled={funding}
                        className="brass-btn w-full mt-3"
                        style={{ textAlign: 'center' }}
                      >
                        {funding ? 'Funding…' : 'Fund merchant wallet'}
                      </button>
                      {fundTransfer ? (
                        <p className="mt-3 text-xs" style={{ color: '#6ee7b7' }}>Submitted {fundTransfer.amount_eth} ETH. Tx: {fundTransfer.tx_hash}</p>
                      ) : null}
                    </div>

                    {/* Withdraw */}
                    <div className="treasury-card rounded-panel p-4">
                      <p className="tavern-muted">Merchant → Owner</p>
                      <p className="mt-2 text-sm tavern-body-text">Use the live merchant wallet to withdraw Base Sepolia ETH back to the owner wallet.</p>
                      <label className="mt-3 grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                        <span className="tavern-muted">Amount (ETH)</span>
                        <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="ledger-input" />
                      </label>
                      <button
                        onClick={withdrawMerchantFunds}
                        disabled={withdrawing}
                        className="brass-btn w-full mt-3"
                        style={{ textAlign: 'center' }}
                      >
                        {withdrawing ? 'Withdrawing…' : 'Withdraw to owner wallet'}
                      </button>
                      {withdrawTransfer ? (
                        <p className="mt-3 text-xs" style={{ color: '#6ee7b7' }}>Submitted {withdrawTransfer.amount_eth} ETH back to {formatWallet(withdrawTransfer.recipient_address)}. Tx: {withdrawTransfer.tx_hash}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {/* LLM setup */}
              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tavern-muted">Active LLM setup</p>
                    <p className="mt-2 text-sm tavern-body-text">This is the key storefront chat will try first before falling back to scripted responses.</p>
                  </div>
                  {activeKey ? (
                    <button onClick={runActiveKeyTest} disabled={keyTesting} className="tavern-sign-link shrink-0">
                      {keyTesting ? 'Testing…' : 'Test active key'}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 rounded-panel border px-4 py-4 text-sm treasury-card">
                  {activeKey ? (
                    <div className="space-y-2">
                      <p><span className="tavern-muted">Status:</span> Active key configured</p>
                      <p><span className="tavern-muted">Stored key:</span> ************</p>
                      <p><span className="tavern-muted">Provider:</span> {activeKey.provider}</p>
                      <p><span className="tavern-muted">Model:</span> {activeKey.model ?? 'default'}</p>
                      <p><span className="tavern-muted">Label:</span> {activeKey.label ?? 'unnamed key'}</p>
                      <p><span className="tavern-muted">Last used:</span> {activeKey.last_used_at ? new Date(activeKey.last_used_at).toLocaleString() : 'Not used in live chat yet'}</p>
                    </div>
                  ) : (
                    <p>No active provider key yet. Storefront chat will use fallback merchant copy until you add one.</p>
                  )}
                </div>

                {keyTestResult ? (
                  <div className={`mt-3 rounded-panel border px-4 py-3 text-sm ${keyTestResult.ok ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'}`}>
                    <p className="tavern-muted">Connection test</p>
                    <p className="mt-2">
                      {keyTestResult.ok
                        ? `Live probe succeeded for ${keyTestResult.provider}${keyTestResult.model ? ` • ${keyTestResult.model}` : ''}.`
                        : `Probe failed for ${keyTestResult.provider}${keyTestResult.model ? ` • ${keyTestResult.model}` : ''}.`}
                    </p>
                    {keyTestResult.message ? <p className="mt-2 text-xs" style={{ color: 'inherit', opacity: 0.9 }}>Provider reply: {keyTestResult.message}</p> : null}
                    {keyTestResult.error ? <p className="mt-2 text-xs" style={{ color: 'inherit', opacity: 0.9 }}>Error: {keyTestResult.error}</p> : null}
                  </div>
                ) : null}
              </section>

              {/* Add provider key */}
              <section className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="tavern-muted">Add provider key</p>
                <form onSubmit={saveProviderKey} className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">Provider</span>
                    <select
                      value={provider}
                      onChange={(e) => updateProvider(e.target.value as CreateProviderKey['provider'])}
                      className="ledger-select"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">Model</span>
                    <input value={model} onChange={(e) => setModel(e.target.value)} className="ledger-input" />
                    <span className="text-xs" style={{ color: 'rgba(216,202,163,0.7)' }}>{PROVIDER_DEFAULTS[provider].help}</span>
                  </label>

                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">Label</span>
                    <input value={label} onChange={(e) => setLabel(e.target.value)} className="ledger-input" />
                  </label>

                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">API key</span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={activeKey ? '************' : 'Paste provider API key'}
                      className="ledger-input"
                    />
                    {activeKey ? <span className="text-xs" style={{ color: 'rgba(216,202,163,0.7)' }}>A key is already stored for this shop. Enter a new one only if you want to replace it.</span> : null}
                  </label>

                  <button
                    type="submit"
                    disabled={keySaving || !apiKey.trim()}
                    className="tavern-sign-link brass"
                    style={{ opacity: (keySaving || !apiKey.trim()) ? 0.6 : 1, cursor: (keySaving || !apiKey.trim()) ? 'not-allowed' : 'pointer' }}
                  >
                    {keySaving ? 'Saving key…' : 'Save provider key'}
                  </button>
                </form>
              </section>
            </section>
          </section>
        </div>
      </div>
      )}
    </main>
  );
}
