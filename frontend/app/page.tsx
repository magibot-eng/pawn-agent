const merchantTraits = [
  "Prefers thin-liquidity tokens with steep discount upside",
  "Rejects assets outside hard merchant rules",
  "Auto-executes only when settlement terms are policy-compliant",
];

const negotiationLog = [
  {
    speaker: "Seller",
    line: "Offering 18,000 TIDE. Looking to exit quickly if the shop can clear in USDC.",
  },
  {
    speaker: "Merchant",
    line: "Liquidity is shallow. I will price this as a distressed port lot, not at headline market rate.",
  },
  {
    speaker: "Merchant",
    line: "If slippage holds and your lot is clean, I can make a discounted bid inside my current rules.",
  },
];

const offerRows = [
  ["Visible market", "$0.084 / token"],
  ["Liquidity pressure", "High"],
  ["Merchant discount", "-38%"],
  ["Proposed payout", "USDC 937.44"],
  ["Settlement window", "15 min"],
];

const actionRows = ["Make Offer", "Counter", "Accept Terms", "Walk Away"];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-grain text-white">
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-8 lg:px-10">
        <div className="rounded-[28px] border border-brass/30 bg-[linear-gradient(180deg,rgba(13,17,24,0.94),rgba(8,10,15,0.98))] p-4 shadow-glow sm:p-5 lg:p-6">
          <header className="flex flex-col gap-4 rounded-[20px] border border-brass/20 bg-frame px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.38em] text-brassLight/80">Pawn Agent Merchant Exchange</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
                Uncharted-waters-style merchant storefront shell
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-fog">
                A first pass at the product as a 2000s online trading-game interface: framed panes, bargaining-first layout,
                and an ENS merchant identity at the center of the experience.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs uppercase tracking-[0.22em] sm:text-right">
              <div className="rounded-xl border border-brass/20 bg-black/20 px-3 py-2 text-fog">Port: Base Sepolia</div>
              <div className="rounded-xl border border-brass/20 bg-black/20 px-3 py-2 text-fog">Status: Open</div>
              <div className="rounded-xl border border-brass/20 bg-black/20 px-3 py-2 text-fog">Shop: ted.eth</div>
              <div className="rounded-xl border border-brass/20 bg-black/20 px-3 py-2 text-fog">Mode: Buyout</div>
            </div>
          </header>

          <section className="mt-5 grid gap-4 lg:grid-cols-[0.78fr_1.2fr_0.82fr]">
            <aside className="rounded-[24px] border border-brass/25 bg-[linear-gradient(180deg,rgba(33,24,17,0.52),rgba(14,19,27,0.92))] p-4 shadow-panel">
              <div className="rounded-[18px] border border-brass/20 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.34em] text-brassLight/75">Merchant Ledger</p>
                <div className="mt-4 flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-brass/30 bg-wine/40 text-2xl text-brassLight">
                    ⚓
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Harbormaster ted.eth</h2>
                    <p className="mt-1 text-sm text-fog">Distressed token buyer • Rule-bound automated merchant</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm text-fog">
                  <p className="text-xs uppercase tracking-[0.28em] text-brassLight/75">Desired Assets</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['Low-float tokens', 'Thin-liquidity lots', 'Volatile governance assets'].map((tag) => (
                      <span key={tag} className="rounded-full border border-brass/25 bg-abyss/80 px-3 py-1.5 text-xs text-brassLight">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-[16px] border border-white/8 bg-black/20 p-4 text-sm text-fog">
                  <p className="text-xs uppercase tracking-[0.28em] text-brassLight/75">Merchant Traits</p>
                  <ul className="mt-3 space-y-3">
                    {merchantTraits.map((trait) => (
                      <li key={trait} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-ember" />
                        <span>{trait}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            <section className="rounded-[24px] border border-brass/25 bg-[linear-gradient(180deg,rgba(18,23,34,0.95),rgba(10,12,17,0.96))] p-4 shadow-panel">
              <div className="rounded-[18px] border border-brass/20 bg-black/20 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brass/15 pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.34em] text-brassLight/75">Negotiation Window</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Dockside bargaining log</h2>
                  </div>
                  <div className="rounded-full border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs uppercase tracking-[0.24em] text-ember">
                    Session Open
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {negotiationLog.map((entry) => (
                    <div
                      key={`${entry.speaker}-${entry.line}`}
                      className={`rounded-[18px] border px-4 py-4 text-sm leading-7 ${
                        entry.speaker === 'Merchant'
                          ? 'border-brass/20 bg-[linear-gradient(180deg,rgba(91,31,46,0.22),rgba(18,23,34,0.7))] text-fog'
                          : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] text-fog'
                      }`}
                    >
                      <p className="mb-2 text-[11px] uppercase tracking-[0.3em] text-brassLight/75">{entry.speaker}</p>
                      <p>{entry.line}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[18px] border border-brass/20 bg-[linear-gradient(180deg,rgba(7,9,13,0.88),rgba(14,19,27,0.92))] p-4">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-brassLight/75">Merchant Reply Console</p>
                  <div className="mt-3 rounded-[16px] border border-white/8 bg-black/25 px-4 py-4 text-sm text-fog">
                    Entered lots, counteroffers, and wallet-gated actions will live here in the next slice.
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {actionRows.map((action) => (
                      <button
                        key={action}
                        className={`rounded-[14px] border px-3 py-3 text-xs uppercase tracking-[0.22em] transition ${
                          action === 'Accept Terms'
                            ? 'border-brass/40 bg-brass text-abyss hover:bg-[#c89b57]'
                            : 'border-brass/20 bg-white/5 text-fog hover:bg-white/10'
                        }`}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <aside className="rounded-[24px] border border-brass/25 bg-[linear-gradient(180deg,rgba(20,18,15,0.56),rgba(14,19,27,0.94))] p-4 shadow-panel">
              <div className="rounded-[18px] border border-brass/20 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.34em] text-brassLight/75">Offer Sheet</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Current merchant terms</h2>

                <div className="mt-5 overflow-hidden rounded-[16px] border border-white/8 bg-black/20">
                  {offerRows.map(([label, value], index) => (
                    <div
                      key={label}
                      className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm ${index !== offerRows.length - 1 ? 'border-b border-white/8' : ''}`}
                    >
                      <span className="text-fog">{label}</span>
                      <span className="font-medium text-white">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[16px] border border-brass/20 bg-wine/15 p-4 text-sm text-fog">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-brassLight/75">Rule Status</p>
                  <p className="mt-3 leading-7">
                    Trade is inside current merchant appetite, but pricing remains harsh because the lot is assumed to be hard to clear.
                  </p>
                </div>

                <div className="mt-4 rounded-[16px] border border-brass/20 bg-black/20 p-4 text-sm text-fog">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-brassLight/75">Next UI slices</p>
                  <ul className="mt-3 space-y-3">
                    <li>• Wallet connect + ENS identity shell</li>
                    <li>• Seller input form for token lots</li>
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
