import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import { getVenue, type LiquidityVenueId, type V2Venue, type V3Venue } from "@/lib/liquidity/venues";
import { enabledFeeTiers, readV2Pair, readV3Pool, readBalance, v2Wiring } from "@/lib/liquidity/chainReads";
import { validateCreatePool, reciprocalPrices } from "@/lib/liquidity/createPool";
import { deadlineFrom } from "@/lib/liquidity/v2Math";
import { NPM_ABI, V2_ROUTER_ABI } from "@/lib/liquidity/abis";
import { checkTokenForLiquidity } from "@/lib/liquidity/tokenSafety";
import { isNative, liquidityTokens } from "@/lib/liquidity/liquidityTokens";
import { AmountInput, fmt, Notice, ReviewModal, safeParse, Segmented, TokenSelect, TxProgress } from "./shared";
import { useLiquidityTx, type ApprovalNeed, type LiquidityOp } from "./useLiquidityTx";

export function CreatePoolPanel({ chainId, writable, explorer }: { chainId: number; writable: boolean; explorer: string }) {
  const { address } = useAccount();
  const tokens = useMemo(() => liquidityTokens(chainId), [chainId]);
  const [venueId, setVenueId] = useState<LiquidityVenueId>("bdex-v3");
  const venue = useMemo(() => {
    const resolved = getVenue(chainId, venueId);
    if (!resolved) throw new Error("Liquidity isn't available on this network.");
    return resolved;
  }, [chainId, venueId]);
  const list = venue.kind === "v3" ? tokens.filter((t) => !isNative(t)) : tokens;
  const [a, setA] = useState(""), [b, setB] = useState("");
  const [tiers, setTiers] = useState<number[]>([]);
  const [fee, setFee] = useState(3000);
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  const [price, setPrice] = useState("");
  const [ack, setAck] = useState(false);
  const [amtA, setAmtA] = useState("");
  const [review, setReview] = useState(false);
  const tx = useLiquidityTx();
  const venueClosed = !(p_caps(venue));
  const tA = list.find((t) => t.address === a), tB = list.find((t) => t.address === b);

  useEffect(() => { if (venue.kind === "v3") enabledFeeTiers(venue).then((t) => setTiers(t.map((x) => x.fee))).catch(() => setTiers([])); }, [venueId, chainId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAck(false); }, [price, a, b, fee, venueId]);
  useEffect(() => {
    setExisting(undefined);
    if (!tA || !tB) return;
    (async () => {
      if (venue.kind === "v3") setExisting((await readV3Pool(venue, tA.address as Address, tB.address as Address, fee)).pool);
      else {
        const { wrapped } = await v2Wiring(venue);
        const p = await readV2Pair(venue, (isNative(tA) ? wrapped : tA.address) as Address, (isNative(tB) ? wrapped : tB.address) as Address);
        setExisting(p && p.reserve0 > 0n ? p.pair : null);
      }
    })().catch(() => setExisting(undefined));
  }, [tA, tB, venue, fee, tx.steps.length]);

  let recip: { aInB: number; bInA: number } | null = null;
  try { recip = price ? reciprocalPrices(price) : null; } catch { recip = null; }

  const prepared = useMemo((): { op: LiquidityOp; rows: [string, string][] } | { error: string } | null => {
    if (!tA || !tB || existing === undefined) return null;
    for (const t of [tA, tB]) { const s = checkTokenForLiquidity(t, new Set()); if (!s.ok) return { error: s.reason }; }
    const chk = validateCreatePool({ version: venue.kind, tokenA: { address: isNative(tA) ? "0x0000000000000000000000000000000000000001" : tA.address, decimals: tA.decimals, symbol: tA.symbol }, tokenB: { address: isNative(tB) ? "0x0000000000000000000000000000000000000001" : tB.address, decimals: tB.decimals, symbol: tB.symbol }, feeTier: venue.kind === "v3" ? fee : undefined, enabledFeeTiers: tiers, existingPool: existing, priceAinB: price, priceConfirmed: ack });
    if (!chk.ok) return { error: chk.reason };
    if (!address) return { error: "Connect a wallet" };
    if (venue.kind === "v3") {
      const v = venue as V3Venue;
      return {
        op: { kind: "create-pool", chainId, dex: "BDEX V3", pair: `${tA.symbol}/${tB.symbol}`, amounts: [`1 ${tA.symbol} = ${price} ${tB.symbol}`], approvals: [],
          call: { address: v.positionManager, abi: NPM_ABI as Abi, functionName: "createAndInitializePoolIfNecessary", args: [chk.token0.address, chk.token1.address, fee, chk.sqrtPriceX96!] }, label: "Create and initialize BDEX V3 pool" },
        rows: [["Venue", "BDEX V3"], ["Pair", `${tA.symbol} / ${tB.symbol}`], ["Fee tier", `${(fee / 10_000).toFixed(2)}%`], ["Initial price", `1 ${tA.symbol} = ${chk.priceAinB} ${tB.symbol}`], ["Reciprocal", `1 ${tB.symbol} = ${chk.priceBinA.toPrecision(8)} ${tA.symbol}`], ["Next step", "Add initial liquidity on the Add tab"]],
      };
    }
    const x = safeParse(amtA, tA.decimals);
    if (x == null || x === 0n) return { error: "Enter the initial Token A amount" };
    const y = safeParse(String(Number(fmt(x, tA.decimals, tA.decimals)) * chk.priceAinB), tB.decimals);
    if (!y) return { error: "Initial Token B amount is too small" };
    const v = venue as V2Venue;
    const nat = isNative(tA) ? "a" : isNative(tB) ? "b" : null;
    const approvals: ApprovalNeed[] = [];
    if (nat !== "a") approvals.push({ token: tA.address as Address, symbol: tA.symbol, spender: v.router, amount: x });
    if (nat !== "b") approvals.push({ token: tB.address as Address, symbol: tB.symbol, spender: v.router, amount: y });
    const dl = deadlineFrom(Date.now() / 1000, 20);
    const call = nat
      ? { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "addLiquidityETH", value: nat === "a" ? x : y, args: nat === "a" ? [tB.address, y, y, x, address, dl] : [tA.address, x, x, y, address, dl] }
      : { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "addLiquidity", args: [tA.address, tB.address, x, y, x, y, address, dl] };
    return {
      op: { kind: "create-pool", chainId, dex: venue.label, pair: `${tA.symbol}/${tB.symbol}`, amounts: [`${fmt(x, tA.decimals)} ${tA.symbol}`, `${fmt(y, tB.decimals)} ${tB.symbol}`], approvals, call, label: `Create ${venue.label} pair with initial liquidity` },
      rows: [["Venue", venue.label], ["Pair", `${tA.symbol} / ${tB.symbol}`], ["Initial price", `1 ${tA.symbol} = ${chk.priceAinB} ${tB.symbol}`], ["Reciprocal", `1 ${tB.symbol} = ${chk.priceBinA.toPrecision(8)} ${tA.symbol}`], ["Initial liquidity", `${fmt(x, tA.decimals)} ${tA.symbol} + ${fmt(y, tB.decimals)} ${tB.symbol}`]],
    };
  }, [tA, tB, existing, venue, fee, tiers, price, ack, address, amtA, chainId]);

  const [balA, setBalA] = useState<string>();
  useEffect(() => { if (address && tA) readBalance(chainId, isNative(tA) ? "native" : (tA.address as Address), address).then((v) => setBalA(fmt(v, tA.decimals, 4))).catch(() => setBalA(undefined)); }, [address, tA, chainId]);

  return (
    <section className="fb-surface space-y-3 p-4">
      <Segmented value={venueId} onChange={(v) => { setVenueId(v); setA(""); setB(""); }} options={[{ id: "bdex-v3", label: "BDEX V3" }, { id: "bdex-v2", label: "BDEX V2" }, { id: "caswap", label: "CaSwap" }]} />
      <div className="flex gap-2">
        <TokenSelect label="Token A" tokens={list} value={a} onChange={setA} exclude={b} />
        <TokenSelect label="Token B" tokens={list} value={b} onChange={setB} exclude={a} />
      </div>
      {venue.kind === "v3" && (tiers.length ? <Segmented value={String(fee)} onChange={(v) => setFee(Number(v))} options={tiers.map((t) => ({ id: String(t), label: `${(t / 10_000).toFixed(2)}%` }))} /> : <Notice tone="warn">Fee tiers couldn't be read from the chain.</Notice>)}
      {tA && tB && existing === undefined && <p className="text-[12px] text-muted">Checking for an existing pool…</p>}
      {tA && tB && existing && <Notice tone="warn">This pool already exists ({existing.slice(0, 10)}…). Duplicates are rejected, so add liquidity to it instead.</Notice>}
      {tA && tB && existing === null && (
        <>
          <AmountInput label={`Initial price: 1 ${tA.symbol} = ? ${tB.symbol}`} value={price} onChange={setPrice} />
          {recip && (
            <div className="rounded-xl border border-hairline p-3 text-[12.5px] font-bold">
              <p>1 {tA.symbol} = {recip.aInB} {tB.symbol}</p>
              <p>1 {tB.symbol} = {recip.bInA.toPrecision(8)} {tA.symbol}</p>
            </div>
          )}
          {recip && (
            <label className="flex items-start gap-2 text-[12px]">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>I confirm this initial price in both directions. A wrong initial price can be traded against right away.</span>
            </label>
          )}
          {venue.kind === "v2" && <AmountInput label={`Initial ${tA.symbol} liquidity`} value={amtA} onChange={setAmtA} balance={balA} />}
        </>
      )}
      {prepared && "error" in prepared && existing === null && <Notice tone="error">{prepared.error}</Notice>}
      {venueClosed && <Notice tone="warn">{venue.label} only lets allowlisted wallets add liquidity or create pairs (the router rejects others with LP_NOT_ALLOWED). FlowBridge won't route this through another DEX. Existing CaSwap LP can still be removed under My Positions.</Notice>}
      {!writable && <Notice tone="warn">Pools can't be created on BOT Mainnet in this release. Create Pool is available on BOT Testnet.</Notice>}
      <button type="button" disabled={venueClosed || !writable || !prepared || "error" in prepared || tx.busy} onClick={() => setReview(true)} className="h-12 w-full rounded-2xl bg-primary text-[14px] font-black text-primary-foreground disabled:opacity-40">Review</button>
      <TxProgress steps={tx.steps} leftover={tx.leftover} busy={tx.busy} explorer={explorer} onClear={(x) => void tx.clearLeftover(chainId, x)} />
      {prepared && "op" in prepared && (
        <ReviewModal open={review} title="Review · Create pool" rows={prepared.rows} approvals={prepared.op.approvals} busy={tx.busy}
          confirmLabel={`Sign ${prepared.op.approvals.length + 1} transaction${prepared.op.approvals.length ? "s" : ""}`}
          onClose={() => setReview(false)} onConfirm={async () => { setReview(false); await tx.run(prepared.op); }} />
      )}
    </section>
  );
}

function p_caps(v: { caps: { addLiquidity: boolean; createPool: boolean } }) { return v.caps.addLiquidity && v.caps.createPool; }
