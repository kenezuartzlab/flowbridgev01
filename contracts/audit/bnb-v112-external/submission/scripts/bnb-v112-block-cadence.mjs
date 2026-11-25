// AF-04 read-only cadence sample: public block headers only (eth_blockNumber/eth_getBlockByNumber), single official operator.
import fs from 'node:fs';
const RPC = 'https://bsc-dataseed.bnbchain.org';
const rpc = async (method, params) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) })).json()).result;
const head = Number(BigInt(await rpc('eth_blockNumber', [])));
const ts = async (n) => Number(BigInt((await rpc('eth_getBlockByNumber', [`0x${n.toString(16)}`, false])).timestamp));
const samples = [];
for (const span of [100, 1000, 10000]) { const a = await ts(head - span), b = await ts(head); samples.push({ span, seconds: b - a, avgIntervalSec: (b - a) / span }); }
// Count blocks inside a 30-second window ending at head (seconds-resolution timestamps).
const tHead = await ts(head); let lo = head - 200, hi = head;
while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (tHead - (await ts(mid)) > 30) lo = mid + 1; else hi = mid; }
const out = { observedAt: new Date().toISOString(), rpc: RPC, independence: 'SINGLE_OPERATOR_NOT_QUORUM', head, samples, blocksWithinMaxQuoteAge30s: head - lo,
  maxBlockLag100Seconds: samples[1].avgIntervalSec * 100, bindingConstraint: samples[1].avgIntervalSec * 100 > 30 ? 'MAX_QUOTE_AGE (30s) binds first at observed cadence' : 'MAX_BLOCK_LAG binds first',
  flipCadenceSec: 0.3, note: 'If average interval falls below 0.3s, 100 blocks < 30s and MAX_BLOCK_LAG becomes the tighter bound. Timestamps are 1-second resolution.' };
fs.writeFileSync('docs/security/bnb-v112-review-evidence/block-cadence.json', JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out));
