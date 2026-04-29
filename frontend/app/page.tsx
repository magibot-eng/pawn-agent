'use client';

import { useMemo, useState } from 'react';
import MerchantChat from '../components/MerchantChat';

const merchantTraits = ['Distressed lots only', 'Hard rules stay binding', 'Weak bids get declined'];

const desiredAssets = ['Low-float tokens', 'Thin-liquidity lots', 'Volatile governance assets'];

const baseOfferRows = [
  ['Visible market', '$0.084 / token'],
  ['Liquidity pressure', 'High'],
  ['Merchant discount', '-38%'],
  ['Proposed payout', 'USDC 937.44'],
  ['Settlement window', '15 min'],
] as const;

const shopStats = [
  ['Port', 'Base Sepolia'],
  ['House', 'ted.eth'],
  ['Status', 'Open'],
  ['Mode', 'Buyout'],
] as const;

const inspectionRows = [
  ['Lot on counter', '18,000 TIDE'],
  ['Seller ask', 'Near market'],
  ['Clearance path', 'USDC settlement'],
  ['Confidence', 'Conditional'],
] as const;

const actionLabels = ['Inspect Cargo', 'Make Offer', 'Counter', 'Accept Terms', 'Walk Away'] as const;

type ActionLabel = (typeof actionLabels)[number];

type MerchantState = {
  title: string;
  line: string;
  subline: string;
  ruleStatus: string;
  sessionStatus: string;
  detailTitle: string;
  detailBody: string;
  offerAdjustments?: Partial<Record<(typeof baseOfferRows)[number][0], string>>;
};

const actionStates: Record<ActionLabel, MerchantState> = {
  'Inspect Cargo': {
    title: 'Inspection',
    line: '“Show me what clears, and I may improve the number.”',
    subline: 'Read provenance, depth, and timing.',
    ruleStatus: 'Reviewing proof, timing, and likely execution friction.',
    sessionStatus: 'Inspecting cargo',
    detailTitle: 'Inspection read',
    detailBody: 'Surface token metadata, provenance signals, and execution constraints here.',
    offerAdjustments: {
      Confidence: 'Under review',
    } as Partial<Record<(typeof baseOfferRows)[number][0], string>>,
  },
  'Make Offer': {
    title: 'Offer intake',
    line: '“State your number plainly.”',
    subline: 'Future seller form: ask, payout asset, deadline.',
    ruleStatus: 'The merchant will hear a seller-led proposal inside house limits.',
    sessionStatus: 'Awaiting offer',
    detailTitle: 'Offer intake',
    detailBody: 'This state is ready for a simple seller-input form.',
  },
  Counter: {
    title: 'Counter sent',
    line: '“Too close to rumor price. Reduce my risk, and I improve the payout.”',
    subline: 'Counter mode should feel like bargaining, not a calculator.',
    ruleStatus: 'Merchant interest remains, but discount pressure stays high.',
    sessionStatus: 'Counter sent',
    detailTitle: 'Counter posture',
    detailBody: 'Later the backend can compare ask, hard minimums, and live liquidity here.',
    offerAdjustments: {
      'Merchant discount': '-34%',
      'Proposed payout': 'USDC 997.92',
    },
  },
  'Accept Terms': {
    title: 'Terms accepted',
    line: '“Good. We settle before the tide turns.”',
    subline: 'Deal state should feel decisive and calm.',
    ruleStatus: 'Terms appear clear for execution, pending wallet and settlement checks.',
    sessionStatus: 'Terms accepted',
    detailTitle: 'Ready to settle',
    detailBody: 'This state can later hand off into signatures, wallet actions, and settlement.',
    offerAdjustments: {
      'Settlement window': 'Ready to execute',
    },
  },
  'Walk Away': {
    title: 'Paused',
    line: '“Keep your cargo. Return when your timing is honest.”',
    subline: 'Exit should feel clean, not broken.',
    ruleStatus: 'The merchant declines to proceed until the seller reopens the negotiation.',
    sessionStatus: 'Seller departed',
    detailTitle: 'Session closed',
    detailBody: 'Later the app can restart the flow or preserve the last quote for reference.',
  },
};

export default function HomePage() {
  const [selectedAction, setSelectedAction] = useState<ActionLabel>('Inspect Cargo');

  const currentState = actionStates[selectedAction];

  const visibleOfferRows = useMemo(() => {
    return baseOfferRows.map(([label, value]) => [label, currentState.offerAdjustments?.[label] ?? value] as const);
  }, [currentState]);

  return (
    <main className="min-h-screen bg-maritime text-onSurface">
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-8 lg:px-10">
        <div className="merchant-panel rounded-panel p-3 sm:p-4 lg:p-5">
          <header className="merchant-inset rounded-panel px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.38em] text-onSurfaceVariant">Pawn Agent Merchant Exchange</p>
                <h1 className="mt-2 text-2xl text-onSurface sm:text-3xl">Walk Up to the Counter</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#f0dfb4]">ENS merchant encounter for distressed token buyouts.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.24em] lg:w-[22rem]">
                {shopStats.map(([label, value]) => (
                  <div key={label} className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">
                    {label}: {value}
                  </div>
                ))}
              </div>
            </div>
          </header>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_0.78fr]">
            <section className="merchant-panel rounded-panel p-4">
              <div className="merchant-scene relative overflow-hidden rounded-panel border border-outlineVariant px-4 py-4 sm:px-6 sm:py-6">
                <div className="merchant-scene__glow" />
                <div className="merchant-scene__window" />
                <div className="merchant-scene__shelf merchant-scene__shelf--left" />
                <div className="merchant-scene__shelf merchant-scene__shelf--right" />
                <div className="merchant-scene__counter" />
                <div className="merchant-scene__merchant" />
                <div className="merchant-scene__cargo" />

                <div className="relative z-10 flex min-h-[30rem] flex-col justify-between">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-xl">
                      <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Merchant Room</p>
                      <h2 className="mt-2 text-3xl text-onSurface sm:text-4xl">Harbormaster ted.eth</h2>
                      <p className="mt-2 max-w-md text-sm text-[#f0dfb4]">Bring cargo. Hear the house.</p>
                    </div>

                    <div className="merchant-inset relative z-10 w-full max-w-xs rounded-panel p-4">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">On the Counter</p>
                      <div className="mt-3 space-y-2 text-sm text-[#f0dfb4]">
                        {inspectionRows.map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between gap-4 border-b border-outline/70 pb-2 last:border-b-0 last:pb-0">
                            <span>{label}</span>
                            <span className="font-medium text-onSurface">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="merchant-inset rounded-panel p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">House Rules</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {merchantTraits.map((trait) => (
                          <span
                            key={trait}
                            className="rounded-panel border border-outlineVariant bg-[rgba(22,16,8,0.72)] px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-[#f4e7c7]"
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="merchant-inset rounded-panel p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Wanted</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {desiredAssets.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-panel border border-outlineVariant bg-surfaceLow px-3 py-1.5 text-xs text-onPrimaryContainer"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="merchant-dialogue mt-4 rounded-panel p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Dialogue Bar</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <h3 className="text-xl text-onSurface sm:text-2xl">Harbormaster ted.eth</h3>
                      <span className="rounded-panel border border-outlineVariant bg-surfaceLowest px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">
                        {currentState.title}
                      </span>
                    </div>
                    <p className="mt-3 max-w-2xl text-lg text-[#f4e7c7]">{currentState.line}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#d7c08a]">{currentState.subline}</p>
                  </div>

                  <div className="w-full max-w-xl">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {actionLabels.map((action) => {
                        const isActive = action === selectedAction;
                        return (
                          <button
                            key={action}
                            onClick={() => setSelectedAction(action)}
                            className={`rounded-panel px-3 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition ${
                              isActive
                                ? 'border border-outlineVariant bg-brassButton text-onPrimary shadow-low'
                                : action === 'Walk Away'
                                  ? 'border border-outline bg-surfaceLowest text-[#f0dfb4] hover:bg-surfaceLow'
                                  : 'border border-primary bg-transparent text-primary hover:bg-primary/10'
                            }`}
                          >
                            {action}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="grid gap-4 xl:pt-10">
              <section className="merchant-panel rounded-panel p-4">
                <div className="merchant-inset rounded-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Offer Sheet</p>
                    <span className="rounded-panel border border-primary bg-primaryContainer px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-onPrimaryContainer">
                      {currentState.sessionStatus}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg text-onSurface sm:text-xl">Current Terms</h2>

                  <div className="mt-4 overflow-hidden rounded-panel border border-outline bg-surfaceLowest">
                    {visibleOfferRows.map(([label, value], index) => (
                      <div
                        key={label}
                        className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm ${index !== visibleOfferRows.length - 1 ? 'border-b border-outline' : ''}`}
                      >
                        <span className="text-[#f0dfb4]">{label}</span>
                        <span className="font-medium text-onSurface">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-panel border border-outlineVariant bg-[linear-gradient(180deg,rgba(74,0,0,0.16),rgba(78,42,12,0.28))] p-3 text-sm text-[#f0dfb4]">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-onSurfaceVariant">Rule Status</p>
                    <p className="mt-2">{currentState.ruleStatus}</p>
                  </div>
                </div>
              </section>

              <section className="merchant-panel rounded-panel p-4">
                <div className="merchant-inset rounded-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Merchant</p>
                      <h2 className="mt-1 text-lg text-onSurface">ted.eth</h2>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-outlineVariant bg-secondaryContainer text-xl text-onPrimaryContainer">
                      ⚓
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[#f0dfb4]">Distressed buyer • rule-bound house</p>
                </div>
              </section>
            </aside>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="merchant-panel rounded-panel flex flex-col p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline pb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Negotiation Chat</p>
                  <h2 className="mt-1 text-lg text-onSurface sm:text-xl">Counter Talk</h2>
                </div>
                <div className="rounded-panel border border-primary bg-primaryContainer px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-onPrimaryContainer">
                  {currentState.sessionStatus}
                </div>
              </div>
              <div className="flex-1" style={{ minHeight: '28rem' }}>
                <MerchantChat />
              </div>
            </section>

            <section className="merchant-panel rounded-panel p-4">
              <div className="merchant-inset rounded-panel p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Current State</p>
                <h2 className="mt-1 text-lg text-onSurface sm:text-xl">{currentState.detailTitle}</h2>

                <div className="mt-4 rounded-panel border border-outline bg-surfaceLowest p-4 text-sm text-[#f0dfb4]">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-onSurfaceVariant">State Notes</p>
                  <p className="mt-2">{currentState.detailBody}</p>
                </div>

                <div className="mt-4 rounded-panel border border-outline bg-surfaceLow p-4 text-sm text-[#f0dfb4]">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-onSurfaceVariant">Next</p>
                  <ul className="mt-2 space-y-2">
                    <li>• Wallet + ENS shell</li>
                    <li>• Seller lot form</li>
                    <li>• Merchant rules view</li>
                    <li>• Optional lightweight R3F scene later</li>
                  </ul>
                </div>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  );
}
