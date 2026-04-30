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
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
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

async function resolveWalletState(address: string) {
  const checksum = getAddress(address);

  try {
    const ensName = await mainnetClient.getEnsName({ address: checksum });

    return {
      address: checksum,
      ensName: ensName ?? null,
      ensLookupError: null,
    };
  } catch (error) {
    console.error('ENS lookup failed:', error);

    return {
      address: checksum,
      ensName: null,
      ensLookupError: 'Could not look up ENS for this wallet right now.',
    };
  }
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

  async function applyWallet(address: string, options?: { source?: 'connect' | 'restore' | 'account_change' }) {
    const { address: checksum, ensName, ensLookupError } = await resolveWalletState(address);
    setWalletAddress(checksum);
    setPrimaryEns(ensName);
    setShop(null);

    if (ensName) {
      setEnsInput((current) => current || ensName);
    }

    if (options?.source === 'connect') {
      setStatus(
        ensName
          ? `Wallet connected. Detected existing ENS: ${ensName}. You can use it as your shop route or enter another .eth name for now.`
          : ensLookupError
            ? `Wallet connected. ${ensLookupError} You can still choose a .eth route for this storefront.`
            : 'Wallet connected. No ENS detected on this wallet. You can still choose a .eth route name for this storefront.'
      );
    }

    if (options?.source === 'account_change') {
      setStatus(
        ensName
          ? `Wallet changed. Detected existing ENS: ${ensName}. Review the shop route before continuing.`
          : ensLookupError
            ? `Wallet changed. ${ensLookupError} Review the shop route before continuing.`
            : 'Wallet changed. No ENS detected on this wallet, so review the shop route before continuing.'
      );
    }
  }

  function disconnectWallet() {
    setWalletAddress(null);
    setPrimaryEns(null);
    setShop(null);
    setStatus('Wallet disconnected. Reconnect or switch accounts to continue.');
    setError(null);

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as { owner?: string; ens?: string }) : null;
      const typedEns = ensInput.trim().toLowerCase();
      const preservedEns = parsed?.ens ? parsed.ens : typedEns;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preservedEns ? { ens: preservedEns } : {}));
    } catch (err) {
      console.error(err);
    }
  }

  async function switchWallet() {
    await promptWalletSwitch();
  }

  useEffect(() => {
    async function restoreWallet() {
      if (!window.ethereum) return;
      try {
        const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
        const first = accounts[0];
        if (!first || !isAddress(first)) return;
        await applyWallet(first, { source: 'restore' });
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

    const provider = window.ethereum;
    const handleAccountsChanged = async (...args: unknown[]) => {
      const [accounts] = args as [string[]];
      const first = accounts?.[0];
      if (!first || !isAddress(first)) {
        disconnectWallet();
        return;
      }

      try {
        setError(null);
        await applyWallet(first, { source: 'account_change' });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Could not refresh wallet state.');
      }
    };

    provider?.on?.('accountsChanged', handleAccountsChanged);
    restoreWallet();

    return () => {
      provider?.removeListener?.('accountsChanged', handleAccountsChanged);
    };
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
      await applyWallet(first, { source: 'connect' });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
    }
  }

  async function promptWalletSwitch() {
    if (!window.ethereum) {
      setError('No browser wallet detected. Install MetaMask or another injected wallet.');
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      setStatus('Choose the wallet account you want to use for this shop.');

      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });

      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const first = accounts[0];
      if (!first || !isAddress(first)) {
        throw new Error('Wallet did not return a valid address after switching accounts.');
      }

      await applyWallet(first, { source: 'account_change' });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not switch wallet.');
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
          ens_name: normalizedEns,
          display_name: normalizedEns,
          description: `ENS-native buyout storefront for ${normalizedEns}.`,
          merchant_persona: 'Direct, brief, skeptical merchant. No fluff.',
          buying_preferences: 'Distressed token positions, governance tokens, liquid long-tail assets.',
          pricing_style: 'Conservative on risk, fair on clean opportunities, never overpay.',
          refusal_rules: 'Refuse unclear token identity, fake urgency, or missing details.',
          welcome_message: 'State the token, amount, and your ask.',
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
          : 'Store created. The owner wallet is now linked as admin only — provision the separate merchant wallet from the owner dashboard next.'
      );
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
          <h1 className="mt-2 text-3xl text-onSurface">Open your pawn shop</h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f0dfb4]">
            Connect the wallet that will own this shop, choose the .eth route customers will use inside Pawn Agent, and create the storefront. Real ENS registration or subdomain creation comes later as a separate wallet transaction.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="merchant-panel rounded-panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Wallet</p>
                <h2 className="mt-2 text-xl text-onSurface">Connect owner wallet</h2>
                <p className="mt-2 max-w-xl text-sm text-[#f0dfb4]">
                  Use the wallet that will own and manage this shop. You can disconnect or switch accounts before creating the storefront.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={walletAddress ? switchWallet : connectWallet}
                  disabled={connecting}
                  className="rounded-panel border border-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {connecting ? 'Connecting…' : walletAddress ? 'Switch wallet' : 'Connect wallet'}
                </button>
                {walletAddress ? (
                  <button
                    onClick={disconnectWallet}
                    className="rounded-panel border border-outlineVariant px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="merchant-inset rounded-panel p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Connected wallet</p>
                <p className="mt-2 text-base text-onSurface">{walletAddress ? formatWallet(walletAddress) : 'Not connected yet'}</p>
                {walletAddress ? <p className="mt-1 text-xs text-[#d8caa3]">{walletAddress}</p> : null}
              </div>

              <div className="merchant-inset rounded-panel p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Detected ENS on this wallet</p>
                <p className="mt-2 text-base text-onSurface">{primaryEns ?? 'No ENS detected on this wallet'}</p>
                <p className="mt-2 text-xs text-[#d8caa3]">
                  Detection is informational only. You can use an existing ENS later, but this screen does not register one yet.
                </p>
              </div>

              <label className="grid gap-2 text-sm text-[#f4e7c7]">
                <span className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">Shop route (.eth for now)</span>
                <input
                  value={ensInput}
                  onChange={(e) => setEnsInput(e.target.value)}
                  placeholder="ted.eth or pawn.ted.eth"
                  className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-3 text-onSurface outline-none"
                />
                <span className="text-xs text-[#d8caa3]">
                  This creates your storefront identity inside Pawn Agent. It does not create or register the ENS name onchain.
                </span>
              </label>

              <button
                onClick={createOrLoadStore}
                disabled={creating || !walletAddress}
                className="rounded-panel border border-outlineVariant bg-brassButton px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-onPrimary disabled:opacity-60"
              >
                {creating ? 'Preparing shop…' : 'Create or load shop'}
              </button>
            </div>
          </section>

          <aside className="merchant-panel rounded-panel p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Current flow</p>
            <ol className="mt-4 space-y-3 text-sm text-[#f0dfb4]">
              <li>1. Connect the wallet that will own and administer the shop</li>
              <li>2. Review any ENS detected on that wallet</li>
              <li>3. Choose the .eth route Pawn Agent should use for this storefront</li>
              <li>4. Create or load the shop bound to that owner wallet + route</li>
              <li>5. Provision a separate merchant wallet for automated settlement</li>
              <li>6. Open the owner dashboard or storefront chat</li>
            </ol>

            <div className="mt-5 rounded-panel border border-outlineVariant bg-surfaceLowest p-4 text-sm text-[#f0dfb4]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">ENS note</p>
              <p className="mt-2">
                This setup screen uses a .eth route as the shop identity inside the app today. Linking an existing ENS or registering a new ENS/subdomain will be a separate wallet transaction later.
              </p>
            </div>

            {status ? <p className="mt-5 rounded-panel border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{status}</p> : null}
            {error ? <p className="mt-5 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p> : null}

            {shop ? (
              <div className="mt-5 space-y-3 rounded-panel border border-outlineVariant bg-surfaceLowest p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Current shop</p>
                <p className="text-lg text-onSurface">{shop.ens_name}</p>
                <p className="text-sm text-[#f0dfb4]">Owner {formatWallet(shop.owner_address)}</p>
                <p className="text-sm text-[#f0dfb4]">
                  Merchant wallet {shop.wallet_status === 'pending' ? 'not provisioned yet' : formatWallet(shop.merchant_address)}
                </p>
                <p className="text-xs uppercase tracking-[0.22em] text-onSurfaceVariant">
                  {shop.wallet_provider} • {shop.wallet_status}
                </p>
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
