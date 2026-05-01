'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import MerchantChat from '../../../components/MerchantChat';
import MerchantPortrait from '../../../components/Storefront/MerchantPortrait';
import RainbowConnectAction from '../../../components/RainbowConnectAction';
import { Negotiations, Shops, type NegotiationSession, type Shop } from '../../../lib/api';
import { getMerchantPortraitById } from '../../../lib/merchantPortraits';
import { useUnifiedWallet } from '../../../lib/useUnifiedWallet';

type DemoInventoryToken = {
  symbol: string;
  address: `0x${string}`;
  available: string;
  label: string;
};

const DEMO_TOKENS: DemoInventoryToken[] = [
  { symbol: 'DEGEN', address: '0x1111111111111111111111111111111111111111', available: '12,500', label: 'Degen Runoff' },
  { symbol: 'TIDE', address: '0x2222222222222222222222222222222222222222', available: '18,000', label: 'Tidal Governance' },
  { symbol: 'FROG', address: '0x3333333333333333333333333333333333333333', available: '42,000', label: 'Frog Liquidity' },
  { symbol: 'ORB', address: '0x4444444444444444444444444444444444444444', available: '7,200', label: 'Orb Credits' },
];

const DEFAULT_INPUT_TOKEN = DEMO_TOKENS[0].address;
const DEFAULT_INPUT_AMOUNT = '1000';
const SESSION_STORAGE_PREFIX = 'pawn-agent:shop-session:';

function formatWallet(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ensVerificationLabel(status: string | null | undefined) {
  return (status ?? 'manual').toLowerCase() === 'verified' ? 'Verified ENS storefront' : 'Manual ENS route';
}

function sessionStorageKey(ensName: string, sellerAddress: string) {
  return `${SESSION_STORAGE_PREFIX}${ensName.toLowerCase()}:${sellerAddress.toLowerCase()}`;
}

export default function ShopChatPage({ params }: { params: Promise<{ ens: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { walletAddress, walletConnectorName, connectError } = useUnifiedWallet();
  const [ensName, setEnsName] = useState('');
  const [shop, setShop] = useState<Shop | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sellerAddress, setSellerAddress] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<`0x${string}`>(DEFAULT_INPUT_TOKEN);
  const [selectedQuantity, setSelectedQuantity] = useState(DEFAULT_INPUT_AMOUNT);
  const [sessionStarting, setSessionStarting] = useState(false);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const resolved = await params;
        const decodedEns = decodeURIComponent(resolved.ens);
        if (!active) return;
        setEnsName(decodedEns);

        const matches = await Shops.list({ ens_name: decodedEns });
        const activeShop = matches[0] ?? null;
        if (!active) return;

        if (!activeShop) {
          setShop(null);
          setNegotiation(null);
          setError(`No shop found for ${decodedEns}.`);
          return;
        }

        setShop(activeShop);

        const seller = searchParams.get('seller');
        const forceFresh = searchParams.get('fresh') === '1';

        if (seller) {
          if (!isAddress(seller)) {
            throw new Error('The seller wallet address in this storefront link is invalid.');
          }

          const storageKey = sessionStorageKey(activeShop.ens_name, seller);
          const storedSessionId = forceFresh ? null : window.sessionStorage.getItem(storageKey);

          if (storedSessionId) {
            const session = await Negotiations.get(storedSessionId);
            if (!active) return;
            if (session.shop_id !== activeShop.id || session.seller_address.toLowerCase() !== seller.toLowerCase()) {
              window.sessionStorage.removeItem(storageKey);
            } else {
              setNegotiation(session);
              setSellerAddress(session.seller_address);
              return;
            }
          }

          const newSession = await Negotiations.create({
            shop_id: activeShop.id,
            seller_address: seller,
            input_token: DEFAULT_INPUT_TOKEN,
            input_amount: DEFAULT_INPUT_AMOUNT,
          });

          if (!active) return;
          window.sessionStorage.setItem(storageKey, newSession.id);
          setNegotiation(newSession);
          setSellerAddress(newSession.seller_address);
          router.replace(`/shop/${encodeURIComponent(activeShop.ens_name)}?seller=${encodeURIComponent(newSession.seller_address)}`);
          return;
        }

        setNegotiation(null);
        setSellerAddress(null);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setNegotiation(null);
        setError(err instanceof Error ? err.message : 'Could not load this storefront chat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [params, router, searchParams]);

  const headline = useMemo(() => shop?.display_name ?? ensName ?? 'Pawn Agent Storefront', [shop, ensName]);
  const selectedPortrait = useMemo(() => getMerchantPortraitById(shop?.merchant_portrait), [shop?.merchant_portrait]);
  const selectedToken = useMemo(() => DEMO_TOKENS.find((token) => token.address === selectedTokenAddress) ?? DEMO_TOKENS[0], [selectedTokenAddress]);
  const startFreshHref = useMemo(() => {
    if (!shop) return '/';
    return `/shop/${encodeURIComponent(shop.ens_name)}`;
  }, [shop]);

  async function handleStartSession() {
    if (!shop || !walletAddress) {
      setError('Connect the seller wallet you want to sell from before starting a session.');
      return;
    }

    const normalizedQuantity = selectedQuantity.trim();
    if (!normalizedQuantity || Number(normalizedQuantity) <= 0) {
      setError('Enter how many tokens you want to sell.');
      return;
    }

    try {
      setSessionStarting(true);
      setError(null);
      const newSession = await Negotiations.create({
        shop_id: shop.id,
        seller_address: walletAddress,
        input_token: selectedToken.address,
        input_amount: normalizedQuantity,
      });
      const introMessage = `I want to sell ${normalizedQuantity} ${selectedToken.symbol} tokens. What can you offer?`;
      await Negotiations.chat(newSession.id, introMessage);
      const hydratedSession = await Negotiations.get(newSession.id);
      const storageKey = sessionStorageKey(shop.ens_name, walletAddress);
      window.sessionStorage.setItem(storageKey, hydratedSession.id);
      setSellerAddress(walletAddress);
      setNegotiation(hydratedSession);
      router.replace(`/shop/${encodeURIComponent(shop.ens_name)}?seller=${encodeURIComponent(walletAddress)}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not start the selling session.');
    } finally {
      setSessionStarting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen relative" style={{ background: 'var(--wood-dark)' }}>
        <div className="candle-edge-glow" />
        <div className="mx-auto flex min-h-screen items-center justify-center" style={{ position: 'relative', zIndex: 1 }}>
          <p className="tavern-muted">Opening the storefront…</p>
        </div>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="min-h-screen relative" style={{ background: 'var(--wood-dark)' }}>
        <div className="candle-edge-glow" />
        <div className="mx-auto max-w-3xl px-6 py-10" style={{ position: 'relative', zIndex: 1 }}>
          <div className="shop-card rounded-panel p-6">
            <p className="tavern-muted">Pawn Agent Storefront</p>
            <h1 className="tavern-heading mt-3 text-3xl">Store not found</h1>
            <p className="tavern-body-text mt-4">
              {error ?? `We could not find a live storefront for ${ensName || 'that ENS name'}.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className="tavern-sign-link">
                Back to marketplace
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative" style={{ background: 'var(--wood-dark)' }}>
      {/* Ambient candle glow */}
      <div className="candle-edge-glow" />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8" style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Shop header ── */}
        <section className="shop-card rounded-panel px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="tavern-muted">Pawn Agent Storefront</p>
              <h1 className="tavern-heading mt-2 text-3xl">{headline}</h1>
              <p className="mt-2 tavern-muted">{shop.ens_name}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.22em]" style={{ color: 'rgba(216,202,163,0.8)' }}>{ensVerificationLabel(shop.ens_verification_status)}</p>
              {shop.ens_verified_owner_address ? <p className="mt-2 break-all text-xs" style={{ color: 'rgba(196,168,112,0.8)' }}>Resolved owner {shop.ens_verified_owner_address}</p> : null}
              <p className="mt-3 tavern-body-text">
                {shop.description || 'State your token, amount, and ask. The merchant will respond in-line.'}
              </p>
            </div>

            {/* Merchant portrait — using Storefront component */}
            <div className="merchant-inset rounded-panel p-3 sm:min-w-[14rem]" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '128px', height: '160px', position: 'relative' }}>
                <Image
                  src={selectedPortrait.imageSrc}
                  alt={selectedPortrait.name}
                  fill
                  className="object-cover"
                  sizes="128px"
                  style={{
                    objectPosition: selectedPortrait.objectPosition ?? 'center 20%',
                    transformOrigin: 'center top',
                    transform: `scale(${selectedPortrait.scale ?? 1.2})`,
                  }}
                />
              </div>
              <p className="mt-3 text-center text-sm text-onSurface">{selectedPortrait.name}</p>
              <p className="mt-1 text-center text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>{selectedPortrait.vibe}</p>
            </div>

            {/* Navigation links */}
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="tavern-sign-link">
                Browse shops
              </Link>
              <Link
                href={`/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`}
                className="tavern-sign-link"
              >
                Owner dashboard
              </Link>
              {sellerAddress ? (
                <Link
                  href={startFreshHref}
                  className="tavern-sign-link brass"
                >
                  Start another fresh session
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── No negotiation state: show launch panel ── */}
        {!negotiation ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="shop-card rounded-panel p-5 sm:p-6">
              <p className="tavern-muted">Start selling</p>
              <h2 className="tavern-heading mt-2 text-2xl">Open a clean negotiation session</h2>
              <p className="tavern-body-text mt-3">
                Start with a clean intake card so the merchant knows exactly which token lot you want to unload. For demo purposes, the shop assumes the token is distressed and quotes a tiny ETH amount based on quantity and the merchant's mood.
              </p>
              <div className="mt-4 rounded-panel border px-4 py-4 text-sm" style={{ borderColor: 'rgba(196,168,112,0.25)', background: 'rgba(18,14,5,0.8)', color: 'rgba(240,224,179,0.9)' }}>
                <p className="tavern-muted">Seller wallet</p>
                <p className="mt-2 text-onSurface">{walletAddress ? formatWallet(walletAddress) : 'Not connected yet'}</p>
                <p className="mt-1 text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>
                  {walletAddress
                    ? `Connected through ${walletConnectorName ?? 'wallet'}. Starting here will create a fresh session for this seller wallet.`
                    : 'Choose the wallet you want to sell from, then launch a fresh session here.'}
                </p>
                {connectError ? <p className="mt-3 text-xs text-red-200">{connectError}</p> : null}
              </div>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">Token lot</span>
                    <select
                      value={selectedTokenAddress}
                      onChange={(e) => setSelectedTokenAddress(e.target.value as `0x${string}`)}
                      className="ledger-select"
                      disabled={!walletAddress || sessionStarting}
                    >
                      {DEMO_TOKENS.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol} — {token.available} available — {token.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm" style={{ color: 'rgba(244,231,199,0.9)' }}>
                    <span className="tavern-muted">Quantity to sell</span>
                    <input
                      value={selectedQuantity}
                      onChange={(e) => setSelectedQuantity(e.target.value)}
                      className="ledger-input"
                      inputMode="decimal"
                      disabled={!walletAddress || sessionStarting}
                    />
                  </label>
                </div>
                <div className="rounded-panel border px-4 py-4 text-sm" style={{ borderColor: 'rgba(196,168,112,0.25)', background: 'rgba(18,14,5,0.8)', color: 'rgba(240,224,179,0.9)' }}>
                  <p className="tavern-muted">Selected inventory</p>
                  <p className="mt-2 text-onSurface">{selectedToken.symbol} • {selectedToken.available} available</p>
                  <p className="mt-1 text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>The merchant will treat this as distressed inventory and open with a tiny ETH quote in the demo flow.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {walletAddress ? (
                    <button onClick={handleStartSession} className="tavern-sign-link brass" disabled={sessionStarting}>
                      {sessionStarting ? 'Opening session…' : 'Start selling session'}
                    </button>
                  ) : (
                    <RainbowConnectAction
                      connectLabel="Choose wallet to start here"
                      connectedLabel="Wallet connected"
                      className="tavern-sign-link brass"
                    />
                  )}
                  <Link href="/" className="tavern-sign-link">
                    Browse marketplace
                  </Link>
                  <Link
                    href={`/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`}
                    className="tavern-sign-link"
                  >
                    Open owner dashboard
                  </Link>
                </div>
              </div>
              {error ? (
                <p className="mt-5 rounded-panel border px-4 py-3 text-sm" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(127,29,29,0.3)', color: '#fecaca' }}>
                  {error}
                </p>
              ) : null}
            </section>

            {/* Store status aside */}
            <aside className="shop-card rounded-panel p-5 sm:p-6">
              <p className="tavern-muted">Storefront status</p>
              <dl className="mt-4 space-y-3 text-sm tavern-body-text">
                <div>
                  <dt className="tavern-muted">ENS</dt>
                  <dd className="mt-1 text-base text-onSurface">{shop.ens_name}</dd>
                </div>
                <div>
                  <dt className="tavern-muted">Store keeper</dt>
                  <dd className="mt-1 text-base text-onSurface">{selectedPortrait.name}</dd>
                </div>
                <div>
                  <dt className="tavern-muted">ENS route</dt>
                  <dd className="mt-1 text-base text-onSurface">{ensVerificationLabel(shop.ens_verification_status)}</dd>
                </div>
                <div>
                  <dt className="tavern-muted">Merchant wallet</dt>
                  <dd className="mt-1 text-base text-onSurface">{formatWallet(shop.merchant_address)}</dd>
                </div>
                <div>
                  <dt className="tavern-muted">Wallet state</dt>
                  <dd className="mt-1 text-base text-onSurface">{shop.wallet_status}</dd>
                </div>
                <div>
                  <dt className="tavern-muted">Owner</dt>
                  <dd className="mt-1 text-base text-onSurface">{formatWallet(shop.owner_address)}</dd>
                </div>
              </dl>
            </aside>
          </section>
        ) : (
          /* ── Active negotiation: show MerchantChat ── */
          <section className="shop-card rounded-panel p-4 sm:p-5">
            <MerchantChat negotiationId={negotiation.id} shopEnsName={shop.ens_name} />
          </section>
        )}
      </div>
    </main>
  );
}
