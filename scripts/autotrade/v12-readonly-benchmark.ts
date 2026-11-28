// AutoTrade V1.2 read-only benchmark: samples the worker's exact observation path
// (primary RPC + explorer eth-rpc) and rechecks CaSwap depth. No writes, no signing.
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { observe } from "@/lib/autotrade/worker.server";
import { rpcConsensus } from "@/lib/autotrade/executor";
import { percentile } from "@/lib/autotrade/worker";
import { writeFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";
const P = "https://rpc.botchain.ai", E = "https://scan.botchain.ai/api/eth-rpc";
const N = Number(process.env.N ?? 150);
const rows: any[] = [];
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  try {
    const a = await observe(P, null);
    const b = await observe(E, null);
    const c = Math.min(a.head, b.head);
    const [aa, bb] = await Promise.all([observe(P, c), observe(E, c)]);
    const t1 = Date.now();
    rows.push({ i, lag: a.head - b.head, cycleMs: t1 - t0, blockAgeMs: t1 - a.blockTime,
      r3: rpcConsensus(aa, bb, t1, 3) ?? "OK", r10: rpcConsensus(aa, bb, t1, 10) ?? "OK", hashEq: aa.hashAtCommon === bb.hashAtCommon });
  } catch (e: any) { rows.push({ i, error: String(e.message).slice(0, 40), cycleMs: Date.now() - t0 }); }
  await new Promise((r) => setTimeout(r, 300));
}
const ok = rows.filter((r) => !r.error);
const q = (k: string) => ({ p50: percentile(ok.map((r) => r[k]), 50), p95: percentile(ok.map((r) => r[k]), 95), p99: percentile(ok.map((r) => r[k]), 99), max: Math.max(...ok.map((r) => r[k])) });
const tally = (k: string) => ok.reduce((m: any, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
const lagAbs = ok.map((r) => Math.abs(r.lag));
// CaSwap depth recheck
const pc = createPublicClient({ transport: http(P) });
const V2 = parseAbi(["function factory() view returns (address)", "function getPair(address,address) view returns (address)", "function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"]);
const fac = await pc.readContract({ address: M.caSwapRouter as any, abi: V2, functionName: "factory" });
const pair = await pc.readContract({ address: fac, abi: V2, functionName: "getPair", args: [M.caToken as any, M.caWbot as any] });
const usdtPair = await pc.readContract({ address: fac, abi: V2, functionName: "getPair", args: [M.caWbot as any, (M as any).usdt as any] }).catch(() => "ERR");
const [r0, r1] = await pc.readContract({ address: pair, abi: V2, functionName: "getReserves" });
const t0 = await pc.readContract({ address: pair, abi: V2, functionName: "token0" });
const blk = await pc.getBlock();
const out = { generatedAt: new Date().toISOString(), samples: N, ok: ok.length, errors: rows.length - ok.length,
  dns: { primary: await resolve4("rpc.botchain.ai").catch(() => []), explorer: await resolve4("scan.botchain.ai").catch(() => []) },
  cycleMs: q("cycleMs"), blockAgeMs: q("blockAgeMs"), headLag: { p50: percentile(lagAbs, 50), p95: percentile(lagAbs, 95), p99: percentile(lagAbs, 99), max: Math.max(...lagAbs) },
  hashEqualAtCommon: ok.filter((r) => r.hashEq).length, consensusMaxLag3: tally("r3"), consensusMaxLag10: tally("r10"),
  caswap: { block: Number(blk.number), blockHash: blk.hash, factory: fac, caWbotPair: pair, token0: getAddress(t0), reserve0: r0.toString(), reserve1: r1.toString(), caWbotUsdtPair: usdtPair },
  rows };
writeFileSync("docs/security/autotrade-v1_2/readonly_benchmark.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
