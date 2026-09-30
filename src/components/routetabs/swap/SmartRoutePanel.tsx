/**
 * Smart Trade V1 — route breakdown, DEX selector and "no liquidity route" guidance.
 * Everything shown here comes from live on-chain quotes/pool reads; nothing is invented.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatUnits } from "viem";
import {
  diagnoseConnectivity,
  dexLabel,
  type ConnectivityReport,
  type DexPreference,
  type QuoteResult,
} from "@/lib/swap/quoter";
import type { Token } from "@/lib/swap/tokenRegistry";

const DEX_OPTIONS: { id: DexPreference; label: string }[] = [
  { id: "auto", label: "Auto — Best Route" },
  { id: "bdex-v3", label: "BDEX V3" },
  { id: "bdex-v2", label: "BDEX V2" },
];

export function DexSelector({
  value,
  onChange,
  disabled,
}: {
  value: DexPreference;
  onChange: (v: DexPreference) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2 font-mono text-[11px]">
      <span className="font-black uppercase tracking-[0.12em] text-muted">DEX</span>
      <select
        aria-label="DEX preference"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as DexPreference)}
        className="min-w-0 max-w-[60%] truncate rounded-md border border-hairline bg-background px-2 py-1 text-[11px] font-bold text-foreground"
      >
        {DEX_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SmartRoutePanel({ quote, tokenOut }: { quote: QuoteResult; tokenOut: Token }) {
  return (
    <div className="mt-1 space-y-1 rounded-lg border border-hairline p-2">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
        Best route · {quote.steps.length} {quote.steps.length === 1 ? "step" : "steps"}
      </p>
      {quote.steps.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-x-2 text-[10.5px]">
          <span className="min-w-0 truncate">
            {i + 1}. {s.symbolPath[0]} → {s.symbolPath[s.symbolPath.length - 1]}
          </span>
          <span className="text-muted">
            {dexLabel(s.dex)}
            {s.v3Fee != null ? ` · pool fee ${(s.v3Fee / 10_000).toFixed(2)}%` : " · pool fee 0.30%*"}
          </span>
        </div>
      ))}
      {quote.steps.length > 1 && (
        <p className="text-[10px] leading-relaxed text-muted">
          Each step is a separate wallet confirmation and is re-quoted just before you sign it. Expected
          total: {formatUnits(quote.amountOut, tokenOut.decimals)} {tokenOut.symbol}.
        </p>
      )}
      {quote.steps.some((s) => s.v3Fee == null) && (
        <p className="text-[10px] text-muted">*Standard V2 pool fee, already included in the quote.</p>
      )}
    </div>
  );
}

export function NoRoutePanel({
  tokenIn,
  tokenOut,
  isMainnet,
  dexPref,
  onTryAuto,
}: {
  tokenIn: Token;
  tokenOut: Token;
  isMainnet: boolean;
  dexPref: DexPreference;
  onTryAuto: () => void;
}) {
  const [reports, setReports] = useState<ConnectivityReport[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setReports(null);
    Promise.all([diagnoseConnectivity(tokenIn, isMainnet), diagnoseConnectivity(tokenOut, isMainnet)])
      .then((r) => !cancelled && setReports(r))
      .catch(() => !cancelled && setReports([]));
    return () => {
      cancelled = true;
    };
  }, [tokenIn, tokenOut, isMainnet]);

  const isolated = reports?.find((r) => r.connectedHubs.length === 0);

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 font-mono text-[12px] text-amber-300">
      <p className="text-[11px] font-black uppercase tracking-widest">No liquidity route yet</p>
      {dexPref !== "auto" ? (
        <p>
          No route on {DEX_OPTIONS.find((o) => o.id === dexPref)?.label}. FlowBridge will not switch DEX for you.{" "}
          <button type="button" onClick={onTryAuto} className="font-bold text-primary underline">
            Try Auto
          </button>
        </p>
      ) : (
        <p>
          {isolated ? isolated.token.symbol : tokenIn.symbol} currently has no supported liquidity path to{" "}
          {isolated && isolated.token === tokenOut ? tokenIn.symbol : tokenOut.symbol}.
        </p>
      )}
      {reports === null ? (
        <p className="text-amber-300/70">Checking pools…</p>
      ) : (
        reports.map((r) => (
          <p key={r.token.symbol} className="text-[11px] text-amber-300/80">
            {r.token.symbol}: live pools with {r.connectedHubs.join(", ") || "none"}
            {r.missingHubs.length ? ` · no pool with ${r.missingHubs.join(", ")}` : ""}
          </p>
        ))
      )}
      {isolated && isolated.missingHubs.length > 0 && (
        <p className="text-[11px] text-amber-300/80">
          A pool such as {isolated.missingHubs.slice(0, 2).map((h) => `${isolated.token.symbol} / ${h}`).join(" or ")} could
          connect it. This is a possible connection, not a recommendation.
        </p>
      )}
      <Link to="/liquidity" className="inline-block text-[11px] font-bold text-primary">
        View liquidity options →
      </Link>
    </div>
  );
}
