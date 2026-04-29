const merchantTraits = [
  "Thin-liquidity lots are priced as distressed cargo, not headline value.",
  "Trade execution is allowed only when hard merchant rules remain satisfied.",
  "Merchant posture favors elegant rejections over weak bids outside appetite.",
];

const desiredAssets = ["Low-float tokens", "Thin-liquidity lots", "Volatile governance assets"];

const negotiationLog = [
  {
    speaker: "Seller",
    line: "I have 18,000 TIDE to move before the market window closes. Can your house clear it for USDC?",
  },
  {
    speaker: "Merchant",
    line: "The harbor is shallow for this cargo. I will quote against executable conditions, not tavern gossip pricing.",
  },
  {
    speaker: "Merchant",
    line: "If the lot settles cleanly and slippage holds, I can extend a discounted bid under my current charter.",
  },
];

const offerRows = [
  ["Visible market", "$0.084 / token"],
  ["Liquidity pressure", "High"],
  ["Merchant discount", "-38%"],
  ["Proposed payout", "USDC 937.44"],
  ["Settlement window", "15 min"],
] as const;

const actionRows = ["Make Offer", "Counter", "Accept Terms", "Walk Away"];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-maritime text-onSurface">
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-8 lg:px-10">
        <div className="merchant-panel rounded-panel p-3 sm:p-4 lg:p-5">
          <header className="merchant-inset rounded-panel px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.38em] text-onSurfaceVariant">Pawn Agent Merchant Exchange</p>
                <h1 className="mt-2 text-2xl text-onSurface sm:text-3xl">Maritime Merchant Storefront Shell</h1>
                <p className="mt-3 max-w-3xl text-sm text-[#f0dfb4]">
                  A merchant-study interface inspired by 2000s maritime RPGs: dense framed panels, brass trim, parchment-like
                  information surfaces, and a bargaining flow centered on ENS identity and automated token buyouts.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.24em]">
                <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">Port: Base Sepolia</div>
                <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">Status: Open</div>
                <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">House: ted.eth</div>
                <div className="merchant-inset rounded-panel px-3 py-2 text-onSurfaceVariant">Mode: Buyout</div>
              </div>
            </div>
          </header>

          <section className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr_0.82fr]">
            <aside className="merchant-panel rounded-panel p-4">
              <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Merchant Ledger</p>

              <div className="merchant-inset mt-4 rounded-panel p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-panel border border-outlineVariant bg-secondaryContainer text-2xl text-onPrimaryContainer">
                    ⚓
                  </div>
                  <div>
                    <h2 className="text-lg text-onSurface">Harbormaster ted.eth</h2>
                    <p className="mt-2 text-sm text-[#f0dfb4]">Distressed token buyer • Rule-bound automated merchant</p>
                  </div>
                </div>
              </div>

              <div className="merchant-inset mt-4 rounded-panel p-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Desired Cargo</p>
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

              <div className="merchant-inset mt-4 rounded-panel p-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">House Charter</p>
                <ul className="mt-3 space-y-3 text-sm text-[#f0dfb4]">
                  {merchantTraits.map((trait) => (
                    <li key={trait} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{trait}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            <section className="merchant-panel rounded-panel p-4">
              <div className="merchant-inset rounded-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Negotiation Window</p>
                    <h2 className="mt-2 text-xl text-onSurface sm:text-2xl">Dockside Bargaining Log</h2>
                  </div>
                  <div className="rounded-panel border border-primary bg-primaryContainer px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-onPrimaryContainer">
                    Session Open
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {negotiationLog.map((entry) => (
                    <div
                      key={`${entry.speaker}-${entry.line}`}
                      className={`rounded-panel border px-4 py-4 text-sm ${
                        entry.speaker === 'Merchant'
                          ? 'border-outlineVariant bg-[linear-gradient(180deg,rgba(78,42,12,0.48),rgba(43,29,18,0.75))] text-[#f4e7c7]'
                          : 'border-outline bg-[linear-gradient(180deg,rgba(74,54,41,0.28),rgba(31,28,11,0.32))] text-[#f0dfb4]'
                      }`}
                    >
                      <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">{entry.speaker}</p>
                      <p>{entry.line}</p>
                    </div>
                  ))}
                </div>

                <div className="merchant-inset mt-5 rounded-panel p-4">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Merchant Reply Console</p>
                  <div className="mt-3 rounded-panel border border-outline bg-surfaceLowest px-4 py-4 text-sm text-[#f0dfb4]">
                    Wallet-gated actions, seller lot forms, and structured counteroffers will be layered into this console next.
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {actionRows.map((action) => (
                      <button
                        key={action}
                        className={`rounded-panel px-3 py-3 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                          action === 'Accept Terms'
                            ? 'border border-outlineVariant bg-brassButton text-onPrimary shadow-low hover:brightness-105'
                            : 'border border-primary bg-transparent text-primary hover:bg-primary/10'
                        }`}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <aside className="merchant-panel rounded-panel p-4">
              <div className="merchant-inset rounded-panel p-4">
                <p className="text-[11px] uppercase tracking-[0.34em] text-onSurfaceVariant">Offer Sheet</p>
                <h2 className="mt-3 text-xl text-onSurface sm:text-2xl">Current Merchant Terms</h2>

                <div className="mt-5 overflow-hidden rounded-panel border border-outline bg-surfaceLowest">
                  {offerRows.map(([label, value], index) => (
                    <div
                      key={label}
                      className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm ${index !== offerRows.length - 1 ? 'border-b border-outline' : ''}`}
                    >
                      <span className="text-[#f0dfb4]">{label}</span>
                      <span className="font-medium text-onSurface">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-panel border border-outlineVariant bg-[linear-gradient(180deg,rgba(74,0,0,0.16),rgba(78,42,12,0.28))] p-4 text-sm text-[#f0dfb4]">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Rule Status</p>
                  <p className="mt-3">
                    The cargo is within current merchant appetite, but the bid remains strict because the lot is expected to clear through shallow water.
                  </p>
                </div>

                <div className="mt-4 rounded-panel border border-outline bg-surfaceLow p-4 text-sm text-[#f0dfb4]">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-onSurfaceVariant">Next UI Slices</p>
                  <ul className="mt-3 space-y-3">
                    <li>• Wallet connect and ENS identity shell</li>
                    <li>• Seller lot intake form</li>
                    <li>• Merchant rules visualization</li>
                  </ul>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
