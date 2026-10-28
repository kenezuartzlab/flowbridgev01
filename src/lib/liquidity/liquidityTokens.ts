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
/** Owner-authorized Mainnet canary: only these wallets may add/remove on BDEX V2/V3 while public Mainnet writes stay off. */
export const LIQUIDITY_CANARY_WALLETS: Record<number, string[]> = { 677: ["0x971e7790fe6c8f77dc666bb05d4aeda362653f94"] };
export const LIQUIDITY_CANARY_DEXES = ["BDEX V2", "BDEX V3"];
export function liquidityWritesAllowed(chainId: number, wallet?: string, dex?: string): boolean {
  if (LIQUIDITY_WRITES_ENABLED[chainId] === true) return true;
  const list = LIQUIDITY_CANARY_WALLETS[chainId] ?? [];
  if (!wallet || !list.includes(wallet.toLowerCase())) return false;
  return dex === undefined || LIQUIDITY_CANARY_DEXES.includes(dex);
}
export const LIQUIDITY_WRITES_ENABLED: Record<number, boolean> = { 968: true, 677: true };
