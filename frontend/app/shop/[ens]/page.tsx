'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import MerchantChat from '../../../components/MerchantChat';
import RainbowConnectAction from '../../../components/RainbowConnectAction';
import { Negotiations, Shops, type NegotiationSession, type Shop } from '../../../lib/api';
import { getMerchantPortraitById } from '../../../lib/merchantPortraits';
import { useUnifiedWallet } from '../../../lib/useUnifiedWallet';

const DEFAULT_INPUT_TOKEN = '0x0000000000000000000000000000000000000000';
const DEFAULT_INPUT_AMOUNT = '0';
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
  const walletLaunchHref = useMemo(() => {
    if (!shop || !walletAddress) return null;
    return `/shop/${encodeURIComponent(shop.ens_name)}?seller=${encodeURIComponent(walletAddress)}`;
  }, [shop, walletAddress]);
  const startFreshHref = useMemo(() => {
    if (!shop || !sellerAddress) return '/';
    return `/shop/${encodeURIComponent(shop.ens_name)}?seller=${encodeURIComponent(sellerAddress)}&fresh=1`;
  }, [shop, sellerAddress]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#171305] px-6 text-onSurface">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center">
          <p className="text-sm uppercase tracking-[0.28em] text-[#f0dfb4]">Opening the storefront…</p>
        </div>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="min-h-screen bg-[#171305] px-6 py-10 text-onSurface">
        <div className="mx-auto max-w-3xl merchant-panel rounded-panel p-6">
          <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Pawn Agent Storefront</p>
          <h1 className="mt-3 text-3xl text-onSurface">Store not found</h1>
          <p className="mt-4 text-sm text-[#f0dfb4]">
            {error ?? `We could not find a live storefront for ${ensName || 'that ENS name'}.`}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
              Back to marketplace
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#171305] px-4 py-6 text-onSurface sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="merchant-panel rounded-panel px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Pawn Agent Storefront</p>
              <h1 className="mt-2 text-3xl text-onSurface">{headline}</h1>
              <p className="mt-2 text-sm uppercase tracking-[0.24em] text-onSurfaceVariant">{shop.ens_name}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#d8caa3]">{ensVerificationLabel(shop.ens_verification_status)}</p>
              {shop.ens_verified_owner_address ? <p className="mt-2 break-all text-xs text-[#cbb68c]">Resolved owner {shop.ens_verified_owner_address}</p> : null}
              <p className="mt-3 text-sm text-[#f0dfb4]">
                {shop.description || 'State your token, amount, and ask. The merchant will respond in-line.'}
              </p>
            </div>
            <div className="merchant-inset rounded-panel p-3 sm:min-w-[14rem]">
              <div className="relative mx-auto h-40 w-32 overflow-hidden rounded-panel bg-[#120e04]">
                <Image src={selectedPortrait.imageSrc} alt={selectedPortrait.name} fill className="origin-bottom scale-[2] object-cover object-bottom" sizes="128px" />
              </div>
              <p className="mt-3 text-center text-sm text-onSurface">{selectedPortrait.name}</p>
              <p className="mt-1 text-center text-xs text-[#d8caa3]">{selectedPortrait.vibe}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                Browse shops
              </Link>
              <Link
                href={`/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`}
                className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow"
              >
                Owner dashboard
              </Link>
              {sellerAddress ? (
                <Link
                  href={startFreshHref}
                  className="rounded-panel border border-primary bg-brassButton px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-onPrimary"
                >
                  Start another fresh session
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {!negotiation ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="merchant-panel rounded-panel p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Start selling</p>
              <h2 className="mt-2 text-2xl text-onSurface">Open a clean negotiation session</h2>
              <p className="mt-3 text-sm text-[#f0dfb4]">
                This storefront no longer auto-loads a shared conversation. Connect a seller wallet and launch a fresh session for this shop directly, or browse other shops from the marketplace.
              </p>
              <div className="mt-4 rounded-panel border border-outlineVariant bg-surfaceLowest px-4 py-4 text-sm text-[#f0dfb4]">
                <p className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Seller wallet</p>
                <p className="mt-2 text-onSurface">{walletAddress ? formatWallet(walletAddress) : 'Not connected yet'}</p>
                <p className="mt-1 text-xs text-[#d8caa3]">
                  {walletAddress
                    ? `Connected through ${walletConnectorName ?? 'wallet'}. Starting here will create a fresh session for this seller wallet.`
                    : 'Choose the wallet you want to sell from, then launch a fresh session here.'}
                </p>
                {connectError ? <p className="mt-3 text-xs text-red-200">{connectError}</p> : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {walletLaunchHref ? (
                  <Link href={walletLaunchHref} className="rounded-panel border border-primary bg-brassButton px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-onPrimary">
                    Start fresh chat here
                  </Link>
                ) : (
                  <RainbowConnectAction
                    connectLabel="Choose wallet to start here"
                    connectedLabel="Wallet connected"
                    className="rounded-panel border border-primary bg-brassButton px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-onPrimary"
                  />
                )}
                <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-3 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                  Browse marketplace
                </Link>
                <Link
                  href={`/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`}
                  className="rounded-panel border border-outlineVariant px-4 py-3 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow"
                >
                  Open owner dashboard
                </Link>
              </div>
              {error ? (
                <p className="mt-5 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </section>

            <aside className="merchant-panel rounded-panel p-5 sm:p-6">
              <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Storefront status</p>
              <dl className="mt-4 space-y-3 text-sm text-[#f0dfb4]">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">ENS</dt>
                  <dd className="mt-1 text-base text-onSurface">{shop.ens_name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Store keeper</dt>
                  <dd className="mt-1 text-base text-onSurface">{selectedPortrait.name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">ENS route</dt>
                  <dd className="mt-1 text-base text-onSurface">{ensVerificationLabel(shop.ens_verification_status)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Merchant wallet</dt>
                  <dd className="mt-1 text-base text-onSurface">{formatWallet(shop.merchant_address)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Wallet state</dt>
                  <dd className="mt-1 text-base text-onSurface">{shop.wallet_status}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Owner</dt>
                  <dd className="mt-1 text-base text-onSurface">{formatWallet(shop.owner_address)}</dd>
                </div>
              </dl>
            </aside>
          </section>
        ) : (
          <section className="merchant-panel rounded-panel p-4 sm:p-5">
            <MerchantChat negotiationId={negotiation.id} shopEnsName={shop.ens_name} />
          </section>
        )}
      </div>
    </main>
  );
}
