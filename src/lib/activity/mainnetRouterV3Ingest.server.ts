/**
 * Server-only ingestion of a BOT Mainnet Router V3 swap into verified_activities
 * plus server-side USD valuation. Mirrors the Router V4 ingest path so the
 * still-live legacy router earns FLOW Points under the same rules. No browser
 * value is ever used.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import {
  BOT_MAINNET_CHAIN_ID,
  verifyMainnetRouterV3CoreSwap,
  type RouterV3CanonicalActivity,
} from './mainnetRouterV3Evidence';
import { mainnetTokenUsdPrice } from './mainnetRouterV4Ingest.server';

const RPC = 'https://rpc.botchain.ai';

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json().catch(() => null);
    return (j?.result ?? null) as T | null;
  } catch {
    return null;
  }
}

export type MainnetV3IngestResult =
  | {
      status: 'VERIFIED';
      activity: RouterV3CanonicalActivity;
      verifiedUsd: number | null;
      valuationEvidence?: { authority: string; source: string; priceUsd: number; decimals: number; amountRaw: string; observedAt: string };
    }
  | { status: 'NOT_FINAL' | 'REJECTED'; reason: string };

export async function ingestMainnetRouterV3Swap(
  txHash: string,
  wallet: string,
): Promise<MainnetV3IngestResult> {
  const chain = await rpc<string>("eth_chainId", []);
  if (chain !== "0x2a5") return { status: "NOT_FINAL", reason: "Mainnet RPC identity unavailable" };
  const [receipt, tx] = await Promise.all([
    rpc<any>('eth_getTransactionReceipt', [txHash]),
    rpc<any>('eth_getTransactionByHash', [txHash]),
  ]);
  if (!receipt || !tx) return { status: 'NOT_FINAL', reason: 'receipt unavailable' };
  // Wait (bounded) for finality depth so a just-confirmed swap is not missed.
  const mined = Number(BigInt(receipt.blockNumber ?? '0x0'));
  let head: string | null = null;
  for (let i = 0; i < 10; i++) {
    head = await rpc<string>('eth_blockNumber', []);
    if (head && Number(BigInt(head)) - mined + 1 >= 3) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!head || Number(BigInt(head)) - mined + 1 < 3) return { status: 'NOT_FINAL', reason: 'insufficient confirmations' };
  const block = await rpc<any>('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!block?.hash || block.hash.toLowerCase() !== String(receipt.blockHash).toLowerCase() || !block.timestamp) return { status: "NOT_FINAL", reason: "canonical block unavailable" };
  const result = verifyMainnetRouterV3CoreSwap(
    {
      chainId: BOT_MAINNET_CHAIN_ID,
      txHash,
      from: String(tx.from ?? ''),
      to: tx.to ?? null,
      status: String(receipt.status).toLowerCase() === '0x1' ? 'success' : 'reverted',
      blockNumber: Number(BigInt(receipt.blockNumber ?? '0x0')),
      transactionIndex: Number(BigInt(receipt.transactionIndex ?? '0x0')),
      blockTimestamp: block?.timestamp ? Number(BigInt(block.timestamp)) : 0,
      logs: (receipt.logs ?? []).map((l: any) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: Number(BigInt(l.logIndex)),
      })),
    },
    { expectedWallet: wallet },
  );
  if (result.status !== 'VERIFIED') return result;
  const a = result.activity;

  const occurred = new Date(a.occurredAt * 1000);
  const { error: vaError } = await supabaseAdmin.from('verified_activities').upsert(
    {
      activity_id: a.activityId,
      user_wallet: a.wallet,
      kind: 'SWAP_EXECUTED',
      source_chain_id: a.chainId,
      source_tx_hash: a.txHash,
      source_log_index: a.logIndex,
      amount_raw: a.amountRaw.toString(),
      campaign_id: '0x' + '0'.repeat(64),
      status: 'CONFIRMED',
      action_type: a.actionType,
      destination_chain_id: a.chainId,
      token: a.tokenIn,
      occurred_at: occurred.toISOString(),
      observed_at: new Date().toISOString(),
      evidence_source: a.evidenceSource,
    } as never,
    { onConflict: 'activity_id', ignoreDuplicates: true },
  );
  if (vaError) {
    const { classifyPersistenceError } = await import('@/lib/rewards/rewardDiagnostics');
    const { recordRewardDiagnostic } = await import('@/lib/rewards/rewardDiagnostics.server');
    const outcome = classifyPersistenceError(vaError) ?? 'PERSISTENCE_REJECTED';
    await recordRewardDiagnostic({
      stage: 'v3_verified_activity', outcome,
      chainId: a.chainId, txHash: a.txHash, detail: vaError.message,
    });
    // A canonical record that cannot be persisted must never be priced or credited.
    if (outcome !== 'DUPLICATE') throw new Error(`verified activity write failed: ${outcome}`);
  }

  const priced = await mainnetTokenUsdPrice(a.tokenIn);
  const verifiedUsd = priced
    ? (Number(a.amountRaw) / 10 ** priced.decimals) * priced.price
    : null;
  const canonical = await rpc<any>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  if (!canonical?.hash || canonical.hash.toLowerCase() !== block.hash.toLowerCase()) return { status: "NOT_FINAL", reason: "chain reorganized" };
  return { status: 'VERIFIED', activity: a, verifiedUsd, valuationEvidence: priced ? { authority: 'SERVER_CANONICAL_INGEST_V1', source: a.tokenIn.toLowerCase() === String((await import('@/lib/contracts')).MAINNET_CONTRACTS.usdtBot).toLowerCase() ? 'APPROVED_USDT_PARITY' : 'BOT_DEX_PRICE', priceUsd: priced.price, decimals: priced.decimals, amountRaw: a.amountRaw.toString(), observedAt: new Date().toISOString() } : undefined };
}
