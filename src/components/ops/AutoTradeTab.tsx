/** Ops: AutoTrade V1 — paper-mode price-target orders (live trading disabled). */
import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CANARY_APPROVAL } from "@/lib/autotrade/canaryPreparation";

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
  const [preview, setPreview] = useState<any>(null);
  const [preparation, setPreparation] = useState<any>(null);
  const [f, setF] = useState<Record<string, string>>({ pair: "CA/BOT", slippageBps: "50", expiresInMinutes: "60" });
  const load = () => call(wallet).then(setS).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (b: unknown) => { setErr(null); try { await call(wallet, b); await load(); } catch (e: any) { setErr(e.message); } };
  if (!s) return <p className="text-sm text-muted">{err ?? "Loading…"}</p>;
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-hairline bg-card p-3 text-sm">Paper mode only. Live trading: <b>{s.live ? "ON" : "OFF"}</b> · Public: <b>{s.public ? "ON" : "OFF"}</b>. No wallet or key is used.</p>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <section className="space-y-2 border-b border-hairline pb-3 text-sm">
        <p><b>{CANARY_APPROVAL.status}</b> · 5 USDT equivalent · CA/BOT · one buy/sell cycle</p>
        <p className="text-muted">Gas approval pending · Order authorization pending · Dedicated account not provisioned</p>
        <Button variant="outline" onClick={async () => { setPreparation(null); setErr(null); try { const j = await call(wallet, { action: "prepare_canary" }); setPreparation(j.preparation); } catch (e: any) { setErr(e.message); } }}>Refresh canary estimate</Button>
        {preparation && <div className="text-xs text-muted space-y-1">
          <p>Indicative cap: {preparation.indicativeBot} BOT · block {preparation.block} · {new Date(preparation.fetchedAt).toLocaleTimeString()}</p>
          <p>Planning gas reserve: {preparation.gasReserveBot} BOT · approval pending</p>
          <p>Not executable · independent price verification pending · exact gas simulation pending</p>
        </div>}
      </section>
      <div className="rounded-lg border border-hairline bg-card p-3 text-sm space-y-1">
        <div className="flex flex-wrap items-center gap-2"><b>Monitor</b>
          <span>{s.worker?.lease?.heartbeat_at ? `heartbeat ${new Date(s.worker.lease.heartbeat_at).toLocaleTimeString()} · block ${s.worker.lease.last_block ?? "—"}` : "not running yet"}</span>
          <span className="text-xs text-muted">delay p50 {s.worker?.p50 ?? "—"} ms · p95 {s.worker?.p95 ?? "—"} ms · {s.worker?.samples ?? 0} samples · {s.worker?.lastConsensus ?? ""}</span></div>
        <div className="flex items-center gap-2">Emergency pause: <b>{s.control?.emergency_paused ? "ON" : "OFF"}</b>
          <button className="rounded border border-hairline px-2 py-1 text-xs" onClick={() => run({ action: "emergency", paused: !s.control?.emergency_paused })}>{s.control?.emergency_paused ? "Resume" : "Pause all"}</button></div>
      </div>
      <div className="rounded-lg border border-hairline bg-card p-3 text-sm space-y-1">
        <b>Router V4 venues (live read)</b>
        {s.registry ? <>
          <p className="text-xs text-muted break-all">Owner {s.registry.owner} · {s.registry.paused ? "paused" : "running"} · global fee {s.registry.globalFeeBps} bp</p>
          {s.registry.routers.map((r: any) => <p key={r.id} className="text-xs break-all">#{r.id} {r.name} ({r.type}) {r.active ? "active" : "inactive"} · {r.router}</p>)}
        </> : <p className="text-xs text-muted">Unavailable</p>}
        {s.candidates?.map((c: any) => <div key={c.key} className="text-xs border-t border-hairline pt-1">
          <b>{c.name}</b> · {c.recommendation === "DO_NOT_REGISTER" ? "not recommended" : "optional"} — {c.evidence}
          <button className="ml-2 rounded border border-hairline px-2 py-0.5" onClick={async () => { try { const j = await call(wallet, { action: "registry_preview", key: c.key }); setPreview(j.preview); } catch (e: any) { setErr(e.message); } }}>Preview owner transaction</button>
        </div>)}
        {preview && <pre className="whitespace-pre-wrap break-all text-[11px] text-muted">{JSON.stringify(preview, null, 1)}</pre>}
        <p className="text-xs text-muted">Registry changes are disabled here; previews are for owner review only.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Pair<select className={input} value={f["pair"]} onChange={(e) => setF({ ...f, pair: e.target.value })}>{s.pairs.map((p: string) => <option key={p}>{p}</option>)}</select></label>
        {F.map(([k, l]) => <label key={k} className="text-xs">{l}<input className={input} inputMode="decimal" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      </div>
      <p className="text-xs text-muted">Single cycle · repeat OFF · buy and sell targets not selected</p>
      <Button onClick={() => run({ action: "create", pair: f["pair"], budget: f["budget"], maxBuyPrice: f["maxBuyPrice"], minSellPrice: f["minSellPrice"], stopPrice: f["stopPrice"] || undefined, slippageBps: Number(f["slippageBps"]), maxGasNative: f["maxGasNative"], maxLoss: f["maxLoss"], expiresInMinutes: Number(f["expiresInMinutes"]), repeat: false })}>Create paper order</Button>
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
