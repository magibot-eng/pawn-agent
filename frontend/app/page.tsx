'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { Shops, type Shop } from '../lib/api';

const STORAGE_KEY = 'pawn-agent:selected-store';
const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function looksLikeEns(value: string) {
  return value.trim().toLowerCase().endsWith('.eth');
}

function formatWallet(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function HomePage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [primaryEns, setPrimaryEns] = useState<string | null>(null);
  const [ensInput, setEnsInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function restoreWallet() {
      if (!window.ethereum) return;
      try {
        const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
        const first = accounts[0];
        if (!first || !isAddress(first)) return;
        const checksum = getAddress(first);
        setWalletAddress(checksum);
        const ensName = await mainnetClient.getEnsName({ address: checksum });
        setPrimaryEns(ensName ?? null);
        if (ensName) {
          setEnsInput((current) => current || ensName);
        }
      } catch (err) {
        console.error(err);
      }
    }

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { owner?: string; ens?: string };
        if (parsed.ens) setEnsInput(parsed.ens);
        if (parsed.owner && isAddress(parsed.owner)) setWalletAddress(getAddress(parsed.owner));
      }
    } catch (err) {
      console.error(err);
    }

    restoreWallet();
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      setError('No browser wallet detected. Install MetaMask or another injected wallet.');
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setStatus(null);
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const first = accounts[0];
      if (!first || !isAddress(first)) {
        throw new Error('Wallet did not return a valid address.');
      }
      const checksum = getAddress(first);
      setWalletAddress(checksum);
      const ensName = await mainnetClient.getEnsName({ address: checksum });
      setPrimaryEns(ensName ?? null);
      if (ensName) {
        setEnsInput((current) => current || ensName);
        setStatus(`Wallet connected. Primary ENS detected: ${ensName}`);
      } else {
        setStatus('Wallet connected. No primary ENS found, so enter an ENS or subdomain manually.');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
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
          merchant_address: walletAddress,
          ens_name: normalizedEns,
          display_name: normalizedEns,
          description: `ENS-native buyout storefront for ${normalizedEns}.`,
          merchant_persona: 'Direct, brief, skeptical merchant. No fluff.',
          buying_preferences: 'Distressed token positions, governance tokens, liquid long-tail assets.',
          pricing_style: 'Conservative on risk, fair on clean opportunities, never overpay.',
          refusal_rules: 'Refuse unclear token identity, fake urgency, or missing details.',
          welcome_message: 'State the token, amount, and your ask.',
          payout_token: '0x0000000000000000000000000000000000000000',
        }));

      setShop(activeShop);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: walletAddress, ens: normalizedEns }));
      setStatus(existing[0] ? 'Loaded existing store.' : 'Store created. Open the owner dashboard or storefront chat.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not create or load store.');
    } finally {
      setCreating(false);
    }
  }

  const sellerHref = useMemo(() => (shop ? `/shop/${encodeURIComponent(shop.ens_name)}` : null), [shop]);
  const ownerHref = useMemo(
    () =>
      shop
        ? `/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}`
        : null,
    [shop]
  );

  return (
    <main className="min-h-screen bg-maritime text-onSurface px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="merchant-panel rounded-panel p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Pawn Agent Setup</p>
          <h1 className="mt-2 text-3xl text-onSurface">Wallet-first ENS store creation</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f0dfb4]">
            Connect a wallet, confirm the ENS identity you want to use, and create a storefront that routes cleanly to its own chat page.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="merchant-panel rounded-panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Wallet</p>
                <h2 className="mt-2 text-xl text-onSurface">Connect owner wallet</h2>
              </div>
              <button
                onClick={connectWallet}
                disabled={connecting}
                className="rounded-panel border border-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : walletAddress ? 'Reconnect wallet' : 'Connect wallet'}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="merchant-inset rounded-panel p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Connected address</p>
                <p className="mt-2 text-base text-onSurface">{walletAddress ?? 'Not connected yet'}</p>
              </div>

              <div className="merchant-inset rounded-panel p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Primary ENS (detected)</p>
                <p className="mt-2 text-base text-onSurface">{primaryEns ?? 'No primary ENS detected'}</p>
              </div>

              <label className="grid gap-2 text-sm text-[#f4e7c7]">
                <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Store ENS / subdomain</span>
                <input
                  value={ensInput}
                  onChange={(e) => setEnsInput(e.target.value)}
                  placeholder="ted.eth or pawn.ted.eth"
                  className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none"
                />
              </label>

              <button
                onClick={createOrLoadStore}
                disabled={creating || !walletAddress}
                className="rounded-panel border border-outlineVariant bg-brassButton px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-onPrimary disabled:opacity-60"
              >
                {creating ? 'Preparing store…' : 'Create or load store'}
              </button>
            </div>
          </section>

          <aside className="merchant-panel rounded-panel p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">MVP flow</p>
            <ol className="mt-4 space-y-3 text-sm text-[#f0dfb4]">
              <li>1. Connect wallet</li>
              <li>2. Use detected primary ENS or enter a subdomain manually</li>
              <li>3. Create/load the storefront bound to that wallet + ENS</li>
              <li>4. Open owner dashboard for merchant settings</li>
              <li>5. Open dedicated storefront chat page for the buyer/seller experience</li>
            </ol>

            {status ? <p className="mt-5 rounded-panel border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{status}</p> : null}
            {error ? <p className="mt-5 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p> : null}

            {shop ? (
              <div className="mt-5 space-y-3 rounded-panel border border-outlineVariant bg-surfaceLowest p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Current store</p>
                <p className="text-lg text-onSurface">{shop.ens_name}</p>
                <p className="text-sm text-[#f0dfb4]">Owner {formatWallet(shop.owner_address)}</p>
                <div className="flex flex-wrap gap-3 pt-2">
                  {ownerHref ? (
                    <Link href={ownerHref} className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                      Open owner dashboard
                    </Link>
                  ) : null}
                  {sellerHref ? (
                    <Link href={sellerHref} className="rounded-panel border border-outlineVariant px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow">
                      Open storefront chat
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
