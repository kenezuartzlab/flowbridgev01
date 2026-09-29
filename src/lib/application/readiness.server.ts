// PRIVATE, read-only Scheme A readiness computed from canonical BOT Mainnet
// records. No writes, no synthetic data. Raw swap ledger is returned
// separately from the rule-filtered reporting view.
import { createPublicClient, http, parseAbi, parseAbiItem, formatUnits, type Address } from "viem";
import { CONTRACT_REGISTRY, SCHEME_A_RULES } from "./applicationProfile";

const RPC = "https://rpc.botchain.ai";
const POOL = "0xdacfc2574b6110892351bd31afb36f95e7206162" as Address;
const POOL_CREATION_BLOCK = 23854178n;
const SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);
const MINT = parseAbiItem("event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)");
const BURN = parseAbiItem("event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)");
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
]);
const ercAbi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"]);

const DAY = 86_400;

async function getLogsChunked(c: any, params: any, from: bigint, to: bigint) {
  try {
    return await c.getLogs({ ...params, fromBlock: from, toBlock: to });
  } catch {
    const out: any[] = [];
    const step = 200_000n;
    for (let s = from; s <= to; s += step) {
      const e = s + step - 1n > to ? to : s + step - 1n;
      out.push(...(await c.getLogs({ ...params, fromBlock: s, toBlock: e })));
    }
    return out;
  }
}

export async function computeReadiness() {
  const c = createPublicClient({ transport: http(RPC) });
  const latest = await c.getBlock();
  const now = Number(latest.timestamp);
  const [t0, t1, slot0] = await Promise.all([
    c.readContract({ address: POOL, abi: poolAbi, functionName: "token0" }),
    c.readContract({ address: POOL, abi: poolAbi, functionName: "token1" }),
    c.readContract({ address: POOL, abi: poolAbi, functionName: "slot0" }),
  ]);
  const meta = async (a: Address) => {
    const [symbol, decimals, bal] = await Promise.all([
      c.readContract({ address: a, abi: ercAbi, functionName: "symbol" }),
      c.readContract({ address: a, abi: ercAbi, functionName: "decimals" }),
      c.readContract({ address: a, abi: ercAbi, functionName: "balanceOf", args: [POOL] }),
    ]);
    return { address: a, symbol, decimals: Number(decimals), balance: Number(formatUnits(bal, Number(decimals))) };
  };
  const [m0, m1] = await Promise.all([meta(t0), meta(t1)]);
  const usdtIs0 = /usdt/i.test(m0.symbol);
  const usdt = usdtIs0 ? m0 : m1;
  const flow = usdtIs0 ? m1 : m0;
  // price token1 per token0, decimal-adjusted
  const sqrt = Number(slot0[0]) / 2 ** 96;
  const p1per0 = sqrt * sqrt * 10 ** (m0.decimals - m1.decimals);
  const usdtPerFlow = usdtIs0 ? 1 / p1per0 : p1per0;
  const lpValueUsd = usdt.balance + flow.balance * usdtPerFlow;

  // 15-day window: estimate start block from average block time over the last ~1M blocks.
  const ref = await c.getBlock({ blockNumber: latest.number - 100_000n });
  const secPerBlock = (now - Number(ref.timestamp)) / 100_000;
  const blocks15d = BigInt(Math.ceil((15 * DAY) / Math.max(secPerBlock, 0.1)));
  let from15 = latest.number - blocks15d;
  if (from15 < POOL_CREATION_BLOCK) from15 = POOL_CREATION_BLOCK;

  const swapLogs = await getLogsChunked(c, { address: POOL, event: SWAP }, from15, latest.number);
  const lpLogs7dFrom = latest.number - BigInt(Math.ceil((7 * DAY) / Math.max(secPerBlock, 0.1)));
  const [mints7, burns7] = await Promise.all([
    getLogsChunked(c, { address: POOL, event: MINT }, lpLogs7dFrom, latest.number),
    getLogsChunked(c, { address: POOL, event: BURN }, lpLogs7dFrom, latest.number),
  ]);

  const blockTs = new Map<bigint, number>();
  const raw: { tx: string; block: string; time: string; trader: string; volumeUsd: number }[] = [];
  for (const l of swapLogs.slice(0, 2000)) {
    if (!blockTs.has(l.blockNumber)) blockTs.set(l.blockNumber, Number((await c.getBlock({ blockNumber: l.blockNumber })).timestamp));
    const tx = await c.getTransaction({ hash: l.transactionHash });
    const a = usdtIs0 ? l.args.amount0 : l.args.amount1;
    const vol = Math.abs(Number(formatUnits(a < 0n ? -a : a, usdt.decimals)));
    raw.push({ tx: l.transactionHash, block: l.blockNumber.toString(), time: new Date(blockTs.get(l.blockNumber)! * 1000).toISOString(), trader: tx.from.toLowerCase(), volumeUsd: vol });
  }

  // Reporting view: first swap per address per UTC day, then 40% daily cap flag.
  const seen = new Set<string>();
  const counted: typeof raw = [];
  for (const r of raw) {
    const k = `${r.trader}:${r.time.slice(0, 10)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    counted.push(r);
  }
  const byDay = new Map<string, Map<string, number>>();
  for (const r of counted) {
    const d = r.time.slice(0, 10);
    const m = byDay.get(d) ?? new Map();
    m.set(r.trader, (m.get(r.trader) ?? 0) + r.volumeUsd);
    byDay.set(d, m);
  }
  let eligibleVolume = 0;
  let maxDailyShare = 0;
  const concentrationFlags: string[] = [];
  for (const [d, m] of byDay) {
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    for (const [w, v] of m) {
      const share = total > 0 ? v / total : 0;
      maxDailyShare = Math.max(maxDailyShare, share);
      if (share > 0.4 && m.size > 1) concentrationFlags.push(`${d} ${w.slice(0, 8)}… ${(share * 100).toFixed(1)}%`);
    }
    eligibleVolume += total;
  }

  const tier1 = SCHEME_A_RULES.tiers[0];
  const lpChangedIn7d = mints7.length + burns7.length > 0;
  const rows = [
    {
      metric: "Minimum LP value (7 consecutive days)",
      current: lpValueUsd,
      required: tier1.minLpUsd,
      unit: "USD",
      note: lpChangedIn7d
        ? `Current value shown; ${mints7.length} mint / ${burns7.length} burn in last 7 days, so the 7-day minimum may be lower.`
        : "No mint/burn in the last 7 days; value moves only with price.",
    },
    { metric: "Eligible trading volume (15 days)", current: eligibleVolume, required: tier1.volume15dUsd, unit: "USD", note: "First swap per wallet per UTC day; USDT leg." },
    { metric: "Eligible transactions (15 days)", current: counted.length, required: tier1.txCount, unit: "tx", note: `${raw.length} raw swaps in window.` },
  ].map((r) => ({ ...r, eligible: r.current >= r.required }));

  const codeChecks = await Promise.all(
    CONTRACT_REGISTRY.filter((x) => x.chainId === 677).map(async (x) => {
      const code = await c.getCode({ address: x.address.toLowerCase() as Address }).catch(() => undefined);
      return { ...x, hasCode: !!code && code !== "0x", explorer: `https://scan.botchain.ai/address/${x.address}` };
    }),
  );

  return {
    generatedAt: new Date(now * 1000).toISOString(),
    block: latest.number.toString(),
    rules: SCHEME_A_RULES,
    pool: {
      address: POOL,
      feeTier: 10000,
      flow: { symbol: flow.symbol, address: flow.address, inPool: flow.balance },
      usdt: { symbol: usdt.symbol, address: usdt.address, inPool: usdt.balance },
      usdtPerFlow,
      lpValueUsd,
    },
    window: { fromBlock: from15.toString(), toBlock: latest.number.toString(), days: 15 },
    tier1: rows,
    overall: rows.every((r) => r.eligible) && concentrationFlags.length === 0 ? "ELIGIBLE" : "NOT YET ELIGIBLE",
    uniqueWallets: new Set(raw.map((r) => r.trader)).size,
    maxDailyShare,
    concentrationFlags,
    rawLedger: raw,
    reportingView: counted,
    contracts: codeChecks,
  };
}
