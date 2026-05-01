'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { supportedChains, wagmiConfig } from '../lib/wallet-config';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mounted ? (
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: '#d4af37',
              accentColorForeground: '#171305',
              borderRadius: 'medium',
              overlayBlur: 'small',
            })}
            modalSize="compact"
            initialChain={supportedChains[1]}
          >
            {children}
          </RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
