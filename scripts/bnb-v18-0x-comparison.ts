// V1.8 comparison: Pancake rows from the committed V1.7 read-only evidence; 0x via server transport (KEY_MISSING if absent).
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchZeroExPrice } from '../src/lib/bnb/zeroExPrice.server';
const ev = JSON.parse(readFileSync('docs/security/BNB_SWAP_V1_7_ECONOMICS_EVIDENCE_20261117.json', 'utf8'));
const rows = (Array.isArray(ev) ? ev : ev.rows ?? ev.pancake ?? []).filter((r: any) => r.sizeUsdtEq);
const keyPresent = Boolean(process.env['ZEROX_API_KEY']);
const out: any[] = [];
for (const r of rows) {
  const direction = r.dir === 'BNB->USDT' ? 'WBNB->USDT' : 'USDT->WBNB';
  const sellAmount = BigInt(Math.round(Number(r.amountIn) * 1e6)) * 10n ** 12n;
  const zx = await fetchZeroExPrice({ direction, sellAmount: sellAmount.toString() }, { caller: 'v18-script' });
  out.push({ dir: r.dir, sizeUsd: r.sizeUsdtEq, pancakeFee: r.poolFee, pancakeGross: r.grossOut, pancakeDirectNet: r.variants?.[0]?.net, zeroEx: zx.status === 'KEY_MISSING' ? 'BLOCKED_NO_CREDENTIALS' : zx });
}
writeFileSync('docs/security/BNB_SWAP_V1_8_0X_COMPARISON_20261118.json', JSON.stringify({ generatedAt: new Date().toISOString(), zeroExKeyPresent: keyPresent, pancakeSource: 'V1.7 evidence block 134115821', rows: out }, null, 2));
console.log(keyPresent, out.length, out.map((o) => `${o.dir} $${o.sizeUsd} fee${o.pancakeFee} net=${o.pancakeDirectNet} 0x=${typeof o.zeroEx === 'string' ? o.zeroEx : o.zeroEx.status}`).join('\n'));
