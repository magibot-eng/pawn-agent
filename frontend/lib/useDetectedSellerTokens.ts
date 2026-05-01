'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, formatUnits, getAddress, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { SUPPORTED_SELLER_TOKENS } from './baseSepoliaTokens';

const baseSepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });

const erc20Abi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export type DetectedSellerToken = {
  address: `0x${string}`;
  symbol: string;
  label: string;
  balance: string;
  rawBalance: bigint;
  decimals: number;
};

function formatTokenBalance(rawBalance: bigint, decimals: number) {
  const formatted = formatUnits(rawBalance, decimals);
  const asNumber = Number(formatted);
  if (Number.isFinite(asNumber)) {
    return asNumber.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return formatted;
}

export function useDetectedSellerTokens(walletAddress: string | null) {
  const [tokens, setTokens] = useState<DetectedSellerToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!walletAddress) {
        setTokens([]);
        setLoading(false);
        setError(null);
        return;
      }

      if (SUPPORTED_SELLER_TOKENS.length === 0) {
        setTokens([]);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const normalizedWallet = getAddress(walletAddress);
        const discovered: DetectedSellerToken[] = [];

        for (const token of SUPPORTED_SELLER_TOKENS) {
          const [balanceResult, symbolResult, decimalsResult] = await Promise.all([
            baseSepoliaClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [normalizedWallet],
            }),
            baseSepoliaClient
              .readContract({
                address: token.address,
                abi: erc20Abi,
                functionName: 'symbol',
              })
              .catch(() => token.symbolHint),
            baseSepoliaClient
              .readContract({
                address: token.address,
                abi: erc20Abi,
                functionName: 'decimals',
              })
              .catch(() => 18),
          ]);

          const rawBalance = balanceResult as bigint;
          const decimals = Number(decimalsResult);
          if (rawBalance <= BigInt(0)) continue;

          discovered.push({
            address: token.address,
            symbol: String(symbolResult || token.symbolHint),
            label: token.label,
            balance: formatTokenBalance(rawBalance, decimals),
            rawBalance,
            decimals,
          });
        }

        if (!active) return;
        setTokens(discovered);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setTokens([]);
        setError(err instanceof Error ? err.message : 'Could not detect supported Base Sepolia tokens for this wallet.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [walletAddress]);

  return { tokens, loading, error, hasConfiguredTokens: SUPPORTED_SELLER_TOKENS.length > 0 };
}
