import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import { getLiquidityVenues, type V2Venue, type V3Venue } from "@/lib/liquidity/venues";
import { discoverV2Positions, discoverV3Positions, type V2Position, type V3Position } from "@/lib/liquidity/chainReads";
import { MAX_UINT128, NPM_ABI, V2_PAIR_ABI, V2_ROUTER_ABI } from "@/lib/liquidity/abis";
import { amountsForLiquidity, applySlippage, getSqrtRatioAtTick, liquidityForAmounts, pairedAmount, tickToPrice } from "@/lib/liquidity/v3Math";
import { planRemoveV2, deadlineFrom } from "@/lib/liquidity/v2Math";
import { AmountInput, fmt, Notice, ReviewModal, Row, safeParse, Segmented, TxProgress } from "./shared";
import { useLiquidityTx, type LiquidityOp } from "./useLiquidityTx";
import { SmartLiquidityAI } from "./SmartLiquidityAI";

const STATUS: Record<V3Position["status"], string> = { "in-range": "In range", "below-range": "Out of range (below)", "above-range": "Out of range (above)", closed: "Closed (no liquidity)" };

export function usePositions(chainId: number) {
  const { address } = useAccount();
  const [v3, setV3] = useState<V3Position[] | null>(null);
  const [v2, setV2] = useState<Record<string, V2Position[] | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!address) return;
    setErr(null); setV3(null); setV2({});
    const venues = getLiquidityVenues(chainId);
    await Promise.all(venues.map(async (v) => {
      try {
        if (v.kind === "v3") setV3(await discoverV3Positions(v, address));
        else { const r = await discoverV2Positions(v, address); setV2((s) => ({ ...s, [v.id]: r })); }
      } catch (e) { setErr(`${v.label}: ${(e as Error).message.slice(0, 120)}`); if (v.kind === "v3") setV3([]); else setV2((s) => ({ ...s, [v.id]: [] })); }
    }));
  }, [address, chainId]);
  useEffect(() => { void load(); }, [load]);
  return { v3, v2, err, reload: load, address };
}

export function PositionsPanel({ chainId, writable, explorer, slippageBps }: { chainId: number; writable: boolean; explorer: string; slippageBps: number }) {
  const { v3, v2, err, reload, address } = usePositions(chainId);
  const venues = useMemo(() => getLiquidityVenues(chainId), [chainId]);
  const v3v = venues.find((v) => v.kind === "v3") as V3Venue | undefined;
  const tx = useLiquidityTx();
  const [action, setAction] = useState<{ op: LiquidityOp; rows: [string, string][]; notes?: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [inc, setInc] = useState(""), [pct, setPct] = useState("50");

  if (!address) return <Notice>Connect a wallet to discover your positions.</Notice>;

  const run = async (op: LiquidityOp) => { setAction(null); if (await tx.run(op)) void reload(); };
  const dl = () => deadlineFrom(Date.now() / 1000, 20);

  const v3Action = (p: V3Position, kind: "collect" | "decrease" | "increase" | "burn") => {
    if (!v3v) return;
    const pair = `${p.token0.symbol}/${p.token1.symbol}`;
    const base = { chainId, dex: "BDEX V3", pair, tokenId: p.tokenId.toString(), pool: p.pool ?? undefined, approvals: [] as LiquidityOp["approvals"] };
    if (kind === "collect") {
      setAction({ op: { ...base, kind: "collect-fees", amounts: [`${fmt(p.unclaimed0, p.token0.decimals)} ${p.token0.symbol}`, `${fmt(p.unclaimed1, p.token1.decimals)} ${p.token1.symbol}`], label: `Collect fees #${p.tokenId}`,
        call: { address: v3v.positionManager, abi: NPM_ABI as Abi, functionName: "collect", args: [{ tokenId: p.tokenId, recipient: address, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }] } },
        rows: [["Position", `#${p.tokenId} ${pair}`], ["Collect (owed)", `${fmt(p.unclaimed0, p.token0.decimals)} ${p.token0.symbol} + ${fmt(p.unclaimed1, p.token1.decimals)} ${p.token1.symbol}`], ["Liquidity", "Unchanged"]] });
    } else if (kind === "burn") {
      setAction({ op: { ...base, kind: "burn-position", amounts: [], label: `Burn empty position #${p.tokenId}`, call: { address: v3v.positionManager, abi: NPM_ABI as Abi, functionName: "burn", args: [p.tokenId] } },
        rows: [["Position", `#${p.tokenId} ${pair}`], ["Liquidity", "0"], ["Owed tokens", "0"], ["Effect", "The empty NFT is destroyed"]] });
    } else if (kind === "decrease") {
      const n = Number(pct);
      if (!(n > 0 && n <= 100)) return;
      const L = (p.liquidity * BigInt(Math.round(n * 100))) / 10_000n;
      const e = amountsForLiquidity(p.sqrtPriceX96, getSqrtRatioAtTick(p.tickLower), getSqrtRatioAtTick(p.tickUpper), L);
      setAction({ op: { ...base, kind: "decrease-liquidity", amounts: [`${fmt(e.amount0, p.token0.decimals)} ${p.token0.symbol}`, `${fmt(e.amount1, p.token1.decimals)} ${p.token1.symbol}`], label: `Decrease ${n}% #${p.tokenId}`,
        call: { address: v3v.positionManager, abi: NPM_ABI as Abi, functionName: "decreaseLiquidity", args: [{ tokenId: p.tokenId, liquidity: L, amount0Min: applySlippage(e.amount0, slippageBps), amount1Min: applySlippage(e.amount1, slippageBps), deadline: dl() }] } },
        rows: [["Position", `#${p.tokenId} ${pair}`], ["Remove", `${n}% of liquidity`], ["Expected", `${fmt(e.amount0, p.token0.decimals)} ${p.token0.symbol} + ${fmt(e.amount1, p.token1.decimals)} ${p.token1.symbol}`], ["Minimum", `${fmt(applySlippage(e.amount0, slippageBps), p.token0.decimals)} · ${fmt(applySlippage(e.amount1, slippageBps), p.token1.decimals)}`]],
        notes: ["Withdrawn tokens are owed to the position. Use Collect afterwards to send them to your wallet."] });
    } else {
      const a0 = safeParse(inc, p.token0.decimals);
      if (a0 == null || a0 === 0n) return;
      const inside = p.status === "in-range";
      const a1 = inside ? pairedAmount(p.sqrtPriceX96, p.tickLower, p.tickUpper, a0, 0) : 0n;
      const amt0 = p.status === "above-range" ? 0n : a0;
      const amt1 = p.status === "above-range" ? (safeParse(inc, p.token1.decimals) ?? 0n) : a1;
      const L = liquidityForAmounts(p.sqrtPriceX96, getSqrtRatioAtTick(p.tickLower), getSqrtRatioAtTick(p.tickUpper), amt0, amt1);
      const e = amountsForLiquidity(p.sqrtPriceX96, getSqrtRatioAtTick(p.tickLower), getSqrtRatioAtTick(p.tickUpper), L);
      const approvals: LiquidityOp["approvals"] = [];
      if (amt0 > 0n) approvals.push({ token: p.token0.address, symbol: p.token0.symbol, spender: v3v.positionManager, amount: amt0 });
      if (amt1 > 0n) approvals.push({ token: p.token1.address, symbol: p.token1.symbol, spender: v3v.positionManager, amount: amt1 });
      setAction({ op: { ...base, kind: "increase-liquidity", approvals, amounts: [`${fmt(amt0, p.token0.decimals)} ${p.token0.symbol}`, `${fmt(amt1, p.token1.decimals)} ${p.token1.symbol}`], label: `Increase #${p.tokenId}`,
        call: { address: v3v.positionManager, abi: NPM_ABI as Abi, functionName: "increaseLiquidity", args: [{ tokenId: p.tokenId, amount0Desired: amt0, amount1Desired: amt1, amount0Min: applySlippage(e.amount0, slippageBps), amount1Min: applySlippage(e.amount1, slippageBps), deadline: dl() }] } },
        rows: [["Position", `#${p.tokenId} ${pair}`], ["Add (max)", `${fmt(amt0, p.token0.decimals)} ${p.token0.symbol} + ${fmt(amt1, p.token1.decimals)} ${p.token1.symbol}`], ["Range", "Unchanged"]] });
    }
  };

  const v2Remove = (v: V2Venue, p: V2Position, percent: number, toNative: boolean, wrapped: string) => {
    const r = planRemoveV2(p.lpBalance, { pct: percent }, { reserveA: (p.amount0 * p.totalSupply) / p.lpBalance, reserveB: (p.amount1 * p.totalSupply) / p.lpBalance, totalSupply: p.totalSupply }, slippageBps);
    const nat0 = p.token0.address.toLowerCase() === wrapped.toLowerCase(), nat1 = p.token1.address.toLowerCase() === wrapped.toLowerCase();
    const useEth = toNative && (nat0 || nat1);
    const tok = nat0 ? p.token1 : p.token0;
    const call = useEth
      ? { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "removeLiquidityETH", args: [tok.address, r.liquidity, nat0 ? r.amountBMin : r.amountAMin, nat0 ? r.amountAMin : r.amountBMin, address, dl()] }
      : { address: v.router, abi: V2_ROUTER_ABI as Abi, functionName: "removeLiquidity", args: [p.token0.address, p.token1.address, r.liquidity, r.amountAMin, r.amountBMin, address, dl()] };
    setAction({ op: { kind: "remove-liquidity", chainId, dex: v.label, pair: `${p.token0.symbol}/${p.token1.symbol}`, pool: p.pair, amounts: [`${fmt(r.expectedA, p.token0.decimals)} ${p.token0.symbol}`, `${fmt(r.expectedB, p.token1.decimals)} ${p.token1.symbol}`],
      approvals: [{ token: p.pair as Address, symbol: "LP", spender: v.router, amount: r.liquidity }], call, label: `Remove liquidity on ${v.label}` },
      rows: [["Venue", v.label], ["Pair", `${p.token0.symbol}/${p.token1.symbol}`], ["LP to remove", `${fmt(r.liquidity, 18)} (${percent}%)`], ["Expected", `${fmt(r.expectedA, p.token0.decimals)} ${p.token0.symbol} + ${fmt(r.expectedB, p.token1.decimals)} ${p.token1.symbol}`], ["Minimum", `${fmt(r.amountAMin, p.token0.decimals)} · ${fmt(r.amountBMin, p.token1.decimals)}`], ["Receive", useEth ? "native BOT" : "wrapped tokens"], ["Deadline", "20 minutes"]] });
  };

  return (
    <div className="space-y-3">
      {err && <Notice tone="error">{err}</Notice>}
      {!writable && <Notice tone="warn">BOT Mainnet positions are read-only in this release, until the Mainnet liquidity canary is approved.</Notice>}

      <section className="fb-surface p-4">
        <div className="flex items-center justify-between"><p className="fb-eyebrow">BDEX V3 · NFT positions</p><button type="button" onClick={() => void reload()} className="text-[12px] font-bold text-primary">Refresh</button></div>
        {v3 === null && <p className="mt-2 text-[12px] text-muted">Reading positions…</p>}
        {v3?.length === 0 && <p className="mt-2 text-[12px] text-muted">No BDEX V3 positions in this wallet.</p>}
        <div className="mt-2 space-y-2">
          {v3?.map((p) => {
            const key = p.tokenId.toString();
            const cur = p.currentTick != null ? tickToPrice(p.currentTick, p.token0.decimals, p.token1.decimals) : null;
            const empty = p.liquidity === 0n && p.unclaimed0 === 0n && p.unclaimed1 === 0n;
            return (
              <div key={key} className="rounded-xl border border-hairline p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-black">{p.token0.symbol}/{p.token1.symbol} · {(p.fee / 10_000).toFixed(2)}%</span>
                  <span className={`text-[11px] font-bold ${p.status === "in-range" ? "text-success" : "text-warning"}`}>{STATUS[p.status]}</span>
                </div>
                <Row k="Token ID" v={`#${key}`} mono />
                <Row k="Liquidity" v={p.liquidity.toString()} mono />
                <Row k="Ticks" v={`${p.tickLower} → ${p.tickUpper} (current ${p.currentTick ?? "—"})`} mono />
                <Row k="Range" v={`${tickToPrice(p.tickLower, p.token0.decimals, p.token1.decimals).toPrecision(5)} – ${tickToPrice(p.tickUpper, p.token0.decimals, p.token1.decimals).toPrecision(5)} ${p.token1.symbol}/${p.token0.symbol}`} />
                <Row k="Current price" v={cur != null ? `${cur.toPrecision(6)} ${p.token1.symbol}/${p.token0.symbol}` : "—"} />
                <Row k="Unclaimed fees" v={p.unclaimed0 == null ? "Unavailable" : `${fmt(p.unclaimed0, p.token0.decimals)} ${p.token0.symbol} · ${fmt(p.unclaimed1, p.token1.decimals)} ${p.token1.symbol}`} />
                {writable && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={tx.busy || !(p.unclaimed0 || p.unclaimed1)} onClick={() => v3Action(p, "collect")} className="h-9 rounded-lg bg-primary px-3 text-[12px] font-bold text-primary-foreground disabled:opacity-40">Collect fees</button>
                    <button type="button" disabled={tx.busy} onClick={() => setOpen(open === key ? null : key)} className="h-9 rounded-lg border border-hairline px-3 text-[12px] font-bold">Increase / Decrease</button>
                    {empty && <button type="button" disabled={tx.busy} onClick={() => v3Action(p, "burn")} className="h-9 rounded-lg border border-hairline px-3 text-[12px] font-bold">Burn empty</button>}
                  </div>
                )}
                {open === key && (
                  <div className="mt-2 space-y-2 rounded-lg bg-card-alt p-2">
                    <AmountInput label={`Add ${p.status === "above-range" ? p.token1.symbol : p.token0.symbol}`} value={inc} onChange={setInc} />
                    <button type="button" disabled={tx.busy || p.status === "closed"} onClick={() => v3Action(p, "increase")} className="h-9 w-full rounded-lg border border-hairline text-[12px] font-bold disabled:opacity-40">Review increase</button>
                    <Segmented value={pct} onChange={setPct} options={["25", "50", "75", "100"].map((x) => ({ id: x, label: `${x}%` }))} />
                    <button type="button" disabled={tx.busy || p.liquidity === 0n} onClick={() => v3Action(p, "decrease")} className="h-9 w-full rounded-lg border border-hairline text-[12px] font-bold disabled:opacity-40">Review decrease</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {venues.filter((v): v is V2Venue => v.kind === "v2").map((v) => (
        <V2Group key={v.id} v={v} positions={v2[v.id] ?? null} writable={writable} busy={tx.busy} onRemove={v2Remove} />
      ))}

      <TxProgress steps={tx.steps} leftover={tx.leftover} busy={tx.busy} explorer={explorer} onClear={(x) => void tx.clearLeftover(chainId, x)} />
      <SmartLiquidityAI topics={["range-status", "collect", "increase-decrease", "impermanent-loss"]} />

      {action && (
        <ReviewModal open title={`Review · ${action.op.label}`} rows={action.rows} approvals={action.op.approvals} notes={action.notes}
          busy={tx.busy} confirmLabel={`Sign ${action.op.approvals.length + 1} transaction${action.op.approvals.length ? "s" : ""}`}
          onClose={() => setAction(null)} onConfirm={() => void run(action.op)} />
      )}
    </div>
  );
}

function V2Group({ v, positions, writable, busy, onRemove }: { v: V2Venue; positions: V2Position[] | null; writable: boolean; busy: boolean; onRemove: (v: V2Venue, p: V2Position, pct: number, toNative: boolean, wrapped: string) => void }) {
  const [pct, setPct] = useState<Record<string, string>>({});
  const [wrapped, setWrapped] = useState("");
  useEffect(() => { import("@/lib/liquidity/chainReads").then((m) => m.v2Wiring(v)).then((w) => setWrapped(w.wrapped)).catch(() => setWrapped("")); }, [v]);
  void V2_PAIR_ABI;
  return (
    <section className="fb-surface p-4">
      <p className="fb-eyebrow">{v.label} · LP tokens</p>
      {positions === null && <p className="mt-2 text-[12px] text-muted">Scanning {v.label} pairs…</p>}
      {positions?.length === 0 && <p className="mt-2 text-[12px] text-muted">No {v.label} LP tokens in this wallet.</p>}
      <div className="mt-2 space-y-2">
        {positions?.map((p) => {
          const hasNative = [p.token0.address, p.token1.address].some((x) => x.toLowerCase() === wrapped.toLowerCase());
          return (
            <div key={p.pair} className="rounded-xl border border-hairline p-3">
              <p className="text-[13px] font-black">{p.token0.symbol}/{p.token1.symbol}</p>
              <Row k="LP balance" v={fmt(p.lpBalance, 18)} mono />
              <Row k="Pool share" v={`${(p.shareBps / 100).toFixed(2)}%`} />
              <Row k="Your underlying" v={`${fmt(p.amount0, p.token0.decimals)} ${p.token0.symbol} + ${fmt(p.amount1, p.token1.decimals)} ${p.token1.symbol}`} />
              <Row k="Fees" v="Accrue inside the LP token" />
              {writable && (
                <div className="mt-2 space-y-2">
                  <Segmented value={pct[p.pair] ?? "50"} onChange={(x) => setPct((s) => ({ ...s, [p.pair]: x }))} options={["25", "50", "75", "100"].map((x) => ({ id: x, label: `${x}%` }))} />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => onRemove(v, p, Number(pct[p.pair] ?? "50"), false, wrapped)} className="h-9 flex-1 rounded-lg border border-hairline text-[12px] font-bold">Remove</button>
                    {hasNative && <button type="button" disabled={busy} onClick={() => onRemove(v, p, Number(pct[p.pair] ?? "50"), true, wrapped)} className="h-9 flex-1 rounded-lg border border-hairline text-[12px] font-bold">Remove as BOT</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
