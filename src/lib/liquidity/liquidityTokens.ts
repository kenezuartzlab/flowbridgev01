/** Token list for liquidity screens: curated swap tokens + testnet-only rehearsal assets. */
import { getCuratedTokens, NATIVE_TOKEN_ADDRESS, type Token } from "@/lib/swap/tokenRegistry";

const ZERO = /^0x0{40}$/i;

/** BOT Testnet rehearsal assets (never shown on Mainnet). */
const TESTNET_EXTRA: Token[] = [
  { address: "0xce14ca1cf2012f1996d5fbc7d369fa051aa641ac", symbol: "FLOW", name: "FlowBridge Token (testnet)", decimals: 18 },
  { address: "0xa861152ca3676bccf7b5fdafb9eb6a57b9d32d0e", symbol: "MSTT", name: "Rehearsal test token (testnet)", decimals: 18 },
];

export function liquidityTokens(chainId: number): (Token & { curated: true })[] {
  const isMainnet = chainId === 677;
  const base = getCuratedTokens(isMainnet).filter((t) => !ZERO.test(t.address));
  const all = isMainnet ? base : [...base.filter((t) => !TESTNET_EXTRA.some((x) => x.symbol === t.symbol)), ...TESTNET_EXTRA];
  const seen = new Set<string>();
  return all.filter((t) => (seen.has(t.address) ? false : (seen.add(t.address), true))).map((t) => ({ ...t, curated: true as const }));
}

export const isNative = (t: Pick<Token, "address">) => t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS;

/**
 * Liquidity write availability per chain. BOT Mainnet liquidity writes stay
 * closed until the Mainnet liquidity canaries are separately approved and pass;
 * Mainnet discovery/positions/fees are read-only.
 */
export const LIQUIDITY_WRITES_ENABLED: Record<number, boolean> = { 968: true, 677: false };
