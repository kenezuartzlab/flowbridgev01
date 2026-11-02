import { type Address } from 'viem';
import { prepareVaultBatch, type VaultAward } from './vaultV2';

/** Routing is immutable at earning time; no historical aggregate-to-award mapping. */
export function vaultAwardDestination(createdAt: string, cutoverAt: string | null, accepted: boolean) {
  return accepted && cutoverAt && Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt) > Date.parse(cutoverAt) ? 'VAULT_V2' : 'LEGACY';
}
export type CanonicalVaultSource = {
  id: string; economic_award_id: string; wallet: string; points: number; program_id: string;
  destination: string; created_at: string; policy_version: string;
};
/** Sources are returned by service-only SQL, never supplied by a browser. */
export function canonicalVaultSnapshot(rows: CanonicalVaultSource[], cutoverAt: string, free: bigint, cap: bigint, daily: bigint) {
  const awards: VaultAward[] = rows.map(r => ({
    id: r.id, economicId: r.economic_award_id, wallet: r.wallet as Address, points: BigInt(r.points), program: r.program_id,
    verified: true, reconciled: true, funded: true, authorized: true, bindingMatches: true, mainnet: true,
    newAfterCutover: r.destination === 'VAULT_V2' && vaultAwardDestination(r.created_at, cutoverAt, true) === 'VAULT_V2', allocated: false,
  }));
  return prepareVaultBatch(awards, free, cap, daily);
}
export function vaultPublisherIdentity(connected: string | null, expected: string, chainId: number) {
  return chainId === 677 && !!connected && connected.toLowerCase() === expected.toLowerCase();
}
/** Whole awards only; overflow remains queued, never changes an existing snapshot. */
export function selectBoundedVaultSources(rows: CanonicalVaultSource[], maxWei: bigint) {
  const selected:CanonicalVaultSource[]=[];const wallets=new Set<string>();let used=0n;
  for(const r of [...rows].sort((a,b)=>a.id.localeCompare(b.id))) {
    const amount=BigInt(r.points)*10n**18n,w=r.wallet.toLowerCase();
    if(r.points<=0 || used+amount>maxWei || (!wallets.has(w)&&wallets.size===100)) continue;
    selected.push(r);wallets.add(w);used+=amount;
    if(selected.length===1000)break;
  }
  return selected;
}