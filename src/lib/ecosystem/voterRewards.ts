/** Pure voter-reward rules: 50% of BOT received goes back — 25% to the Top 10 voters, 25% to everyone else, by votes. */

export const TOP_TIER_SIZE = 10;
export const TOP_TIER_BPS = 2500;
export const REST_TIER_BPS = 2500;
/** Proxy implementation of BOT Chain's HeatVote contract that accounting was verified against. */
export const EXPECTED_VOTE_IMPLEMENTATION = "0x443a580b741df9f1ee6d00526fb1827fd6d92bd8";
export const VOTE_EVENT_TOPIC = "0x710b36627495d2e7af3a196c85bf3e51efd906f54516753e5e801b3a22b18f78";
export const VOTE_CONTRACT_START_BLOCK = 23_971_507n;
export const MAX_PRICE_DRIFT = 0.02;

export interface VoterTally { wallet: string; votes: number }
export interface VoterCredit extends VoterTally { tier: "TOP10" | "COMMUNITY"; flow: number }

const round6 = (n: number) => Math.floor(n * 1e6) / 1e6;

/** Input must already be ranked (most votes first, earliest voter wins ties). */
export function computeVoterCredits(ranked: VoterTally[], botReceived: number, flowPerBot: number): VoterCredit[] {
  if (!(botReceived > 0) || !(flowPerBot > 0)) return [];
  const voters = ranked.filter((v) => v.votes > 0);
  const top = voters.slice(0, TOP_TIER_SIZE);
  const rest = voters.slice(TOP_TIER_SIZE);
  const split = (group: VoterTally[], bps: number, tier: VoterCredit["tier"]): VoterCredit[] => {
    const total = group.reduce((s, v) => s + v.votes, 0);
    if (!total) return [];
    const pool = (botReceived * bps) / 10_000 * flowPerBot;
    return group.map((v) => ({ ...v, wallet: v.wallet.toLowerCase(), tier, flow: round6((pool * v.votes) / total) }));
  };
  return [...split(top, TOP_TIER_BPS, "TOP10"), ...split(rest, REST_TIER_BPS, "COMMUNITY")];
}

/** FLOW per BOT from two USDT-quoted pool prices. */
export function flowPerBot(flowPerUsdt: number, botPerUsdt: number): number {
  if (!(flowPerUsdt > 0) || !(botPerUsdt > 0)) return 0;
  return flowPerUsdt / botPerUsdt;
}

export function priceWithinDrift(approved: number, live: number, max = MAX_PRICE_DRIFT): boolean {
  return approved > 0 && live > 0 && Math.abs(approved - live) / live <= max;
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
