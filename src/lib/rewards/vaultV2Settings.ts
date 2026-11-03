import { parseUnits } from 'viem';

export type VaultSettingsInput = { address: `0x${string}`; owner: string; publisher: string; batchCapFlow: string; dailyCapFlow: string };
type Live = { owner: string; publisher: string; batchCapWei: string; dailyCapWei: string };

/** Pure: every entered setting must equal the live on-chain value exactly; returns the mismatched names. */
export function compareVaultSettings(input: VaultSettingsInput, live: Live): string[] {
  const out: string[] = [];
  const wei = (v: string) => { try { return parseUnits(v.trim(), 18); } catch { return -1n; } };
  if (input.owner.toLowerCase() !== live.owner.toLowerCase()) out.push(`Owner (on-chain: ${live.owner})`);
  if (input.publisher.toLowerCase() !== live.publisher.toLowerCase()) out.push(`Publisher (on-chain: ${live.publisher})`);
  if (wei(input.batchCapFlow) !== BigInt(live.batchCapWei)) out.push('Per-batch limit');
  if (wei(input.dailyCapFlow) !== BigInt(live.dailyCapWei)) out.push('Daily limit');
  return out;
}
