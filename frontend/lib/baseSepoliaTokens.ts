import { getAddress } from 'viem'

export type SupportedSellerToken = {
  address: `0x${string}`;
  symbolHint: string;
  label: string;
};

// Curated Base Sepolia testnet tokens — checked via balanceOf even before Alchemy responds.
export const CURATED_BASE_SEPOLIA_TOKENS: SupportedSellerToken[] = [
  {
    address: '0x621b62fbfe0abef52ed2aafd0787fb1daeeed1e5' as `0x${string}`,
    symbolHint: 'PAWN',
    label: 'Pawn Token',
  },
]

// Alchemy API key for token auto-detection (frontend-safe, free tier works)
export const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? ''

export const pawnTokenConfigured = CURATED_BASE_SEPOLIA_TOKENS.length > 0
