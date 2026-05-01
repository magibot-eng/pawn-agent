import { getAddress } from 'viem';

export type SupportedSellerToken = {
  address: `0x${string}`;
  symbolHint: string;
  label: string;
};

function normalizeConfiguredAddress(value: string | undefined): `0x${string}` | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return getAddress(trimmed) as `0x${string}`;
  } catch (error) {
    console.warn('Ignoring invalid NEXT_PUBLIC_PAWN_TOKEN_ADDRESS:', error);
    return null;
  }
}

const pawnTokenAddress = normalizeConfiguredAddress(process.env.NEXT_PUBLIC_PAWN_TOKEN_ADDRESS);

export const SUPPORTED_SELLER_TOKENS: SupportedSellerToken[] = pawnTokenAddress
  ? [
      {
        address: pawnTokenAddress,
        symbolHint: 'PAWN',
        label: 'Pawn test token',
      },
    ]
  : [];

export const DEFAULT_SUPPORTED_SELLER_TOKEN = SUPPORTED_SELLER_TOKENS[0] ?? null;
export const pawnTokenConfigured = Boolean(pawnTokenAddress);
