'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import RainbowConnectAction from '../components/RainbowConnectAction';
import { Shops, type Shop } from '../lib/api';
import { DEFAULT_MERCHANT_PORTRAIT_ID } from '../lib/merchantPortraits';
import { useUnifiedWallet } from '../lib/useUnifiedWallet';

const STORAGE_KEY = 'pawn-agent:selected-store';

function looksLikeEns(value: string) {
  return value.trim().toLowerCase().endsWith('.eth');
}

function formatWallet(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ensVerificationLabel(status: string | null | undefined) {
  return (status ?? 'manual').toLowerCase() === 'verified' ? 'Verified ENS route' : 'Manual ENS route';
}

function isStorefrontActive(shop: Shop) {
  const shopStatus = (shop.status ?? '').toLowerCase();
  return shopStatus === 'published';
}

export default function HomePage() {
  const {
    walletAddress,
    ensName: primaryEns,
    ensLookupError,
    disconnectWallet,
    connectError,
    walletConnectorName,
    resolveEnsOwnerAddress,
  } = useUnifiedWallet();

  const [ensInput, setEnsInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketShops, setMarketShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const [ensVerificationStatus, setEnsVerificationStatus] = useState<'idle' | 'checking' | 'verified' | 'manual'>('idle');
  const [ensVerificationMessage, setEnsVerificationMessage] = useState<string | null>(null);
  const [ensVerifiedOwnerAddress, setEnsVerifiedOwnerAddress] = useState<string | null>(null);

  async function loadMarketplaceShops() {
    try {
      setShopsLoading(true);
      setShopsError(null);
      const allShops = await Shops.list();
      setMarketShops(allShops.filter(isStorefrontActive));
    } catch (err) {
      console.error(err);
      setShopsError(err instanceof Error ? err.message : 'Could not load published pawn shops.');
    } finally {
      setShopsLoading(false);
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { owner?: string; ens?: string };
        if (parsed.ens) setEnsInput(parsed.ens);
      }
    } catch (err) {
      console.error(err);
    }

    loadMarketplaceShops();
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    setStatus(
      primaryEns
        ? `Wallet connected through ${walletConnectorName ?? 'your wallet'}. Detected existing ENS: ${primaryEns}. You can browse live pawn shops or use it as your owner route below.`
        : ensLookupError
          ? `Wallet connected through ${walletConnectorName ?? 'your wallet'}. ${ensLookupError} You can still browse shops or choose a .eth route for your own storefront.`
          : `Wallet connected through ${walletConnectorName ?? 'your wallet'}. No ENS detected on this wallet. You can still browse shops or choose a .eth route for your own storefront.`
    );
    setError(null);
  }, [walletAddress, primaryEns, ensLookupError, walletConnectorName]);

  async function verifyEnsRoute(normalizedEns: string, ownerAddress: string) {
    const resolvedOwner = await resolveEnsOwnerAddress(normalizedEns);
    if (resolvedOwner && resolvedOwner.toLowerCase() === ownerAddress.toLowerCase()) {
      return {
        status: 'verified' as const,
        verifiedOwnerAddress: resolvedOwner,
        message: `Verified. ${normalizedEns} resolves to the connected wallet.`,
      };
    }

    if (resolvedOwner) {
      return {
        status: 'manual' as const,
        verifiedOwnerAddress: null,
        message: `${normalizedEns} resolves to ${formatWallet(resolvedOwner)}, not the connected wallet. The route can still be used manually, but it is not verified for this owner.`,
      };
    }

    return {
      status: 'manual' as const,
      verifiedOwnerAddress: null,
      message: `${normalizedEns} does not currently resolve to an owner address on mainnet. The route can still be used manually for testing, but it is not verified.`,
    };
  }

  useEffect(() => {
    let active = true;

    async function refreshEnsVerification() {
      const normalizedEns = ensInput.trim().toLowerCase();
      if (!walletAddress || !looksLikeEns(normalizedEns)) {
        setEnsVerificationStatus('idle');
        setEnsVerificationMessage(null);
        setEnsVerifiedOwnerAddress(null);
        return;
      }

      try {
        setEnsVerificationStatus('checking');
        const result = await verifyEnsRoute(normalizedEns, walletAddress);
        if (!active) return;
        setEnsVerificationStatus(result.status);
        setEnsVerificationMessage(result.message);
        setEnsVerifiedOwnerAddress(result.verifiedOwnerAddress);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setEnsVerificationStatus('manual');
        setEnsVerificationMessage('Could not verify this ENS route right now. You can still use it manually.');
        setEnsVerifiedOwnerAddress(null);
      }
    }

    refreshEnsVerification();
    return () => {
      active = false;
    };
  }, [ensInput, walletAddress, resolveEnsOwnerAddress]);

  async function handleDisconnectWallet() {
    try {
      await disconnectWallet();
      setShop(null);
      setStatus('Wallet disconnected. Reconnect or switch wallets to continue.');
      setError(null);

      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as { owner?: string; ens?: string }) : null;
      const typedEns = ensInput.trim().toLowerCase();
      const preservedEns = parsed?.ens ? parsed.ens : typedEns;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preservedEns ? { ens: preservedEns } : {}));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not disconnect wallet.');
    }
  }

  async function createOrLoadStore() {
    if (!walletAddress) {
      setError('Connect a wallet first.');
      return;
    }
    if (!looksLikeEns(ensInput)) {
      setError('Enter a valid ENS or subdomain ending in .eth.');
      return;
    }

    const normalizedEns = ensInput.trim().toLowerCase();

    try {
      setCreating(true);
      setError(null);
      setStatus(null);

      const existing = await Shops.list({ owner_address: walletAddress, ens_name: normalizedEns });
      const activeShop =
        existing[0] ??
        (await Shops.create({
          owner_address: walletAddress,
          ens_name: normalizedEns,
          display_name: normalizedEns,
          description: `ENS-native buyout storefront for ${normalizedEns}.`,
          merchant_persona: 'Direct, brief, skeptical merchant. No fluff.',
          buying_preferences: 'Distressed token positions, governance tokens, liquid long-tail assets.',
          pricing_style: 'Conservative on risk, fair on clean opportunities, never overpay.',
          refusal_rules: 'Refuse unclear token identity, fake urgency, or missing details.',
          welcome_message: 'State the token, amount, and your ask.',
          merchant_portrait: DEFAULT_MERCHANT_PORTRAIT_ID,
          payout_token: '0x0000000000000000000000000000000000000000',
          wallet_provider: 'cdp_agentic_wallet',
          wallet_status: 'pending',
          auto_settlement_enabled: false,
        }));

      setShop(activeShop);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: walletAddress, ens: normalizedEns }));
      setStatus(
        existing[0]
          ? 'Loaded existing store.'
          : `Store created and listed. ${activeShop.ens_verification_status === 'verified' ? 'ENS route verified by the backend against the connected wallet.' : 'ENS route saved as a manual route by the backend.'} The owner wallet is linked as admin only — provision the separate merchant wallet from the owner dashboard when you are ready for settlement.`
      );
      await loadMarketplaceShops();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Could not create or load store.';
      if (message.includes('already claimed')) {
        setError(`That ENS storefront route is already claimed. Connect the wallet that owns it, or choose a different .eth route.`);
      } else {
        setError(message);
      }
    } finally {
      setCreating(false);
    }
  }

  const sellerFilteredShops = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return marketShops;
    return marketShops.filter((candidate) => {
      const haystack = [candidate.display_name, candidate.ens_name, candidate.description ?? ''].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [marketShops, searchQuery]);

  const sellerHref = useMemo(() => (shop ? `/shop/${encodeURIComponent(shop.ens_name)}` : null), [shop]);
  const ownerHref = useMemo(
    () =>
      shop
        ? `/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`
        : null,
    [shop]
  );

  const walletError = error ?? connectError;

  return (
    <main className="min-h-screen relative" style={{ background: 'var(--wood-dark)' }}>
      {/* Ambient candle glow */}
      <div className="candle-edge-glow" />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8" style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Hero / wallet section ── */}
        <section className="shop-card rounded-panel p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="tavern-muted">Pawn Agent Marketplace</p>
              <h1 className="tavern-heading mt-2 text-3xl sm:text-4xl">Browse active pawn shops and open a fresh seller chat</h1>
              <p className="tavern-body-text mt-3">
                Search for live storefronts, pick the wallet you want to sell from, and launch a clean negotiation session with that pawn shop agent.
              </p>
            </div>

            <div className="merchant-inset rounded-panel p-4 sm:min-w-[20rem]">
              <p className="tavern-muted">Seller wallet</p>
              <p className="mt-2 text-base text-onSurface">{walletAddress ? formatWallet(walletAddress) : 'Not connected yet'}</p>
              <p className="mt-1 text-xs" style={{ color: 'rgba(240,224,179,0.75)' }}>
                {walletAddress
                  ? `Connected through ${walletConnectorName ?? 'wallet'}. Use this wallet to launch a fresh session with any active shop below.`
                  : 'Choose MetaMask, Coinbase Wallet, or another injected browser wallet before starting a chat.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <RainbowConnectAction
                  connectLabel="Choose wallet"
                  connectedLabel="Wallet connected"
                />
                {walletAddress ? (
                  <button
                    onClick={handleDisconnectWallet}
                    className="tavern-sign-link"
                    style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* ── Main content grid ── */}
        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
          {/* ── Published shops listing ── */}
          <section className="shop-card rounded-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: 'rgba(196,168,112,0.2)' }}>
              <div>
                <p className="tavern-muted">Published pawn shops</p>
                <h2 className="tavern-heading mt-2 text-2xl">Find a buyer</h2>
                <p className="tavern-body-text mt-2 max-w-2xl">
                  Every launch below starts a new negotiation session. No reused storefront state, no inherited prior conversation.
                </p>
              </div>

              <label className="block sm:max-w-xs sm:flex-1">
                <span className="sr-only">Search pawn shops</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ENS or shop name"
                  className="parchment-input"
                />
              </label>
            </div>

            <div className="mt-5 space-y-4">
              {shopsLoading ? <p className="tavern-body-text">Loading published pawn shops…</p> : null}
              {shopsError ? (
                <div className="rounded-panel border px-4 py-3 text-sm" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(127,29,29,0.3)', color: '#fecaca' }}>
                  {shopsError}
                </div>
              ) : null}

              {!shopsLoading && !shopsError && sellerFilteredShops.length === 0 ? (
                <div className="rounded-panel border px-4 py-4 text-sm" style={{ borderColor: 'rgba(196,168,112,0.25)', background: 'rgba(18,14,5,0.8)', color: 'rgba(240,224,179,0.85)' }}>
                  {marketShops.length === 0
                    ? 'No published pawn shops are live yet. Create a storefront to make one appear here.'
                    : 'No published pawn shops match that search.'}
                </div>
              ) : null}

              {sellerFilteredShops.map((candidate) => {
                const freshSessionHref = walletAddress
                  ? `/shop/${encodeURIComponent(candidate.ens_name)}?seller=${encodeURIComponent(walletAddress)}`
                  : null;

                return (
                  <article key={candidate.id} className="merchant-inset rounded-panel p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg text-onSurface">{candidate.display_name}</p>
                          <span className="tavern-badge published">Published storefront</span>
                          <span className="tavern-badge pending">Wallet {candidate.wallet_status}</span>
                        </div>
                        <p className="mt-1 tavern-muted">{candidate.ens_name}</p>
                        <p className="mt-3 tavern-body-text">
                          {candidate.description || 'State the token, amount, and your ask. This pawn shop will quote in-line.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em]" style={{ color: 'rgba(196,168,112,0.75)' }}>
                          <span>Status {candidate.status}</span>
                          <span>{ensVerificationLabel(candidate.ens_verification_status)}</span>
                          <span>Merchant {formatWallet(candidate.merchant_address)}</span>
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[13rem]">
                        {freshSessionHref ? (
                          <Link href={freshSessionHref} className="tavern-sign-link brass" style={{ textAlign: 'center' }}>
                            Start fresh chat
                          </Link>
                        ) : (
                          <RainbowConnectAction
                            connectLabel="Choose wallet to start"
                            connectedLabel="Wallet connected"
                            className="tavern-sign-link"
                            />
                        )}
                        <Link
                          href={`/shop/${encodeURIComponent(candidate.ens_name)}`}
                          className="tavern-sign-link"
                          style={{ textAlign: 'center' }}
                        >
                          Preview storefront
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── Sidebar ── */}
          <aside className="space-y-5">
            {/* How it works */}
            <section className="shop-card rounded-panel p-5 sm:p-6">
              <p className="tavern-muted">How seller sessions work now</p>
              <ol className="mt-4 space-y-3 tavern-body-text" style={{ paddingLeft: '1rem' }}>
                <li>1. Choose your wallet once.</li>
                <li>2. Search for a live pawn shop.</li>
                <li>3. Click <span className="text-onSurface">Start fresh chat</span>.</li>
                <li>4. Pawn Agent creates a new negotiation just for that seller session.</li>
                <li>5. Refreshing that session keeps your thread instead of leaking another seller&apos;s state.</li>
              </ol>
            </section>

            {/* Owner setup */}
            <section className="shop-card rounded-panel p-5 sm:p-6">
              <p className="tavern-muted">Open your own pawn shop</p>
              <h2 className="tavern-heading mt-2 text-2xl">Owner setup</h2>
              <p className="tavern-body-text mt-2">
                Choose the wallet that will own this shop, pick the .eth route customers will use, and create the storefront.
              </p>

              <div className="mt-5 space-y-4">
                <div className="merchant-inset rounded-panel p-4">
                  <p className="tavern-muted">Connected owner wallet</p>
                  <p className="mt-2 text-base text-onSurface">{walletAddress ? formatWallet(walletAddress) : 'Not connected yet'}</p>
                  {walletAddress ? <p className="mt-1 text-xs" style={{ color: 'rgba(216,202,163,0.8)' }}>{walletAddress}</p> : null}
                </div>

                <div className="merchant-inset rounded-panel p-4">
                  <p className="tavern-muted">Detected ENS on this wallet</p>
                  <p className="mt-2 text-base text-onSurface">{primaryEns ?? 'No ENS detected on this wallet'}</p>
                  <p className="mt-2 text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>
                    This wallet lookup is live. If your chosen route resolves back to this wallet, Pawn Agent will mark it as a verified ENS route.
                  </p>
                </div>

                <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                  <span className="tavern-muted">Shop route (.eth for now)</span>
                  <input
                    value={ensInput}
                    onChange={(e) => setEnsInput(e.target.value)}
                    placeholder="ted.eth or pawn.ted.eth"
                    className="parchment-input"
                  />
                  <span className="text-xs" style={{ color: 'rgba(216,202,163,0.7)' }}>
                    This creates your storefront identity inside Pawn Agent. It does not create or register the ENS name onchain.
                  </span>
                </label>

                {looksLikeEns(ensInput) ? (
                  <div className={`rounded-panel border px-4 py-4 text-sm ${ensVerificationStatus === 'verified' ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300' : ensVerificationStatus === 'checking' ? 'border-amber-500/40 bg-amber-950/20 text-amber-200' : 'border-outlineVariant bg-surfaceLowest text-onSurface'}`}>
                    <p className="tavern-muted">Route verification</p>
                    <p className="mt-2 text-onSurface">
                      {ensVerificationStatus === 'checking'
                        ? 'Checking ENS ownership…'
                        : ensVerificationStatus === 'idle'
                          ? 'Connect wallet to verify this route'
                          : ensVerificationLabel(ensVerificationStatus)}
                    </p>
                    {ensVerificationMessage ? <p className="mt-2 text-xs" style={{ color: 'inherit', opacity: 0.9 }}>{ensVerificationMessage}</p> : null}
                    {ensVerifiedOwnerAddress ? <p className="mt-2 text-xs" style={{ color: 'inherit', opacity: 0.9 }}>Resolved owner: {ensVerifiedOwnerAddress}</p> : null}
                  </div>
                ) : null}

                <button
                  onClick={createOrLoadStore}
                  disabled={creating || !walletAddress}
                  className="tavern-sign-link brass w-full"
                  style={{ textAlign: 'center', opacity: (creating || !walletAddress) ? 0.6 : 1, cursor: (creating || !walletAddress) ? 'not-allowed' : 'pointer' }}
                >
                  {creating ? 'Preparing shop…' : 'Create or load shop'}
                </button>
              </div>
            </section>
          </aside>
        </section>

        {/* ── Status / error notices ── */}
        {status ? (
          <p className="rounded-panel border px-4 py-3 text-sm" style={{ borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(6,78,59,0.3)', color: '#6ee7b7' }}>
            {status}
          </p>
        ) : null}
        {walletError ? (
          <p className="rounded-panel border px-4 py-3 text-sm" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(127,29,29,0.3)', color: '#fecaca' }}>
            {walletError}
          </p>
        ) : null}

        {/* ── Current owner storefront ── */}
        {shop ? (
          <section className="shop-card rounded-panel p-5 sm:p-6">
            <p className="tavern-muted">Current owner storefront</p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-2xl text-onSurface">{shop.ens_name}</p>
                <p className="mt-2 tavern-body-text">Owner {formatWallet(shop.owner_address)}</p>
                <p className="mt-1 tavern-body-text">{ensVerificationLabel(shop.ens_verification_status)}</p>
                {shop.ens_verified_owner_address ? <p className="mt-1 break-all text-xs" style={{ color: 'rgba(196,168,112,0.8)' }}>Resolved owner {shop.ens_verified_owner_address}</p> : null}
                <p className="mt-1 tavern-body-text">
                  Merchant wallet {shop.wallet_status === 'pending' ? 'not provisioned yet' : formatWallet(shop.merchant_address)}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.22em] tavern-muted">
                  {shop.wallet_provider} • {shop.wallet_status}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {ownerHref ? (
                  <Link href={ownerHref} className="tavern-sign-link">
                    Open owner dashboard
                  </Link>
                ) : null}
                {sellerHref ? (
                  <Link href={sellerHref} className="tavern-sign-link">
                    Preview storefront
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
