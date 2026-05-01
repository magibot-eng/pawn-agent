'use client';

import { createPublicClient, getAddress, http } from 'viem';
import { mainnet } from 'viem/chains';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Ens } from './api';

const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });

type WalletOption = {
  id: string;
  name: string;
};

function normalizeWalletName(name: string, id: string) {
  if (id === 'metaMask') return 'MetaMask';
  if (id === 'coinbaseWalletSDK') return 'Coinbase Wallet';
  return name;
}

export function useUnifiedWallet() {
  const { address, connector, isConnected } = useAccount();
  const { connectors, connectAsync, error: connectError, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [ensName, setEnsName] = useState<string | null>(null);
  const [ensNames, setEnsNames] = useState<string[]>([]);
  const [ensLookupError, setEnsLookupError] = useState<string | null>(null);
  const [pendingWalletId, setPendingWalletId] = useState<string | null>(null);

  const walletAddress = useMemo(() => (address ? getAddress(address) : null), [address]);

  useEffect(() => {
    let active = true;

    async function resolveEns() {
      if (!walletAddress) {
        setEnsName(null);
        setEnsNames([]);
        setEnsLookupError(null);
        return;
      }

      try {
        const [primaryResult, ownedResult] = await Promise.all([
          Ens.primary(walletAddress),
          Ens.owned(walletAddress),
        ]);
        if (!active) return;

        const ownedNames = Array.from(new Set((ownedResult.names ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean)));
        const primaryName = primaryResult.primary_ens?.trim().toLowerCase() ?? null;
        const mergedNames = primaryName && !ownedNames.includes(primaryName) ? [primaryName, ...ownedNames] : ownedNames;

        setEnsName(primaryName);
        setEnsNames(mergedNames);
        setEnsLookupError(
          mergedNames.length > 0
            ? null
            : 'No ENS storefront identity was found for this wallet yet.'
        );
      } catch (error) {
        console.error('ENS lookup failed:', error);
        if (!active) return;
        setEnsName(null);
        setEnsNames([]);
        setEnsLookupError('Could not read ENS identities for this wallet right now.');
      }
    }

    resolveEns();
    return () => {
      active = false;
    };
  }, [walletAddress]);

  const walletOptions = useMemo<WalletOption[]>(() => {
    const seen = new Set<string>();
    return connectors
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .map((entry) => ({
        id: entry.id,
        name: normalizeWalletName(entry.name, entry.id),
      }));
  }, [connectors]);

  const connectWallet = useCallback(
    async (connectorId: string) => {
      const target = connectors.find((entry) => entry.id === connectorId);
      if (!target) {
        throw new Error('Requested wallet connector is not available in this browser.');
      }
      setPendingWalletId(connectorId);
      try {
        await connectAsync({ connector: target });
      } finally {
        setPendingWalletId(null);
      }
    },
    [connectAsync, connectors]
  );

  const disconnectWallet = useCallback(async () => {
    await disconnectAsync();
  }, [disconnectAsync]);

  const resolveEnsOwnerAddress = useCallback(async (ensName: string) => {
    const resolved = await mainnetClient.getEnsAddress({ name: ensName });
    return resolved ? getAddress(resolved) : null;
  }, []);

  return {
    walletAddress,
    walletConnectorName: connector ? normalizeWalletName(connector.name, connector.id) : null,
    isConnected,
    ensName,
    ensNames,
    ensLookupError,
    resolveEnsOwnerAddress,
    walletOptions,
    connectWallet,
    disconnectWallet,
    connectError: connectError?.message ?? null,
    isConnecting: isPending,
    connectingWalletId: pendingWalletId,
  };
}
