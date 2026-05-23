/**
 * Asset Alias Normalizer
 *
 * Maps common aliases, full names, and alternate spellings to canonical ticker symbols.
 * This handles cases like "bitcoin" → "BTC" as noted in user row USR-005.
 *
 * Decision: Normalization is case-insensitive and applied at ingestion time.
 * Both the raw value and the normalized value are stored in the database.
 */
const ASSET_ALIAS_MAP: Record<string, string> = {
  // Bitcoin aliases
  bitcoin: 'BTC',
  xbt: 'BTC',
  btc: 'BTC',

  // Ethereum aliases
  ethereum: 'ETH',
  ether: 'ETH',
  eth: 'ETH',

  // Solana
  solana: 'SOL',
  sol: 'SOL',

  // USDT / Tether
  tether: 'USDT',
  usdt: 'USDT',

  // Polygon / MATIC
  matic: 'MATIC',
  polygon: 'MATIC',

  // Chainlink
  chainlink: 'LINK',
  link: 'LINK',

  // Other common
  cardano: 'ADA',
  ada: 'ADA',
  ripple: 'XRP',
  xrp: 'XRP',
  dogecoin: 'DOGE',
  doge: 'DOGE',
};

/**
 * Normalize an asset string to its canonical ticker symbol.
 * Returns the input uppercased if no alias match found.
 */
export function normalizeAsset(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  return ASSET_ALIAS_MAP[cleaned] ?? raw.trim().toUpperCase();
}

/**
 * Type direction mapping:
 * TRANSFER_OUT (user perspective) ↔ TRANSFER_IN (exchange perspective)
 * These represent the same transaction from opposite viewpoints.
 */
export const TRANSFER_DIRECTION_MAP: Record<string, string> = {
  TRANSFER_OUT: 'TRANSFER_IN',
  TRANSFER_IN: 'TRANSFER_OUT',
};

/**
 * Check whether two transaction types are compatible for matching.
 */
export function areTypesCompatible(userType: string, exchangeType: string): boolean {
  if (userType === exchangeType) return true;
  return TRANSFER_DIRECTION_MAP[userType] === exchangeType;
}