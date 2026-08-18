/**
 * Gate 5A2 — SERVER-ONLY trusted adapter around the pure `verifyBridgeActivity`
 * logic.
 *
 * Responsibilities:
 *   - fetch the finalized source receipt with an explicit, REQUIRED
 *     confirmation policy (no production default)
 *   - reconstruct trusted activity facts from the official source event
 *   - persist CONFIRMED evidence ONLY through
 *     public.admin_record_verified_activity(...)
 *
 * It never awards XP / PTS / FLOW, never settles campaigns, never writes the
 * Activity Registry and never performs direct DML on verified_activities.
 */
import { createPublicClient, http, recoverTypedDataAddress } from 'viem';
import type { Hex } from './activityIntent';
import { verifyBridgeActivity, type ActivityIntentHandoff, type VerificationOutcome } from './activityVerifier';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';
import type { ActivityRepository, VerifiedActivity } from './activityRepository';
import { botTestnet, bscTestnet } from '../wagmi';
import { OFFICIAL_CHAIN_IDS } from '../bridge/officialBridgeConfig';

/** Frozen finality math: inclusion block counts as the first confirmation. */
export function confirmationsFor(latestBlock: bigint, sourceBlock: bigint): bigint {
  return latestBlock >= sourceBlock ? latestBlock - sourceBlock + 1n : 0n;
}

export interface TrustedSourceReceipt {
  status: 'success' | 'reverted';
  blockNumber: bigint;
  blockTimestamp: number;
  logs: readonly RawLog[];
}

export interface TrustedChainReader {
  getSourceReceipt(args: { chainId: number; txHash: Hex }): Promise<TrustedSourceReceipt | null>;
  getLatestBlockNumber(args: { chainId: number }): Promise<bigint>;
}

/** Facts reconstructed server-side; the browser never supplies them. */
export interface TrustedActivityFacts {
  actionType: Hex;
  token: Hex;
  destinationChainId: number;
  /** Source block timestamp (unix seconds). */
  occurredAt: number;
}

export interface TrustedVerificationDeps {
  reader: TrustedChainReader;
  /** Repository bound to the server-reconstructed facts. */
  createRepository: (facts: TrustedActivityFacts) => ActivityRepository;
  recoverTypedDataSigner?: (args: {
    payload: Parameters<typeof recoverTypedDataAddress>[0] extends never ? never : any;
    signature: Hex;
  }) => Promise<string>;
  now?: () => number;
}

export interface TrustedVerificationOptions {
  /** REQUIRED — there is deliberately no production default. */
  requiredConfirmations: number;
}

export class FinalityConfigError extends Error {}

export function assertRequiredConfirmations(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new FinalityConfigError('requiredConfirmations must be a positive integer');
  }
  return value;
}

export async function verifyAndPersistBridgeActivity(
  deps: TrustedVerificationDeps,
  handoff: ActivityIntentHandoff,
  options: TrustedVerificationOptions,
): Promise<VerificationOutcome> {
  const required = BigInt(assertRequiredConfirmations(options.requiredConfirmations));
  const sourceChainId = Number(handoff.intent.sourceChainId);

  let raw: TrustedSourceReceipt | null;
  try {
    raw = await deps.reader.getSourceReceipt({ chainId: sourceChainId, txHash: handoff.sourceTxHash });
  } catch (err) {
    return { status: 'PENDING', reason: err instanceof Error ? err.message : 'source receipt unavailable' };
  }
  if (!raw) return { status: 'PENDING', reason: 'no source transaction receipt yet' };

  let confirmations = 0n;
  try {
    const latest = await deps.reader.getLatestBlockNumber({ chainId: sourceChainId });
    confirmations = confirmationsFor(latest, raw.blockNumber);
  } catch (err) {
    return { status: 'PENDING', reason: err instanceof Error ? err.message : 'head block unavailable' };
  }
  const finalized = confirmations >= required;

  const receipt: SourceReceipt = {
    status: raw.status,
    blockTimestamp: raw.blockTimestamp,
    logs: raw.logs,
  };

  const facts: TrustedActivityFacts = {
    actionType: handoff.intent.actionType,
    token: handoff.intent.token.toLowerCase() as Hex,
    destinationChainId: Number(handoff.intent.destinationChainId),
    occurredAt: raw.blockTimestamp,
  };

  return await verifyBridgeActivity(
    {
      recoverTypedDataSigner:
        deps.recoverTypedDataSigner ??
        (async ({ payload, signature }) =>
          await recoverTypedDataAddress({ ...(payload as any), signature } as any)),
      getSourceReceipt: async () => receipt,
      isFinalized: async () => finalized,
      repository: deps.createRepository(facts),
      now: deps.now,
    },
    handoff,
  );
}

// ---------------------------------------------------------------------------
// Live implementations (testnet corridor only in this gate)
// ---------------------------------------------------------------------------

const chainFor = (chainId: number) =>
  chainId === OFFICIAL_CHAIN_IDS.botTestnet ? botTestnet : bscTestnet;

export function createViemChainReader(): TrustedChainReader {
  const client = (chainId: number) =>
    createPublicClient({ chain: chainFor(chainId), transport: http() });

  return {
    async getSourceReceipt({ chainId, txHash }) {
      const c = client(chainId);
      const receipt = await c.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (!receipt) return null;
      const block = await c.getBlock({ blockNumber: receipt.blockNumber });
      return {
        status: receipt.status === 'success' ? 'success' : 'reverted',
        blockNumber: receipt.blockNumber,
        blockTimestamp: Number(block.timestamp),
        logs: receipt.logs.map((l) => ({
          address: l.address,
          topics: l.topics as readonly Hex[],
          data: l.data as Hex,
          logIndex: Number(l.logIndex),
        })),
      };
    },
    async getLatestBlockNumber({ chainId }) {
      return await client(chainId).getBlockNumber();
    },
  };
}

/**
 * Repository backed by the Lovable Cloud backend. Reads use SELECT (allowed for
 * the service role); the ONLY write path is the atomic, replay-safe RPC.
 */
export function createBackendActivityRepository(
  facts: TrustedActivityFacts,
  clientLoader: () => Promise<{ from: any; rpc: any }> = async () =>
    (await import('@/integrations/supabase/client.server')).supabaseAdmin as any,
): ActivityRepository {
  const rowToActivity = (row: any): VerifiedActivity => ({
    activityId: row.activity_id as Hex,
    user: row.user_wallet as Hex,
    kind: row.kind,
    sourceChainId: row.source_chain_id,
    sourceTxHash: row.source_tx_hash as Hex,
    sourceLogIndex: row.source_log_index,
    amountRaw: BigInt(row.amount_raw),
    campaignId: row.campaign_id as Hex,
    intentHash: row.intent_hash as Hex,
    status: row.status,
    observedAt: Date.parse(row.observed_at),
  });

  return {
    async findByCanonicalKey(key) {
      const db = await clientLoader();
      const { data, error } = await db
        .from('verified_activities')
        .select('*')
        .eq('source_chain_id', key.chainId)
        .eq('source_tx_hash', key.txHash.toLowerCase())
        .eq('source_log_index', key.logIndex)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? rowToActivity(data) : null;
    },

    async isNonceUsed(user, nonce) {
      const db = await clientLoader();
      const { data, error } = await db
        .from('verified_activities')
        .select('activity_id')
        .eq('user_wallet', user.toLowerCase())
        .eq('intent_nonce', nonce.toString())
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },

    async insertWithNonce({ activity, user, nonce }) {
      const db = await clientLoader();
      const { data, error } = await db.rpc('admin_record_verified_activity', {
        p_activity_id: activity.activityId,
        p_user_wallet: user.toLowerCase(),
        p_kind: activity.kind,
        p_action_type: facts.actionType,
        p_token: facts.token,
        p_source_chain_id: activity.sourceChainId,
        p_destination_chain_id: facts.destinationChainId,
        p_source_tx_hash: activity.sourceTxHash.toLowerCase(),
        p_source_log_index: activity.sourceLogIndex,
        p_amount_raw: activity.amountRaw.toString(),
        p_campaign_id: activity.campaignId,
        p_intent_hash: activity.intentHash,
        p_intent_nonce: nonce.toString(),
        p_occurred_at: new Date(facts.occurredAt * 1000).toISOString(),
        p_observed_at: new Date(activity.observedAt).toISOString(),
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return { inserted: !!row?.inserted, activity };
    },
  };
}
