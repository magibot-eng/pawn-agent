'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEffect, useState } from 'react';

type RainbowConnectActionProps = {
  connectLabel: string;
  connectedLabel?: string;
  className?: string;
};

export default function RainbowConnectAction({
  connectLabel,
  connectedLabel = 'Wallet connected',
  className = 'rounded-panel border border-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary hover:bg-primary/10',
}: RainbowConnectActionProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button type="button" className={className} style={{ opacity: 0.7 }}>
        {connectLabel}
      </button>
    );
  }

  void connectedLabel;
  void className;

  return (
    <ConnectButton
      accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
      chainStatus="icon"
      label={connectLabel}
      showBalance={false}
    />
  );
}
