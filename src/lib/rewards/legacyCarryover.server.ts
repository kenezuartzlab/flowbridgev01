import type { AdminContext } from '@/lib/admin/adminGate.server';
import type { Address } from 'viem';
import { verifiedVaultDeployment } from './vaultV2Ingestion.server';
import { verifyCarryoverV1 } from './legacyCarryoverV1.server';
type DB = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export type CarryoverReview = {
  snapshotHash: string; stateHash: string; verifiedPoints: number; goodwillPoints: number;
  wallets: number; sourceCount: number; bins: Record<string, { rows: number; points: number }>;
  stagedId: string | null; confirmed: boolean; queueEnabled: boolean;
  freeWei: string | null; pendingWei: string; fundingRequiredWei: string; fullyBacked: boolean;
};

/** Aggregate-only admin review. Private source items never leave the server. */
export async function reviewLegacyCarryover(db: DB): Promise<CarryoverReview> {
  const [r, snapshots, config, pending] = await Promise.all([
    db.rpc('legacy_carryover_preview'),
    db.from('legacy_carryover_snapshots').select('id,snapshot_hash,status,summary').order('created_at', { ascending: false }).limit(20),
    db.from('reward_vault_v2_config').select('*').maybeSingle(),
    db.from('reward_vault_v2_batches').select('total_wei').neq('state','CREDITED'),
  ]);
  if (r.error || snapshots.error || config.error || pending.error || !r.data) throw new Error('COMPLETE_CARRYOVER_REVIEW_UNAVAILABLE');
  const confirmed = snapshots.data?.find(s => s.status === 'CONFIRMED');
  const raw = (confirmed?.summary ?? r.data) as unknown as Record<string, unknown>;
  // Explicit allowlist: never spread RPC data (it includes private per-account source items).
  const preview = {snapshotHash:String(raw.snapshotHash),stateHash:String(raw.stateHash),verifiedPoints:Number(raw.verifiedPoints),goodwillPoints:Number(raw.goodwillPoints),wallets:Number(raw.wallets),sourceCount:Number(raw.sourceCount),bins:raw.bins as CarryoverReview['bins']};
  const cfg = config.data;
  let free: string | null = null;
  if (cfg?.contract_address) {
    const approval = await db.from('reward_vault_v2_identity_approvals').select('owner,publisher').eq('contract_address',cfg.contract_address).order('id',{ascending:false}).limit(1).maybeSingle();
    if (approval.error) throw new Error('IDENTITY_APPROVAL_UNAVAILABLE');
    const e = await verifiedVaultDeployment(cfg.contract_address as Address, undefined, approval.data).catch(() => null);
    if (e?.codeHash === cfg.code_hash && e.publisher === cfg.publisher) free = e.freeWei;
  }
  const pendingWei = (pending.data ?? []).reduce((n,b) => n + BigInt(b.total_wei),0n);
  const required = BigInt(preview.verifiedPoints + preview.goodwillPoints) * 10n ** 18n;
  return { ...preview, stagedId: confirmed?.id ?? snapshots.data?.find(s => s.snapshot_hash === preview.snapshotHash)?.id ?? null,
    confirmed: Boolean(confirmed), queueEnabled: Boolean(cfg?.verified_queue_enabled), freeWei: free,
    pendingWei: pendingWei.toString(), fundingRequiredWei: required.toString(), fullyBacked: free !== null && BigInt(free) >= required + pendingWei };
}

export async function stageLegacyCarryover(db: DB, actor: AdminContext, snapshotHash: string) {
  if (actor.role !== 'super_admin') throw new Error('SUPER_ADMIN_REQUIRED');
  await verifyCarryoverV1(db);
  const r = await db.rpc('stage_legacy_carryover', {p_hash: snapshotHash, p_actor: actor.userId, p_wallet: actor.wallet});
  if (r.error || !r.data) throw new Error('SNAPSHOT_CHANGED_OR_UNAUTHORIZED');
  return { stagedId: r.data };
}

/** Explicit single budget approval only. No chain sender, signing key, or credit call. */
export async function confirmLegacyCarryover(db: DB, actor: AdminContext, input: {snapshotId:string;snapshotHash:string;verifiedPoints:number;goodwillBudget:number}) {
  if (actor.role !== 'super_admin') throw new Error('SUPER_ADMIN_REQUIRED');
  const cfg = await db.from('reward_vault_v2_config').select('*').maybeSingle();
  if (cfg.error || !cfg.data?.contract_address || !cfg.data.financial_enabled) throw new Error('VAULT_NOT_AUTHORIZED');
  const approval = await db.from('reward_vault_v2_identity_approvals').select('owner,publisher').eq('contract_address',cfg.data.contract_address).order('id',{ascending:false}).limit(1).maybeSingle();
  if (approval.error) throw new Error('IDENTITY_APPROVAL_UNAVAILABLE');
  const e = await verifiedVaultDeployment(cfg.data.contract_address as Address, undefined, approval.data);
  const v1 = await verifyCarryoverV1(db);
  const r = await db.rpc('confirm_legacy_carryover', {p_snapshot:input.snapshotId,p_hash:input.snapshotHash,p_verified:input.verifiedPoints,p_goodwill_budget:input.goodwillBudget,p_actor:actor.userId,p_wallet:actor.wallet,p_free_wei:e.freeWei as never,p_evidence:{...e,v1} as never,p_observed:new Date().toISOString()});
  if (r.error) throw new Error('SNAPSHOT_BUDGET_OR_FULL_BACKING_CHANGED');
  return r.data;
}