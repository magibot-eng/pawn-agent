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
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
        ? `Wallet connected through ${walletConnectorName ?? 'your wallet'}. Detected existing ENS: ${primaryEns}.`
        : ensLookupError
          ? `Wallet connected through ${walletConnectorName ?? 'your wallet'}. ${ensLookupError}`
          : `Wallet connected through ${walletConnectorName ?? 'your wallet'}. No ENS detected on this wallet.`
    );
    setError(null);
  }, [walletAddress, primaryEns, ensLookupError, walletConnectorName]);

  async function verifyEnsRoute(normalizedEns: string, ownerAddress: string) {
    const resolvedOwner = await resolveEnsOwnerAddress(normalizedEns);
    if (resolvedOwner && resolvedOwner.toLowerCase() === ownerAddress.toLowerCase()) {
      return { status: 'verified' as const, verifiedOwnerAddress: resolvedOwner, message: `Verified. ${normalizedEns} resolves to the connected wallet.` };
    }
    if (resolvedOwner) {
      return { status: 'manual' as const, verifiedOwnerAddress: null, message: `${normalizedEns} resolves to ${formatWallet(resolvedOwner)}, not the connected wallet.` };
    }
    return { status: 'manual' as const, verifiedOwnerAddress: null, message: `${normalizedEns} does not currently resolve to an owner address on mainnet.` };
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
      } catch {
        if (!active) return;
        setEnsVerificationStatus('manual');
        setEnsVerificationMessage('Could not verify this ENS route right now.');
        setEnsVerifiedOwnerAddress(null);
      }
    }
    refreshEnsVerification();
    return () => { active = false; };
  }, [ensInput, walletAddress, resolveEnsOwnerAddress]);

  async function handleDisconnectWallet() {
    try {
      await disconnectWallet();
      setShop(null);
      setStatus('Wallet disconnected.');
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
    if (!walletAddress) { setError('Connect a wallet first.'); return; }
    if (!looksLikeEns(ensInput)) { setError('Enter a valid ENS or subdomain ending in .eth.'); return; }
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
      setStatus(existing[0] ? 'Loaded existing store.' : 'Store created and listed.');
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
    () => shop ? `/owner?ens=${encodeURIComponent(shop.ens_name)}&owner=${encodeURIComponent(shop.owner_address)}` : null,
    [shop]
  );

  const walletError = error ?? connectError;

  return (
    <div className="crossroads-root">
      {/* ── Atmospheric background ── */}
      <div className="crossroads-bg">
        <div className="stone-wall" />
        <div className="wood-floor" />
        <div className="bg-vignette" />
        <div className="candle-glow candle-glow-left" />
        <div className="candle-glow candle-glow-right" />
        {/* Ember particles */}
        <div className="embers-container" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="ember" style={{
              left: `${Math.random() * 100}%`,
              animationDuration: `${4 + Math.random() * 6}s`,
              animationDelay: `${Math.random() * 5}s`,
              width: `${2 + Math.random() * 2}px`,
              height: `${2 + Math.random() * 2}px`,
              opacity: 0.4 + Math.random() * 0.5,
            }} />
          ))}
        </div>
      </div>

      {/* ── Mist layer ── */}
      <div className="mist-layer" aria-hidden="true" />

      {/* ── HUD: Top bar ── */}
      <header className="crossroads-hud">
        {/* ENS sigil — top left */}
        <div className="hud-ens-sigil">
          <div className="ens-sigil-inner">
            <div className="ens-sigil-star">✦</div>
            <span className="ens-sigil-label">Pawn Agent</span>
          </div>
        </div>

        {/* Grand Hallway title — top center */}
        <div className="hud-title">
          <span className="hallway-title-text">The Grand Hallway</span>
        </div>

        {/* Wallet connect + badge — top right */}
        <div className="hud-wallet">
          <div className="base-sepolia-badge">
            <span className="base-dot" />
            Base Sepolia
          </div>
          <div className="wallet-area">
            {walletAddress ? (
              <>
                <span className="wallet-address">{formatWallet(walletAddress)}</span>
                <button onClick={handleDisconnectWallet} className="wallet-disconnect">Disconnect</button>
              </>
            ) : (
              <RainbowConnectAction connectLabel="Connect Wallet" connectedLabel="Connected" />
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="crossroads-main">

        {/* ── TWO DOORS ── */}
        <section className="doors-section" aria-label="Choose your path">
          {/* Seller Door */}
          <div className={`door-panel door-seller ${mounted ? 'door-visible' : ''}`} style={{ animationDelay: '0.1s' }}>
            <div className="door-arch">
              <div className="door-glow-torch" />
              <div className="door-icon-wrap">
                <div className="door-icon-svg coin-icon">
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="24" r="20" fill="#d4a017" stroke="#f0c040" strokeWidth="2"/>
                    <circle cx="24" cy="24" r="15" fill="none" stroke="#b88a10" strokeWidth="1.5"/>
                    <text x="24" y="30" textAnchor="middle" fill="#8b6914" fontSize="18" fontWeight="bold" fontFamily="serif">$</text>
                  </svg>
                </div>
              </div>
              <div className="door-content">
                <div className="door-path-label">Seller Path</div>
                <h2 className="door-title">Enter as Seller</h2>
                <p className="door-tagline">Walk in. Get offers. Cash out.</p>
                <Link href={sellerHref ?? '#'} className={`door-cta-btn door-cta-seller ${!sellerHref ? 'door-cta-disabled' : ''}`}>
                  Enter Marketplace
                  <span className="door-cta-arrow">→</span>
                </Link>
              </div>
              <div className="door-hover-embers" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="hover-ember" style={{
                    left: `${10 + Math.random() * 80}%`,
                    animationDelay: `${i * 0.3}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>

          {/* Floor shadow between doors */}
          <div className="floor-shadow" aria-hidden="true" />

          {/* Merchant Door */}
          <div className={`door-panel door-merchant ${mounted ? 'door-visible' : ''}`} style={{ animationDelay: '0.35s' }}>
            <div className="door-arch door-arch-iron">
              <div className="door-glow-iron" />
              <div className="door-icon-wrap">
                <div className="door-icon-svg ledger-icon">
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="6" width="28" height="36" rx="2" fill="#3d2817" stroke="#7a9bb5" strokeWidth="1.5"/>
                    <rect x="12" y="10" width="20" height="28" rx="1" fill="none" stroke="#5a7a8a" strokeWidth="1"/>
                    <line x1="14" y1="18" x2="30" y2="18" stroke="#5a7a8a" strokeWidth="1.2"/>
                    <line x1="14" y1="23" x2="30" y2="23" stroke="#5a7a8a" strokeWidth="1.2"/>
                    <line x1="14" y1="28" x2="30" y2="28" stroke="#5a7a8a" strokeWidth="1.2"/>
                    {/* Quill */}
                    <path d="M30 8 L34 4 L38 2 L40 5 L36 9 Z" fill="#c4b89a" stroke="#a09070" strokeWidth="0.8"/>
                    <line x1="30" y1="8" x2="22" y2="36" stroke="#a09070" strokeWidth="1.2"/>
                  </svg>
                </div>
              </div>
              <div className="door-content">
                <div className="door-path-label">Merchant Path</div>
                <h2 className="door-title door-title-iron">Open Your Shop</h2>
                <p className="door-tagline">Configure your agent. Set your terms.</p>
                {!shop ? (
                  <div className="door-merchant-setup">
                    <div className="merchant-inset-rounded">
                      <input
                        value={ensInput}
                        onChange={(e) => setEnsInput(e.target.value)}
                        placeholder="yourname.eth"
                        className="parchment-input door-ens-input"
                      />
                      <button
                        onClick={createOrLoadStore}
                        disabled={creating || !walletAddress}
                        className="door-open-btn"
                      >
                        {creating ? 'Preparing…' : walletAddress ? 'Open Your Door' : 'Connect Wallet First'}
                      </button>
                    </div>
                    {looksLikeEns(ensInput) && ensVerificationStatus !== 'idle' ? (
                      <div className={`ens-status-badge ${ensVerificationStatus}`}>
                        {ensVerificationStatus === 'verified' ? '✓ Verified' : ensVerificationStatus === 'checking' ? 'Checking…' : 'Manual route'}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="door-merchant-active">
                    <div className="door-active-status">
                      <span className="door-active-ens">{shop.ens_name}</span>
                      <span className="door-active-badge">{shop.wallet_status}</span>
                    </div>
                    <div className="door-active-actions">
                      {ownerHref && (
                        <Link href={ownerHref} className="door-cta-btn door-cta-iron">
                          Owner Dashboard
                          <span className="door-cta-arrow">→</span>
                        </Link>
                      )}
                      {sellerHref && (
                        <Link href={sellerHref} className="door-cta-btn door-cta-iron-secondary">
                          Preview Shop
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Iron sparks on hover */}
              <div className="iron-sparks" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="spark" style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 1.5}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SELLER STRIP ── */}
        <section className="seller-strip">
          <div className="strip-header">
            <div className="strip-label">Active Shop Fronts</div>
            {!shopsLoading && marketShops.length > 0 && (
              <span className="strip-count">{marketShops.length} open</span>
            )}
          </div>

          {shopsLoading ? (
            <div className="strip-loading">Scanning the district…</div>
          ) : shopsError ? (
            <div className="strip-error">{shopsError}</div>
          ) : sellerFilteredShops.length === 0 ? (
            <div className="strip-empty">
              <p className="strip-empty-text">No shops open yet.</p>
              <p className="strip-empty-sub">Be the first to raise your shutters.</p>
            </div>
          ) : (
            <div className="shop-card-row">
              {sellerFilteredShops.map((candidate) => {
                const freshHref = walletAddress
                  ? `/shop/${encodeURIComponent(candidate.ens_name)}?seller=${encodeURIComponent(walletAddress)}`
                  : null;
                return (
                  <article key={candidate.id} className="glass-shop-card">
                    <div className="glass-shop-card-inner">
                      <div className="glass-ens-badge">
                        <span className="glass-ens-dot" />
                        {candidate.display_name}
                      </div>
                      <p className="glass-ens-name">{candidate.ens_name}</p>
                      {candidate.description && (
                        <p className="glass-desc">{candidate.description.slice(0, 80)}{candidate.description.length > 80 ? '…' : ''}</p>
                      )}
                      <div className="glass-actions">
                        {freshHref ? (
                          <Link href={freshHref} className="glass-enter-btn">Start Chat</Link>
                        ) : (
                          <RainbowConnectAction connectLabel="Connect to chat" connectedLabel="Ready" />
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── MERCHANT STRIP ── */}
        <section className="merchant-strip">
          {shop ? (
            <div className="tavern-sign-wrap">
              <div className="tavern-sign-hanger" aria-hidden="true">
                <div className="hanger-ring" />
                <div className="hanger-chain" />
              </div>
              <div className="tavern-sign">
                <div className="tavern-sign-nail nail-left" aria-hidden="true" />
                <div className="tavern-sign-nail nail-right" aria-hidden="true" />
                <div className="tavern-sign-inner">
                  <div className="tavern-sign-ens">{shop.ens_name}</div>
                  <div className="tavern-sign-divider" />
                  <div className="tavern-sign-stats">
                    <div className="sign-stat">
                      <span className="sign-stat-label">Status</span>
                      <span className="sign-stat-value sign-stat-wallet">{shop.wallet_status}</span>
                    </div>
                    <div className="sign-stat">
                      <span className="sign-stat-label">Route</span>
                      <span className="sign-stat-value">{ensVerificationLabel(shop.ens_verification_status)}</span>
                    </div>
                  </div>
                  <div className="tavern-sign-actions">
                    {ownerHref && (
                      <Link href={ownerHref} className="sign-action-btn sign-action-primary">Dashboard</Link>
                    )}
                    {sellerHref && (
                      <Link href={sellerHref} className="sign-action-btn">Preview</Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-hall">
              <div className="empty-hall-icon">⬟</div>
              <div className="empty-hall-title">Your Hall is Empty</div>
              <div className="empty-hall-sub">Open Your Door to raise your shutter and start receiving offers.</div>
            </div>
          )}
        </section>

        {/* ── Status / error notices ── */}
        {status ? (
          <div className="notice notice-success" role="status">
            {status}
          </div>
        ) : null}
        {walletError ? (
          <div className="notice notice-error" role="alert">
            {walletError}
          </div>
        ) : null}

      </main>
    </div>
  );
}