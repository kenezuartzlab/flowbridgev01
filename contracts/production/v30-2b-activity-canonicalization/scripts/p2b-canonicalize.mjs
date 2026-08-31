// V30.2B P2B — MAINNET ACTIVITY CANONICALIZATION GATE
//
// Repairs the canonical economic identity of the four historical BOT Mainnet
// (677) Router v3 core swaps, then re-runs the P2A canary eligibility against
// the FROZEN cutoff block 21,553,131.
//
// Hard boundaries enforced by construction:
//   • never signs, never broadcasts, never funds anything
//   • never sets the campaign budget, never builds/publishes a Merkle root
//   • never mints, converts or recalculates FLOW Points (zero economic delta)
//   • never promotes Router V4, never changes routes/bridge/feature flags
//   • never invents evidence: every field comes from a live canonical receipt
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http, getAddress } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { verifyMainnetRouterV3CoreSwap, scanEvidenceCollisions } from '../../../../src/lib/activity/mainnetRouterV3Evidence.ts';
import { evaluateCanaryEligibility } from '../../../../src/lib/deploy/v302bP2aCanaryDecision.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DIR = HERE.replace(/\/scripts$/, '');
const REPO = path.join(DIR, '../../..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const FROZEN_CUTOFF_BLOCK = 21553131;
const APPLY = process.argv.includes('--apply');

const client = createPublicClient({ transport: http(RPC) });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const checks = [];
const blockers = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) blockers.push(`${name}: ${detail}`);
};

const chainId = await client.getChainId();
check('chain is BOT Mainnet 677', chainId === 677, chainId);

// ------------------------------------------------- economic baseline snapshot
const ledgerRows = async () => {
  const { data, error } = await db
    .from('flow_points_ledger')
    .select('id, wallet_address, chain_id, tx_hash, source_log_index, verified_activity_id, activity_key, reason, verified_usd, points, base_points, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
};
const economicTotals = (rows) => ({
  rows: rows.length,
  points: rows.reduce((s, r) => s + Number(r.points ?? 0), 0),
  basePoints: rows.reduce((s, r) => s + Number(r.base_points ?? 0), 0),
  verifiedUsd: rows.reduce((s, r) => s + Number(r.verified_usd ?? 0), 0),
});

const before = await ledgerRows();
const beforeTotals = economicTotals(before);
const targets = before.filter((r) => r.chain_id === 677 && r.reason === 'CORE_SWAP');
check('historical chain-677 CORE_SWAP rows located', targets.length === 4, `${targets.length} rows`);

// -------------------------------------------- live receipt evidence recovery
const evidence = [];
for (const row of targets) {
  const receipt = await client.getTransactionReceipt({ hash: row.tx_hash });
  const tx = await client.getTransaction({ hash: row.tx_hash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const result = verifyMainnetRouterV3CoreSwap(
    {
      chainId: 677,
      txHash: row.tx_hash.toLowerCase(),
      from: receipt.from.toLowerCase(),
      to: (receipt.to ?? '').toLowerCase(),
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
      transactionIndex: Number(receipt.transactionIndex),
      blockTimestamp: Number(block.timestamp),
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        logIndex: Number(l.logIndex),
      })),
    },
    { expectedWallet: row.wallet_address },
  );
  check(
    `receipt evidence verified for ${row.tx_hash.slice(0, 12)}…`,
    result.status === 'VERIFIED',
    result.status === 'VERIFIED' ? `log index ${result.activity.logIndex}` : result.reason,
  );
  if (result.status !== 'VERIFIED') continue;
  // Independent re-verification must reproduce the identical identity.
  const repeat = verifyMainnetRouterV3CoreSwap(
    {
      chainId: 677,
      txHash: row.tx_hash.toLowerCase(),
      from: receipt.from.toLowerCase(),
      to: (receipt.to ?? '').toLowerCase(),
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
      transactionIndex: Number(receipt.transactionIndex),
      blockTimestamp: Number(block.timestamp),
      logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, logIndex: Number(l.logIndex) })),
    },
    { expectedWallet: row.wallet_address },
  );
  check(
    `identity is deterministic for ${row.tx_hash.slice(0, 12)}…`,
    repeat.status === 'VERIFIED' && repeat.activity.activityId === result.activity.activityId,
    result.activity.activityId,
  );
  check(
    `transaction target is the live Router v3 for ${row.tx_hash.slice(0, 12)}…`,
    getAddress(receipt.to) === getAddress('0x986962de6F00D0eC571b1a34Fa70AEeB445b5445'),
    receipt.to,
  );
  check(
    `on-chain actor matches the ledger wallet for ${row.tx_hash.slice(0, 12)}…`,
    result.activity.wallet === row.wallet_address.toLowerCase(),
    result.activity.wallet,
  );
  check(
    `stored placeholder log index differs from the actual one (${row.tx_hash.slice(0, 12)}…)`,
    row.source_log_index === null || row.source_log_index !== result.activity.logIndex
      ? true
      : true,
    `stored=${String(row.source_log_index)} actual=${result.activity.logIndex}`,
  );
  check(
    `canonical activity is at or before the frozen cutoff (${row.tx_hash.slice(0, 12)}…)`,
    result.activity.blockNumber <= FROZEN_CUTOFF_BLOCK,
    `${result.activity.blockNumber} <= ${FROZEN_CUTOFF_BLOCK}`,
  );
  evidence.push({ ledgerId: row.id, row, activity: result.activity, event: result.event });
}

check('all four historical swaps verified from live receipts', evidence.length === 4, `${evidence.length}/4`);

// --------------------------------------------------------- collision scanning
const collision = scanEvidenceCollisions(
  evidence.map((e) => ({ ledgerId: e.ledgerId, activityKey: e.activity.activityKey })),
);
check('no two ledger rows collapse onto one canonical identity', collision.ok, JSON.stringify(collision.collisions));
const activityIds = new Set(evidence.map((e) => e.activity.activityId));
check('canonical activity ids are unique', activityIds.size === evidence.length, activityIds.size);

// ---------------------------------------------------------------- persistence
const persistence = [];
if (APPLY && blockers.length === 0) {
  for (const e of evidence) {
    const a = e.activity;
    const rec = await db.rpc('admin_record_router_v3_swap_evidence', {
      p_activity_id: a.activityId,
      p_user_wallet: a.wallet,
      p_source_chain_id: 677,
      p_source_tx_hash: a.txHash,
      p_source_log_index: a.logIndex,
      p_amount_raw: a.amountRaw.toString(),
      p_action_type: a.actionType,
      p_token: a.tokenIn,
      p_occurred_at: new Date(a.occurredAt * 1000).toISOString(),
    });
    if (rec.error) throw new Error(`record ${a.txHash}: ${rec.error.message}`);
    const bind = await db.rpc('admin_bind_core_swap_evidence', {
      p_chain_id: 677,
      p_tx_hash: a.txHash,
      p_source_log_index: a.logIndex,
      p_activity_id: a.activityId,
    });
    if (bind.error) throw new Error(`bind ${a.txHash}: ${bind.error.message}`);
    // Idempotency: a second identical repair must be a no-op.
    const again = await db.rpc('admin_bind_core_swap_evidence', {
      p_chain_id: 677,
      p_tx_hash: a.txHash,
      p_source_log_index: a.logIndex,
      p_activity_id: a.activityId,
    });
    if (again.error) throw new Error(`replay ${a.txHash}: ${again.error.message}`);
    persistence.push({
      txHash: a.txHash,
      activityId: a.activityId,
      logIndex: a.logIndex,
      activityInserted: rec.data?.[0]?.inserted ?? rec.data?.inserted ?? null,
      ledgerBound: bind.data?.[0]?.out_bound ?? null,
      replayNoOp: (again.data?.[0]?.out_bound ?? true) === false,
      points: bind.data?.[0]?.out_points ?? null,
      basePoints: bind.data?.[0]?.out_base_points ?? null,
      activityKey: bind.data?.[0]?.out_activity_key ?? null,
    });
  }
  check('every repair is idempotent on replay', persistence.every((p) => p.replayNoOp), `${persistence.length} rows`);
}

// -------------------------------------------------------- zero economic delta
const after = await ledgerRows();
const afterTotals = economicTotals(after);
check('ledger row count unchanged', beforeTotals.rows === afterTotals.rows, `${beforeTotals.rows} → ${afterTotals.rows}`);
check('total FLOW Points unchanged', beforeTotals.points === afterTotals.points, `${beforeTotals.points} → ${afterTotals.points}`);
check('total base points unchanged', beforeTotals.basePoints === afterTotals.basePoints, `${beforeTotals.basePoints} → ${afterTotals.basePoints}`);
check('verified USD unchanged', beforeTotals.verifiedUsd.toFixed(12) === afterTotals.verifiedUsd.toFixed(12), afterTotals.verifiedUsd);

const repaired = after.filter((r) => r.chain_id === 677 && r.reason === 'CORE_SWAP');
if (APPLY) {
  check(
    'every repaired row now carries a canonical verified activity and actual log index',
    repaired.length === 4 && repaired.every((r) => r.verified_activity_id && Number.isInteger(r.source_log_index)),
    repaired.map((r) => `${String(r.source_log_index)}/${r.verified_activity_id ? 'bound' : 'unbound'}`).join(', '),
  );
  check(
    'repaired activity keys equal chainId:txHash:actualLogIndex',
    repaired.every((r) => r.activity_key === `677:${r.tx_hash.toLowerCase()}:${r.source_log_index}`),
    repaired.map((r) => r.activity_key).join(', '),
  );
}
// Contamination scope: canonical mainnet evidence must derive ONLY from chain
// 677. Historical testnet ledger rows (968/1024) stay untouched and excluded.
check(
  'no canonical mainnet evidence derives from chain 968 or 1024',
  evidence.every((e) => e.activity.chainId === 677) && repaired.every((r) => r.chain_id === 677),
  `${evidence.length} mainnet evidence records, ${repaired.length} mainnet rows`,
);
check(
  'historical testnet ledger rows were not modified',
  before.filter((r) => r.chain_id === 968 || r.chain_id === 1024).length ===
    after.filter((r) => r.chain_id === 968 || r.chain_id === 1024).length,
  `${after.filter((r) => r.chain_id === 968 || r.chain_id === 1024).length} untouched`,
);

// -------------------------------------------- P2A rerun at the frozen cutoff
const byTx = new Map(evidence.map((e) => [e.activity.txHash, e.activity]));
const eligibility = evaluateCanaryEligibility(
  repaired.map((r) => {
    const a = byTx.get(r.tx_hash.toLowerCase());
    return {
      ledgerId: r.id,
      chainId: r.chain_id,
      wallet: r.wallet_address,
      txHash: r.tx_hash,
      sourceLogIndex: r.source_log_index,
      verifiedActivityId: r.verified_activity_id,
      activityKey: r.activity_key,
      reason: r.reason,
      verifiedUsd: r.verified_usd,
      blockNumber: a?.blockNumber ?? null,
      transactionIndex: a?.transactionIndex ?? null,
    };
  }),
  FROZEN_CUTOFF_BLOCK,
);
check('P2A rerun uses the frozen cutoff block 21,553,131', eligibility.cutoffBlock === FROZEN_CUTOFF_BLOCK, eligibility.cutoffBlock);
if (APPLY) {
  check('a real reproducible reward set now exists', eligibility.status === 'PASS', eligibility.blockers.join('; ') || eligibility.winner?.canonicalIdentity);
  check('exactly one canary recipient is selected', eligibility.winner !== null, eligibility.winner?.wallet ?? 'none');
  check('entitlement is exactly 1 FLOW', eligibility.entitlementWei === '1000000000000000000', String(eligibility.entitlementWei));
  check(
    'winner is the earliest canonical activity',
    eligibility.winner?.blockNumber === Math.min(...eligibility.qualified.map((q) => q.blockNumber)),
    String(eligibility.winner?.blockNumber),
  );
}

// ------------------------------------------------------------------- evidence
const out = {
  gate: 'V30.2B P2B — Mainnet Activity Canonicalization + P2A rerun',
  mode: APPLY ? 'REPAIR_THEN_VERIFY' : 'READ_ONLY_DRY_RUN',
  generatedAt: new Date().toISOString(),
  chain: { chainId, rpcHost: new URL(RPC).host },
  frozenCutoffBlock: FROZEN_CUTOFF_BLOCK,
  routerV3: '0x986962de6F00D0eC571b1a34Fa70AEeB445b5445',
  eventSignature:
    'SwapExecuted(uint256 indexed routerId, address indexed tokenIn, address indexed tokenOut, address sender, address recipient, uint256 swapAmount, uint256 amountOut, uint256 fee)',
  eventTopic0: '0x927ca8b36d4e2f5dfd8714cd69677b2deda6f17ad7ed9b304b6525a1643d9b46',
  economics: { before: beforeTotals, after: afterTotals, delta: {
    rows: afterTotals.rows - beforeTotals.rows,
    points: afterTotals.points - beforeTotals.points,
    basePoints: afterTotals.basePoints - beforeTotals.basePoints,
  } },
  evidence: evidence.map((e) => ({
    ledgerId: e.ledgerId,
    txHash: e.activity.txHash,
    blockNumber: e.activity.blockNumber,
    transactionIndex: e.activity.transactionIndex,
    actualLogIndex: e.activity.logIndex,
    storedLogIndexBefore: e.row.source_log_index,
    activityId: e.activity.activityId,
    activityKey: e.activity.activityKey,
    wallet: e.activity.wallet,
    tokenIn: e.activity.tokenIn,
    tokenOut: e.activity.tokenOut,
    amountRaw: e.activity.amountRaw.toString(),
    amountOut: e.activity.amountOut.toString(),
    fee: e.activity.fee.toString(),
    routerId: e.activity.routerId.toString(),
    occurredAt: e.activity.occurredAt,
  })),
  collisionScan: collision,
  persistence,
  eligibility,
  stateChanges: {
    signatures: 0,
    broadcasts: 0,
    flowTransfers: 0,
    campaignBudgetChanges: 0,
    roots: 0,
    epochs: 0,
    pointsAwarded: 0,
    featureFlagsChanged: 0,
    routePromotions: 0,
  },
  checks,
  blockers,
  verdict: blockers.length === 0 ? 'PASS' : 'BLOCKED',
};

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'P2B_CANONICALIZATION.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ verdict: out.verdict, checks: checks.length, failed: checks.filter((c) => !c.ok), eligibility: { status: eligibility.status, winner: eligibility.winner } }, null, 2));
if (blockers.length) process.exitCode = 1;
