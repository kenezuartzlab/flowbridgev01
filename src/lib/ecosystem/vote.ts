/** BOT Chain's official Ecosystem Ranking vote contract (BOT Mainnet 677), as used by botchain.ai. */
import { parseAbi } from "viem";

export const VOTE_CONTRACT = "0xF5b22756CbD9193CE6F349bbD1835c2e5a6Cb181" as const;
export const VOTE_ABI = parseAbi([
  "function vote(uint256 projectID)",
  "function nextVoteAt(address voter) view returns (uint256)",
  "function whitelist(address account) view returns (bool)",
  "error VoteCooldownActive(uint256 nextVoteAt)",
  "error InvalidProject()",
]);

/** Seconds until this wallet may vote again (0 = can vote now). Whitelisted accounts have no cooldown. */
export function cooldownLeft(whitelisted: boolean, nextVoteAt: bigint, now: bigint): bigint {
  if (whitelisted) return 0n;
  return nextVoteAt > now ? nextVoteAt - now : 0n;
}

export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
