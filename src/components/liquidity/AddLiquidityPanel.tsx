import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import { getVenue, type LiquidityVenueId, type V2Venue, type V3Venue } from "@/lib/liquidity/venues";
import { readV2Pair, readV3Pool, enabledFeeTiers, readBalance, v2Wiring, type V3PoolState } from "@/lib/liquidity/chainReads";
import { planAddV2, deadlineFrom } from "@/lib/liquidity/v2Math";
import { applySlippage, fullRangeTicks, getSqrtRatioAtTick, liquidityForAmounts, amountsForLiquidity, pairedAmount, priceToTick, nearestUsableTick, tickToPrice, validateRange } from "@/lib/liquidity/v3Math";
import { suggestRanges, type RangeProfile } from "@/lib/liquidity/suggestedRange";
import { sortTokens } from "@/lib/liquidity/createPool";
import { checkTokenForLiquidity } from "@/lib/liquidity/tokenSafety";
import { V2_ROUTER_ABI, NPM_ABI } from "@/lib/liquidity/abis";
import { isNative, liquidityTokens } from "@/lib/liquidity/liquidityTokens";
import type { Token } from "@/lib/swap/tokenRegistry";
import { AmountInput, fmt, Notice, ReviewModal, Row, safeParse, Segmented, TokenSelect, TxProgress } from "./shared";
import { useLiquidityTx, type ApprovalNeed, type LiquidityOp } from "./useLiquidityTx";
import { SmartLiquidityAI } from "./SmartLiquidityAI";

export function AddLiquidityPanel({ chainId, writable, explorer, slippageBps, onCreatePool }: { chainId: number; writable: boolean; explorer: string; slippageBps: number; onCreatePool: () => void }) {
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
  const [amtA, setAmtA] = useState(""), [amtB, setAmtB] = useState("");
  const [tiers, setTiers] = useState<{ fee: number; tickSpacing: number }[]>([]);
  const [fee, setFee] = useState(3000);
  const [v2State, setV2State] = useState<{ ra: bigint; rb: bigint; ts: bigint; pair: Address } | null | "none">(null);
  const [v3State, setV3State] = useState<V3PoolState | null>(null);
  const [bal, setBal] = useState<{ a: bigint; b: bigint } | null>(null);
  const [mode, setMode] = useState<"full" | "ai" | "custom">("full");
  const [profile, setProfile] = useState<RangeProfile>("balanced");
  const [minP, setMinP] = useState(""), [maxP, setMaxP] = useState("");
  const [review, setReview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tx = useLiquidityTx();
  const venueClosed = !(p_caps(venue));

  const tA = list.find((t) => t.address === a), tB = list.find((t) => t.address === b);

  useEffect(() => { setV2State(null); setV3State(null); setErr(null); }, [a, b, venueId, chainId, fee]);
  useEffect(() => { if (venue.kind === "v3") enabledFeeTiers(venue).then((t) => { setTiers(t); if (!t.some((x) => x.fee === fee) && t[0]) setFee(t[0].fee); }).catch(() => setTiers([])); }, [venueId, chainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pool reads
  useEffect(() => {
    if (!tA || !tB) return;
    let off = false;
    (async () => {
      try {
        if (venue.kind === "v2") {
          const { wrapped } = await v2Wiring(venue);
          const ad = (isNative(tA) ? wrapped : tA.address) as Address, bd = (isNative(tB) ? wrapped : tB.address) as Address;
          const p = await readV2Pair(venue, ad, bd);
          if (off) return;
          if (!p || p.reserve0 === 0n) return setV2State("none");
          const aIs0 = p.token0.toLowerCase() === ad.toLowerCase();
          setV2State({ ra: aIs0 ? p.reserve0 : p.reserve1, rb: aIs0 ? p.reserve1 : p.reserve0, ts: p.totalSupply, pair: p.pair! });
        } else {
          const s = await readV3Pool(venue, tA.address as Address, tB.address as Address, fee);
          if (!off) setV3State(s);
        }
      } catch (e) { if (!off) setErr((e as Error).message.slice(0, 160)); }
    })();
    return () => { off = true; };
  }, [tA, tB, venue, fee]);

  useEffect(() => {
    if (!address || !tA || !tB) return setBal(null);
    Promise.all([readBalance(chainId, isNative(tA) ? "native" : (tA.address as Address), address), readBalance(chainId, isNative(tB) ? "native" : (tB.address as Address), address)])
      .then(([x, y]) => setBal({ a: x, b: y })).catch(() => setBal(null));
  }, [address, tA, tB, chainId, tx.steps.length]);

  // V3 orientation (pool token0/token1)
  const v3 = useMemo(() => {
    if (venue.kind !== "v3" || !tA || !tB || !v3State?.pool) return null;
    const [t0, t1, flipped] = sortTokens(tA, tB);
    const spacing = v3State.tickSpacing;
    const snap = { exists: true, liquidity: v3State.liquidity, sqrtPriceX96: v3State.sqrtPriceX96, tick: v3State.tick, tickSpacing: spacing, dec0: t0.decimals, dec1: t1.decimals };
    const suggestions = suggestRanges(snap);
    let range: { tickLower: number; tickUpper: number } | null = null;
    if (mode === "full") range = fullRangeTicks(spacing);
    else if (mode === "ai") { const s = suggestions?.find((x) => x.profile === profile); range = s ? { tickLower: s.tickLower, tickUpper: s.tickUpper } : null; }
    else {
      try {
        // Custom prices are entered as "Token B per Token A".
        const toPool = (p: number) => (flipped ? 1 / p : p);
        const lo = Number(minP), hi = Number(maxP);
        if (lo > 0 && hi > 0) {
          const x = nearestUsableTick(priceToTick(toPool(lo), t0.decimals, t1.decimals), spacing);
          const y = nearestUsableTick(priceToTick(toPool(hi), t0.decimals, t1.decimals), spacing);
          range = { tickLower: Math.min(x, y), tickUpper: Math.max(x, y) };
        }
      } catch { range = null; }
    }
    const curAinB = flipped ? 1 / tickToPrice(v3State.tick, t0.decimals, t1.decimals) : tickToPrice(v3State.tick, t0.decimals, t1.decimals);
    return { t0, t1, flipped, spacing, suggestions, range, curAinB };
  }, [venue.kind, tA, tB, v3State, mode, profile, minP, maxP]);

  // Paired amount
  useEffect(() => {
    if (!tA || !tB) return;
    const x = safeParse(amtA, tA.decimals);
    if (x == null) return;
    if (venue.kind === "v2" && v2State && v2State !== "none") setAmtB(fmt((x * v2State.rb) / v2State.ra, tB.decimals, tB.decimals));
    if (venue.kind === "v3" && v3 && v3.range && v3State) {
      const v = validateRange(v3.range.tickLower, v3.range.tickUpper, v3.spacing);
      if (!v.ok) return;
      const side: 0 | 1 = v3.flipped ? 1 : 0;
      setAmtB(fmt(pairedAmount(v3State.sqrtPriceX96, v3.range.tickLower, v3.range.tickUpper, x, side), tB.decimals, tB.decimals));
    }
  }, [amtA, v2State, v3, v3State, venue.kind, tA, tB]);

  const safety = [tA, tB].map((t) => (t ? checkTokenForLiquidity(t as Token & { curated?: boolean }, new Set()) : { ok: true as const }));
  const blocked = safety.find((s) => !s.ok) as { ok: false; reason: string } | undefined;

  const prepared = useMemo((): { op: LiquidityOp; rows: [string, string][]; notes: string[] } | { error: string } | null => {
    if (!tA || !tB || !address) return null;
    const x = safeParse(amtA, tA.decimals), y = safeParse(amtB, tB.decimals);
    if (x == null || x === 0n) return null;
    try {
      const deadline = deadlineFrom(Date.now() / 1000, 20);
      if (venue.kind === "v2") {
        if (v2State === "none") return { error: "No pair yet on this venue. Use Create Pool to set the initial price." };
        if (!v2State || !bal) return null;
        const plan = planAddV2(x, null, { reserveA: v2State.ra, reserveB: v2State.rb, totalSupply: v2State.ts }, slippageBps, bal);
        const v = venue as V2Venue;
        const nat = isNative(tA) ? "a" : isNative(tB) ? "b" : null;
        const approvals: ApprovalNeed[] = [];
        if (nat !== "a") approvals.push({ token: tA.address as Address, symbol: tA.symbol, spender: v.router, amount: plan.amountADesired });
        if (nat !== "b") approvals.push({ token: tB.address as Address, symbol: tB.symbol, spender: v.router, amount: plan.amountBDesired });
        const call = nat
          ? { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "addLiquidityETH", value: nat === "a" ? plan.amountADesired : plan.amountBDesired,
              args: nat === "a" ? [tB.address, plan.amountBDesired, plan.amountBMin, plan.amountAMin, address, deadline] : [tA.address, plan.amountADesired, plan.amountAMin, plan.amountBMin, address, deadline] }
          : { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "addLiquidity", args: [tA.address, tB.address, plan.amountADesired, plan.amountBDesired, plan.amountAMin, plan.amountBMin, address, deadline] };
        return {
          op: { kind: "add-liquidity", chainId, dex: venue.label, pair: `${tA.symbol}/${tB.symbol}`, pool: v2State.pair, amounts: [`${fmt(plan.amountADesired, tA.decimals)} ${tA.symbol}`, `${fmt(plan.amountBDesired, tB.decimals)} ${tB.symbol}`], approvals, call, label: `Add liquidity on ${venue.label}` },
          rows: [["Venue", venue.label], ["Pair", `${tA.symbol} / ${tB.symbol}`], ["Deposit", `${fmt(plan.amountADesired, tA.decimals)} ${tA.symbol} + ${fmt(plan.amountBDesired, tB.decimals)} ${tB.symbol}`], ["Minimum accepted", `${fmt(plan.amountAMin, tA.decimals)} ${tA.symbol} · ${fmt(plan.amountBMin, tB.decimals)} ${tB.symbol}`], ["Pool share after", `${(plan.shareBps / 100).toFixed(2)}%`], ["Slippage", `${slippageBps / 100}%`], ["Deadline", "20 minutes"], ["Pool", v2State.pair]],
          notes: ["Gas is estimated by your wallet before each signature.", "V2 fees accumulate inside the LP token. No APR is shown because none can be verified."],
        };
      }
      if (!v3 || !v3State?.pool) return { error: "This pool doesn't exist yet. Use Create Pool." };
      if (!v3.range) return { error: mode === "ai" ? "No reliable pool data for a suggested range." : "Enter a valid price range." };
      const vr = validateRange(v3.range.tickLower, v3.range.tickUpper, v3.spacing);
      if (!vr.ok) return { error: vr.reason };
      if (y == null || !bal) return null;
      if (x > bal.a || y > bal.b) return { error: "Insufficient balance" };
      const [a0, a1] = v3.flipped ? [y, x] : [x, y];
      const sa = getSqrtRatioAtTick(v3.range.tickLower), sb = getSqrtRatioAtTick(v3.range.tickUpper);
      const L = liquidityForAmounts(v3State.sqrtPriceX96, sa, sb, a0, a1);
      if (L === 0n) return { error: "Amounts too small for this range" };
      const exp = amountsForLiquidity(v3State.sqrtPriceX96, sa, sb, L);
      const v = venue as V3Venue;
      const approvals: ApprovalNeed[] = [];
      if (a0 > 0n) approvals.push({ token: v3.t0.address as Address, symbol: v3.t0.symbol, spender: v.positionManager, amount: a0 });
      if (a1 > 0n) approvals.push({ token: v3.t1.address as Address, symbol: v3.t1.symbol, spender: v.positionManager, amount: a1 });
      const pLo = tickToPrice(v3.range.tickLower, v3.t0.decimals, v3.t1.decimals), pHi = tickToPrice(v3.range.tickUpper, v3.t0.decimals, v3.t1.decimals);
      const [lo, hi] = v3.flipped ? [1 / pHi, 1 / pLo] : [pLo, pHi];
      return {
        op: { kind: "add-liquidity", chainId, dex: "BDEX V3", pair: `${tA.symbol}/${tB.symbol}`, pool: v3State.pool, amounts: [`${fmt(x, tA.decimals)} ${tA.symbol}`, `${fmt(y, tB.decimals)} ${tB.symbol}`], approvals,
          call: { address: v.positionManager, abi: NPM_ABI as Abi, functionName: "mint", args: [{ token0: v3.t0.address, token1: v3.t1.address, fee, tickLower: v3.range.tickLower, tickUpper: v3.range.tickUpper, amount0Desired: a0, amount1Desired: a1, amount0Min: applySlippage(exp.amount0, slippageBps), amount1Min: applySlippage(exp.amount1, slippageBps), recipient: address, deadline }] },
          label: "Mint BDEX V3 position" },
        rows: [["Venue", "BDEX V3"], ["Pair", `${tA.symbol} / ${tB.symbol}`], ["Fee tier", `${(fee / 10_000).toFixed(2)}%`], ["Current price", `1 ${tA.symbol} = ${v3.curAinB.toPrecision(6)} ${tB.symbol}`], ["Range", mode === "full" ? "Full range" : `${lo.toPrecision(6)} – ${hi.toPrecision(6)} ${tB.symbol} per ${tA.symbol}`], ["Ticks", `${v3.range.tickLower} → ${v3.range.tickUpper}`], ["Deposit (max)", `${fmt(x, tA.decimals)} ${tA.symbol} + ${fmt(y, tB.decimals)} ${tB.symbol}`], ["Minimum accepted", `${fmt(applySlippage(exp.amount0, slippageBps), v3.t0.decimals)} ${v3.t0.symbol} · ${fmt(applySlippage(exp.amount1, slippageBps), v3.t1.decimals)} ${v3.t1.symbol}`], ["Slippage", `${slippageBps / 100}%`], ["Deadline", "20 minutes"]],
        notes: ["Gas is estimated by your wallet before each signature.", "Out of range, a position earns no fees. FlowBridge never rebalances it."],
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [tA, tB, address, amtA, amtB, venue, v2State, v3, v3State, bal, slippageBps, chainId, fee, mode]);

  const live: string[] = [];
  if (v3?.curAinB && tA && tB) live.push(`Live price: 1 ${tA.symbol} = ${v3.curAinB.toPrecision(6)} ${tB.symbol} · tick ${v3State?.tick} · spacing ${v3.spacing}`);
  if (v2State && v2State !== "none" && tA && tB) live.push(`Live reserves: ${fmt(v2State.ra, tA.decimals, 4)} ${tA.symbol} / ${fmt(v2State.rb, tB.decimals, 4)} ${tB.symbol}`);

  return (
    <div className="space-y-3">
      <section className="fb-surface space-y-3 p-4">
        <Segmented value={venueId} onChange={(v) => { setVenueId(v); setA(""); setB(""); }} options={[{ id: "bdex-v3", label: "BDEX V3" }, { id: "bdex-v2", label: "BDEX V2" }, { id: "caswap", label: "CaSwap" }]} />
        <div className="flex gap-2">
          <TokenSelect label="Token A" tokens={list} value={a} onChange={setA} exclude={b} />
          <TokenSelect label="Token B" tokens={list} value={b} onChange={setB} exclude={a} />
        </div>
        {venue.kind === "v3" && (
          <div>
            <p className="fb-eyebrow">Fee tier (enabled on-chain)</p>
            {tiers.length === 0 ? <Notice tone="warn">Fee tiers couldn't be read from the chain. Adding liquidity is unavailable.</Notice> : (
              <Segmented value={String(fee)} onChange={(v) => setFee(Number(v))} options={tiers.map((t) => ({ id: String(t.fee), label: `${(t.fee / 10_000).toFixed(2)}%` }))} />
            )}
          </div>
        )}
        {blocked && <Notice tone="error">{blocked.reason}</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
        {tA && tB && venue.kind === "v2" && v2State === "none" && (
          <Notice tone="warn">No {venue.label} pair for {tA.symbol}/{tB.symbol} yet. <button type="button" className="font-bold text-primary" onClick={onCreatePool}>Create Pool →</button></Notice>
        )}
        {tA && tB && venue.kind === "v3" && v3State && !v3State.pool && (
          <Notice tone="warn">No BDEX V3 {tA.symbol}/{tB.symbol} pool at {(fee / 10_000).toFixed(2)}%. <button type="button" className="font-bold text-primary" onClick={onCreatePool}>Create Pool →</button></Notice>
        )}

        {v3 && (
          <div className="space-y-2">
            <p className="fb-eyebrow">Price range</p>
            <Segmented value={mode} onChange={setMode} options={[{ id: "full", label: "Full range" }, { id: "ai", label: "AI Suggested", disabled: !v3.suggestions }, { id: "custom", label: "Custom" }]} />
            {mode === "ai" && v3.suggestions && (
              <div className="space-y-2">
                <Segmented value={profile} onChange={setProfile} options={[{ id: "wide", label: "Wide" }, { id: "balanced", label: "Balanced" }, { id: "narrow", label: "Narrow" }]} />
                {(() => {
                  const s = v3.suggestions.find((x) => x.profile === profile)!;
                  const [lo, hi] = v3.flipped ? [1 / s.priceUpper, 1 / s.priceLower] : [s.priceLower, s.priceUpper];
                  return (
                    <div className="rounded-xl border border-hairline p-3 text-[12px]">
                      <Row k="Current price" v={`${v3.curAinB.toPrecision(6)} ${tB!.symbol}`} />
                      <Row k="Proposed range" v={`${lo.toPrecision(6)} – ${hi.toPrecision(6)}`} />
                      <Row k="Relative concentration" v={`${s.concentration.toFixed(1)}× full range`} />
                      {s.notes.map((n) => <p key={n} className="mt-1 text-muted">{n}</p>)}
                    </div>
                  );
                })()}
              </div>
            )}
            {mode === "ai" && !v3.suggestions && <Notice tone="warn">No live liquidity in this pool, so no suggested range is offered.</Notice>}
            {mode === "custom" && (
              <div className="flex gap-2">
                <AmountInput label={`Min (${tB?.symbol} per ${tA?.symbol})`} value={minP} onChange={setMinP} />
                <AmountInput label="Max" value={maxP} onChange={setMaxP} />
              </div>
            )}
          </div>
        )}

        <AmountInput label={tA ? `Amount ${tA.symbol}` : "Amount A"} value={amtA} onChange={setAmtA} balance={bal && tA ? fmt(bal.a, tA.decimals, 4) : undefined} />
        <AmountInput label={tB ? `Amount ${tB.symbol} (pool ratio)` : "Amount B"} value={amtB} readOnly balance={bal && tB ? fmt(bal.b, tB.decimals, 4) : undefined} />

        {prepared && "error" in prepared && <Notice tone="error">{prepared.error}</Notice>}
        {!address && <Notice>Connect a wallet to see balances and add liquidity.</Notice>}
        {venueClosed && <Notice tone="warn">{venue.label} only lets allowlisted wallets add liquidity or create pairs (the router rejects others with LP_NOT_ALLOWED). FlowBridge won't route this through another DEX. Existing CaSwap LP can still be removed under My Positions.</Notice>}
      {!writable && <Notice tone="warn">On BOT Mainnet, adding liquidity opens after the Mainnet liquidity canary is approved. Pools and positions are read-only until then.</Notice>}
        <button type="button" disabled={venueClosed || !writable || !!blocked || !prepared || "error" in prepared || tx.busy} onClick={() => setReview(true)}
          className="h-12 w-full rounded-2xl bg-primary text-[14px] font-black text-primary-foreground disabled:opacity-40">Review</button>
        <TxProgress steps={tx.steps} leftover={tx.leftover} busy={tx.busy} explorer={explorer} onClear={(x) => void tx.clearLeftover(chainId, x)} />
      </section>

      <SmartLiquidityAI topics={venue.kind === "v3" ? ["concentrated", "fee-tiers", "range-width", "range-status", "impermanent-loss"] : ["v2-vs-v3", "impermanent-loss"]} live={live} />

      {prepared && "op" in prepared && (
        <ReviewModal open={review} title="Review · Add liquidity" rows={prepared.rows} approvals={prepared.op.approvals} notes={prepared.notes}
          busy={tx.busy} confirmLabel={`Sign ${prepared.op.approvals.length + 1} transaction${prepared.op.approvals.length ? "s" : ""}`}
          onClose={() => setReview(false)} onConfirm={async () => { setReview(false); await tx.run(prepared.op); }} />
      )}
    </div>
  );
}

function p_caps(v: { caps: { addLiquidity: boolean; createPool: boolean } }) { return v.caps.addLiquidity && v.caps.createPool; }
