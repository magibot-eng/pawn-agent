export type MerchantPortrait = {
  id: string;
  name: string;
  vibe: string;
  imageSrc: string;
  objectPosition?: string;
  scale?: number;
};

export const MERCHANT_PORTRAITS: MerchantPortrait[] = [
  {
    id: 'brass-ledger-broker',
    name: 'Brass Ledger Broker',
    vibe: 'Polished, calculating, premium counter energy.',
    imageSrc: '/merchant-portraits/brass-ledger-broker.png',
    objectPosition: 'center 22%',
    scale: 1.22,
  },
  {
    id: 'backroom-scrapper',
    name: 'Backroom Scrapper',
    vibe: 'Rougher, skeptical, gritty dealmaker energy.',
    imageSrc: '/merchant-portraits/backroom-scrapper.png',
    objectPosition: 'center 18%',
    scale: 1.2,
  },
  {
    id: 'arcane-appraiser',
    name: 'Arcane Appraiser',
    vibe: 'Mystical, strange, rare-asset specialist energy.',
    imageSrc: '/merchant-portraits/arcane-appraiser.png',
    objectPosition: 'center 20%',
    scale: 1.2,
  },
  {
    id: 'quiet-vault-keeper',
    name: 'Quiet Vault Keeper',
    vibe: 'Reserved, disciplined, high-trust vault energy.',
    imageSrc: '/merchant-portraits/quiet-vault-keeper.png',
    objectPosition: 'center 20%',
    scale: 1.18,
  },
];

export const DEFAULT_MERCHANT_PORTRAIT_ID = 'brass-ledger-broker';

export function getMerchantPortraitById(id?: string | null): MerchantPortrait {
  return MERCHANT_PORTRAITS.find((portrait) => portrait.id === id) ?? MERCHANT_PORTRAITS[0];
}
