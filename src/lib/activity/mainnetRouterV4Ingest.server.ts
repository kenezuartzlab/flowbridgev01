/**
 * Server-only ingestion of a BOT Mainnet Router V4 swap into verified_activities
 * plus server-side USD valuation. No browser value is ever used.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import {
  MAINNET_CHAIN_ID,
  verifyMainnetRouterV4CoreSwap,
  type RouterV4CanonicalActivity,
} from './mainnetRouterV4Evidence';

const RPC = 'https://rpc.botchain.ai';
const NATIVE = '0x0000000000000000000000000000000000000000';

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

/** Server-side USD price for a Mainnet token address. null = unreliable. */
export async function mainnetTokenUsdPrice(token: string): Promise<{ price: number; decimals: number } | null> {
  const { MAINNET_CONTRACTS } = await import('@/lib/contracts');
  const t = token.toLowerCase();
  const wbot = String(MAINNET_CONTRACTS.wbot).toLowerCase();
  const priceAddr = t === NATIVE ? wbot : t;
  if (t === String(MAINNET_CONTRACTS.usdtBot).toLowerCase()) {
    const d = await tokenDecimals(t);
    return d == null ? null : { price: 1, decimals: d };
  }
  const decimals = t === NATIVE ? 18 : await tokenDecimals(t);
  if (decimals == null) return null;
  try {
    const res = await fetch(
      `https://dex-wallet.botchain.ai/api/v1/price?token=${priceAddr}&pool_type=all`,
    );
    const json = await res.json().catch(() => null);
    const price = Number(json?.data?.price);
    if (Number.isFinite(price) && price > 0) return { price, decimals };
  } catch {
    /* unreliable */
  }
  // No hardcoded fallback: unpriceable means PRICING_REVIEW, not an estimate.
  return null;
}

async function tokenDecimals(token: string): Promise<number | null> {
  const r = await rpc<string>('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  if (!r || r === '0x') return null;
  const d = Number(BigInt(r));
  return Number.isInteger(d) && d >= 0 && d <= 36 ? d : null;
}

export type MainnetV4IngestResult =
  | {
      status: 'VERIFIED';
      activity: RouterV4CanonicalActivity;
      verifiedUsd: number | null;
      valuationEvidence?: { source: string; priceUsd: number; decimals: number; amountRaw: string; fetchedAt: string };
    }
  | { status: 'NOT_FINAL' | 'REJECTED'; reason: string };

export async function ingestMainnetRouterV4Swap(
  txHash: string,
  wallet: string,
): Promise<MainnetV4IngestResult> {
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
  const result = verifyMainnetRouterV4CoreSwap(
    {
      chainId: MAINNET_CHAIN_ID,
      txHash,
      from: String(tx.from ?? ''),
      to: tx.to ?? null,
      status: String(receipt.status).toLowerCase() === '0x1' ? 'success' : 'reverted',
      blockNumber: Number(BigInt(receipt.blockNumber ?? '0x0')),
      headBlockNumber: Number(BigInt(head)),
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
      stage: 'v4_verified_activity', outcome,
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
  return { status: 'VERIFIED', activity: a, verifiedUsd, valuationEvidence: priced ? { source: 'EXISTING_SERVER_PRICE_POLICY', priceUsd: priced.price, decimals: priced.decimals, amountRaw: a.amountRaw.toString(), fetchedAt: new Date().toISOString() } : undefined };
}
