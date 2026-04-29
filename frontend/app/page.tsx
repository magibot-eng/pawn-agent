const bullets = [
  "Root ENS identity as the canonical merchant brand",
  "Hard buyout rules with autonomous execution inside policy bounds",
  "Base Sepolia-first settlement path",
  "Merchant-shop UI direction instead of a generic crypto dashboard",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-grain text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-brass/80">Pawn Agent</p>
            <p className="mt-2 text-sm text-fog">ENS-native AI token buyout storefronts</p>
          </div>
          <div className="rounded-full border border-brass/30 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-brass">
            Base Sepolia MVP
          </div>
        </header>

        <section className="grid gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm uppercase tracking-[0.35em] text-ember/80">Merchant Identity • Agent Negotiation • Onchain Settlement</p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
              Turn an ENS name into a living token buyout shop.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-fog">
              Pawn Agent gives merchants an ENS-branded storefront, configurable buyout rules, encrypted LLM key storage,
              and a negotiation flow designed to feel more like bargaining with a shopkeeper than filling out a DeFi form.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <button className="rounded-full border border-brass/40 bg-brass px-6 py-3 text-sm font-medium text-abyss transition hover:bg-[#c89b57]">
                View Design Docs
              </button>
              <button className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                Scaffold Merchant Onboarding
              </button>
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[28px] border border-brass/20 bg-white/5 p-6 shadow-glow backdrop-blur-sm">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(240,138,66,0.12),transparent_35%)]" />
            <div className="relative">
              <p className="text-xs uppercase tracking-[0.32em] text-brass/80">Front-End Shell</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">First storefront mood pass</h2>
              <p className="mt-3 text-sm leading-7 text-fog">
                This shell establishes the visual direction: dim brass, deep wine, a counter-facing composition, and a
                merchant-first emotional tone instead of a default web3 dashboard.
              </p>

              <ul className="mt-8 space-y-3">
                {bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-fog">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-ember" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>

        <footer className="border-t border-white/10 pt-4 text-sm text-fog">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Public OSS build log in progress.</span>
            <span>Next slice: wallet + ENS onboarding shell.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
