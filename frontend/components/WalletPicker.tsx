'use client';

type WalletOption = {
  id: string;
  name: string;
};

type WalletPickerProps = {
  title: string;
  description: string;
  wallets: WalletOption[];
  open: boolean;
  isConnecting: boolean;
  connectingWalletId: string | null;
  error: string | null;
  onSelect: (walletId: string) => void;
  onClose: () => void;
};

export default function WalletPicker({
  title,
  description,
  wallets,
  open,
  isConnecting,
  connectingWalletId,
  error,
  onSelect,
  onClose,
}: WalletPickerProps) {
  if (!open) return null;

  return (
    <div className="mt-4 rounded-panel border border-outlineVariant bg-surfaceLowest p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-onSurfaceVariant">{title}</p>
          <p className="mt-2 text-sm text-[#f0dfb4]">{description}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-panel border border-outlineVariant px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-[#f4e7c7] hover:bg-surfaceLow"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => onSelect(wallet.id)}
            disabled={isConnecting}
            className="merchant-inset rounded-panel border border-outlineVariant px-4 py-4 text-left transition hover:bg-surfaceLow disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="text-sm text-onSurface">{wallet.name}</p>
            <p className="mt-1 text-xs text-[#cdb98d]">
              {isConnecting && connectingWalletId === wallet.id ? 'Waiting for wallet approval…' : 'Connect with this wallet'}
            </p>
          </button>
        ))}
      </div>

      {wallets.length === 0 ? (
        <p className="mt-4 text-sm text-amber-200">No compatible browser wallets were detected here.</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-panel border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}
    </div>
  );
}
