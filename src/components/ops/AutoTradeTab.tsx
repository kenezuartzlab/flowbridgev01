/** Ops: AutoTrade V1 — paper-mode price-target orders (live trading disabled). */
import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/auth";

async function call(wallet: string, body?: unknown) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  const r = await fetch("/api/admin/autotrade", { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-wallet-address": wallet }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`);
  return j;
}
const input = "w-full rounded-lg border border-hairline bg-card px-2 py-1.5 text-sm";
const F: [string, string][] = [["budget", "Budget (quote)"], ["maxBuyPrice", "Max buy price (quote/base)"], ["minSellPrice", "Min sell price"], ["stopPrice", "Stop price (optional)"], ["slippageBps", "Slippage (bps)"], ["maxGasNative", "Max gas per leg (BOT)"], ["maxLoss", "Max loss (quote)"], ["expiresInMinutes", "Expires in (min)"]];

export function AutoTradeTab({ wallet }: { wallet: string }) {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ pair: "BOT/USDT", slippageBps: "50", maxGasNative: "0.01", expiresInMinutes: "60" });
  const load = () => call(wallet).then(setS).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (b: unknown) => { setErr(null); try { await call(wallet, b); await load(); } catch (e: any) { setErr(e.message); } };
  if (!s) return <p className="text-sm text-muted">{err ?? "Loading…"}</p>;
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-hairline bg-card p-3 text-sm">Paper mode only. Live trading: <b>{s.live ? "ON" : "OFF"}</b> · Public: <b>{s.public ? "ON" : "OFF"}</b>. No wallet or key is used.</p>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Pair<select className={input} value={f["pair"]} onChange={(e) => setF({ ...f, pair: e.target.value })}>{s.pairs.map((p: string) => <option key={p}>{p}</option>)}</select></label>
        {F.map(([k, l]) => <label key={k} className="text-xs">{l}<input className={input} inputMode="decimal" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      </div>
      <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => run({ action: "create", pair: f["pair"], budget: f["budget"], maxBuyPrice: f["maxBuyPrice"], minSellPrice: f["minSellPrice"], stopPrice: f["stopPrice"] || undefined, slippageBps: Number(f["slippageBps"]), maxGasNative: f["maxGasNative"], maxLoss: f["maxLoss"], expiresInMinutes: Number(f["expiresInMinutes"]), repeat: false })}>Create paper order</button>
      <div className="space-y-2">
        {s.orders.map((o: any) => (
          <div key={o.id} className="rounded-lg border border-hairline bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b>{o.pair}</b><span>{o.mode}</span><span className="font-mono">{o.state}</span><span className="text-xs text-muted">{o.id.slice(0, 8)}</span></div>
            {o.last_decision && <p className="mt-1 break-words text-xs text-muted">{o.last_decision.kind}: {o.last_decision.reason ?? o.last_decision.leg?.side} · out {o.last_decision.quote?.amountOut ?? "—"}</p>}
            <div className="mt-2 flex gap-2">{["tick", "pause", "resume", "cancel"].map((a) => <button key={a} className="rounded border border-hairline px-2 py-1 text-xs" onClick={() => run({ action: a, id: o.id })}>{a === "tick" ? "Check now" : a}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
