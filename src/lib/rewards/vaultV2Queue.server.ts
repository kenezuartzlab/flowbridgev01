import { reserveVaultV2Awards } from './vaultV2Allocator.server';
type DB = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Scheduled prepare-only queue; policy defaults OFF and is approved with the exact carryover budget. */
export async function queueVerifiedVaultAwards(db: DB) {
  const r = await db.from('reward_vault_v2_config').select('verified_queue_enabled,financial_enabled').maybeSingle();
  if (r.error) throw new Error('QUEUE_CONFIGURATION_UNAVAILABLE');
  if (!r.data?.verified_queue_enabled || !r.data.financial_enabled) return { state: 'OFF' };
  const result = await reserveVaultV2Awards(db);
  return result && 'continuation' in result ? { state: 'CONTINUE', continuation: result.continuation } : { state: result ? 'AWAITING_MANUAL_PUBLISHER' : 'EMPTY' };
}