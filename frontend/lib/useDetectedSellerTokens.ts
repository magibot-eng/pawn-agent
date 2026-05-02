 'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, formatUnits, getAddress, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ALCHEMY_API_KEY, CURATED_BASE_SEPOLIA_TOKENS } from './baseSepoliaTokens';

const baseSepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });

const erc20Abi = [
  { type: 'function', stateMutability: 'view', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', stateMutability: 'view', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const;

export type DetectedSellerToken = {
  address: `0x${string}`;
  symbol: string;
  label: string;
  balance: string;
  rawBalance: bigint;
  decimals: number;
  source: 'alchemy' | 'curated' | 'custom';
};

type AlchemyToken = {
  contractAddress: string;
  decimals: number;
  logo?: string;
  name?: string;
  symbol?: string;
};

function formatTokenBalance(rawBalance: bigint, decimals: number) {
  const formatted = formatUnits(rawBalance, decimals);
  const asNumber = Number(formatted);
  if (Number.isFinite(asNumber)) return asNumber.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return formatted;
}

async function fetchAlchemyTokenList(address: string): Promise<AlchemyToken[]> {
  if (!ALCHEMY_API_KEY) return [];
  try {
    const url = `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}/getTokenList?address=${address}&excludeFlags=SPAM`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json() as { tokenList?: AlchemyToken[] };
    return data.tokenList ?? [];
  } catch {
    return [];
  }
}

async function fetchBalance(address: `0x${string}`, tokenAddress: `0x${string}`): Promise<bigint> {
  try {
    return await baseSepoliaClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint;
  } catch {
    return BigInt(0);
  }
}

export function useDetectedSellerTokens(
  walletAddress: string | null,
  customTokenAddresses: `0x${string}`[] = [],
) {
  const [allTokens, setAllTokens] = useState<DetectedSellerToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!walletAddress) {
        setAllTokens([]);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const normalizedWallet = getAddress(walletAddress) as `0x${string}`;
        const discovered: DetectedSellerToken[] = [];

        // 1. Fetch Alchemy auto-detected tokens
        const alchemyTokens = await fetchAlchemyTokenList(normalizedWallet);

        // 2. Build deduplicated address set: alchemy + curated + custom
        const seen = new Set<string>();
        const candidates: Array<{ addr: `0x${string}`; source: DetectedSellerToken['source'] }> = [];

        for (const t of alchemyTokens) {
          try {
            const addr = getAddress(t.contractAddress) as `0x${string}`;
            if (!seen.has(addr)) { seen.add(addr); candidates.push({ addr, source: 'alchemy' }); }
          } catch { /* skip invalid */ }
        }
        for (const t of CURATED_BASE_SEPOLIA_TOKENS) {
          if (!seen.has(t.address)) { seen.add(t.address); candidates.push({ addr: t.address, source: 'curated' }); }
        }
        for (const addr of customTokenAddresses) {
          try {
            const normalized = getAddress(addr) as `0x${string}`;
            if (!seen.has(normalized)) { seen.add(normalized); candidates.push({ addr: normalized, source: 'custom' }); }
          } catch { /* skip invalid */ }
        }

        // 3. Fetch balance + symbol + decimals in parallel batches
        const BATCH = 8;
        for (let i = 0; i < candidates.length; i += BATCH) {
          const batch = candidates.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(async ({ addr, source }) => {
              const [balance, symbol, decimals] = await Promise.all([
                fetchBalance(normalizedWallet, addr),
                baseSepoliaClient.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }).catch(() => null as string | null),
                baseSepoliaClient.readContract({ address: addr, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
              ]);
              return { addr, source, balance, symbol, decimals };
            }),
          );

          for (const { addr, source, balance, symbol, decimals } of results) {
            if (balance <= BigInt(0)) continue;
            const curated = CURATED_BASE_SEPOLIA_TOKENS.find(t => t.address === addr);
            const alchemyToken = alchemyTokens.find(t => getAddress(t.contractAddress) === addr);

            discovered.push({
              address: addr,
              symbol: symbol ?? alchemyToken?.symbol ?? curated?.symbolHint ?? '???',
              label: curated?.label ?? alchemyToken?.name ?? (source === 'custom' ? addr.slice(0, 10) + '...' : 'Unknown token'),
              balance: formatTokenBalance(balance, Number(decimals)),
              rawBalance: balance,
              decimals: Number(decimals),
              source,
            });
          }
        }

        // 4. Sort: custom first, then curated, then alchemy
        const order = { custom: 0, curated: 1, alchemy: 2 } as const;
        discovered.sort((a, b) => order[a.source] - order[b.source]);

        if (active) setAllTokens(discovered);
      } catch (err) {
        console.error(err);
        if (active) { setAllTokens([]); setError(err instanceof Error ? err.message : 'Failed to detect tokens.'); }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [walletAddress, JSON.stringify(customTokenAddresses)]);

  return {
    tokens: allTokens,
    loading,
    error,
    hasConfiguredTokens: CURATED_BASE_SEPOLIA_TOKENS.length > 0 || Boolean(ALCHEMY_API_KEY),
  };
}
