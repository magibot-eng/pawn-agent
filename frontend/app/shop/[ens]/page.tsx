'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import MerchantChat from '../../../components/MerchantChat';
import { Negotiations, Shops, type NegotiationSession, type Shop } from '../../../lib/api';

const SELLER_SESSION_ADDRESS = '0x0000000000000000000000000000000000000bad';
const DEFAULT_INPUT_TOKEN = '0x0000000000000000000000000000000000000000';
const DEFAULT_INPUT_AMOUNT = '0';

export default function ShopChatPage({ params }: { params: Promise<{ ens: string }> }) {
  const [ensName, setEnsName] = useState('');
  const [shop, setShop] = useState<Shop | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const existingSessions = await Negotiations.listByShop(activeShop.id, false);
        if (!active) return;

        const session =
          existingSessions[0] ??
          (await Negotiations.create({
            shop_id: activeShop.id,
            seller_address: SELLER_SESSION_ADDRESS,
            input_token: DEFAULT_INPUT_TOKEN,
            input_amount: DEFAULT_INPUT_AMOUNT,
          }));

        if (!active) return;
        setNegotiation(session);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError('Could not load this storefront chat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [params]);

  const headline = useMemo(() => shop?.display_name ?? ensName ?? 'Pawn Agent Storefront', [shop, ensName]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#171305] text-onSurface flex items-center justify-center px-6">
        <p className="text-sm uppercase tracking-[0.28em] text-[#f0dfb4]">Opening the storefront…</p>
      </main>
    );
  }

  if (!shop || !negotiation) {
    return (
      <main className="min-h-screen bg-[#171305] text-onSurface px-6 py-10">
        <div className="mx-auto max-w-3xl merchant-panel rounded-panel p-6">
          <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Pawn Agent Storefront</p>
          <h1 className="mt-3 text-3xl text-onSurface">Store not found</h1>
          <p className="mt-4 text-sm text-[#f0dfb4]">
            {error ?? `We could not find a live storefront for ${ensName || 'that ENS name'}.`}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
              Go to setup
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#171305] text-onSurface px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="merchant-panel rounded-panel px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Pawn Agent Storefront</p>
              <h1 className="mt-2 text-3xl text-onSurface">{headline}</h1>
              <p className="mt-2 text-sm uppercase tracking-[0.24em] text-onSurfaceVariant">{shop.ens_name}</p>
              <p className="mt-3 max-w-3xl text-sm text-[#f0dfb4]">
                {shop.description || 'State your token, amount, and ask. The merchant will respond in-line.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                Open setup
              </Link>
              <Link
                href={`/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`}
                className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow"
              >
                Owner dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="merchant-panel rounded-panel p-4 sm:p-5">
          <MerchantChat negotiationId={negotiation.id} shopEnsName={shop.ens_name} />
        </section>
      </div>
    </main>
  );
}
