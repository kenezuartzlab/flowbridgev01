/** Ops: AutoTrade V1 — paper-mode price-target orders (live trading disabled). */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CANARY_APPROVAL } from "@/lib/autotrade/canaryPreparation";
import { callAutoTrade as call } from "@/lib/autotrade/clientRequest";
import { AutoTradePaperForm } from "./AutoTradePaperForm";
import { percentToBps } from "@/lib/autotrade/paperForm";
import { opsPermissions } from "@/lib/autotrade/paperPermissions";
const SUPER_ONLY = "Super admin only";
const input = "w-full rounded-lg border border-hairline bg-card px-2 py-1.5 text-sm";

export function AutoTradeTab({ wallet }: { wallet: string }) {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [preparation, setPreparation] = useState<any>(null);
  const [infrastructure, setInfrastructure] = useState<any>(null);
  const [canary, setCanary] = useState({ maxBuyPrice: "", minSellPrice: "", slippagePercent: "0.5", expiresInMinutes: "60" });
  const load = async () => { const result = await call(wallet); setS(result); };
  useEffect(() => { let active = true; setS(null); setErr(null); setPreparation(null); setInfrastructure(null); void call(wallet).then(result => { if (active) setS(result); }).catch(e => { if (active) setErr(e.message); }); return () => { active = false; }; }, [wallet]);
  useEffect(() => {
    if (!preparation) return;
    const timer = setTimeout(() => setPreparation(null), Math.max(0, preparation.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preparation]);
  const run = async (b: unknown) => { setErr(null); try { await call(wallet, b); await load(); } catch (e: any) { setErr(e.message); } };
  if (!s) return <div className="space-y-2"><p role={err ? "alert" : "status"} className="text-sm text-muted">{err ?? "Loading AutoTrade…"}</p>{err && <Button type="button" variant="outline" onClick={() => { setErr(null); void load().catch(e => setErr(e.message)); }}>Retry AutoTrade</Button>}</div>;
  const perms = s.viewer?.permissions ?? opsPermissions(s.viewer?.role);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-hairline bg-card p-3 text-sm">Paper mode only. Live trading: <b>{s.live ? "ON" : "OFF"}</b> · Public: <b>{s.public ? "ON" : "OFF"}</b>. No wallet or key is used.</p>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {s.readiness && <section className="space-y-2 border-b border-hairline pb-3 text-sm">
        <h3 className="font-semibold">Operational readiness · live OFF</h3>
        <ul className="space-y-1">{s.readiness.items.map((item: any) => <li key={item.key} className="flex flex-wrap justify-between gap-2"><span>{item.label}</span><span className="text-xs text-muted">{item.status.replaceAll("_", " ")}</span></li>)}</ul>
        <details><summary className="cursor-pointer text-xs">Bound-wallet acceptance</summary><ol className="list-decimal space-y-1 pl-5 text-xs text-muted">{s.readiness.acceptance.map((step: string) => <li key={step}>{step}</li>)}</ol></details>
        <Button variant="outline" disabled={!perms.infrastructure} title={perms.infrastructure ? undefined : SUPER_ONLY} onClick={async () => { setErr(null); try { const result = await call(wallet, { action: "validate_infrastructure" }); setInfrastructure(result.infrastructure); } catch (e: any) { setErr(e.message); } }}>Check configured infrastructure</Button>
        {infrastructure && <p className="text-xs text-muted">{infrastructure.status.replaceAll("_", " ")} · no signing requested</p>}
      </section>}
      <section className="space-y-2 border-b border-hairline pb-3 text-sm">
        <p><b>{CANARY_APPROVAL.status}</b> · 5 USDT equivalent · CA/BOT · one buy/sell cycle</p>
        <p className="text-muted">Gas approval pending · Order authorization pending · Dedicated account not provisioned</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[["maxBuyPrice", "Canary buy at or below (BOT per CA)"], ["minSellPrice", "Canary sell at or above (BOT per CA)"], ["slippagePercent", "Canary max slippage (%)"], ["expiresInMinutes", "Proposed expiry (minutes)"]].map(([key, label]) => {
            if (!key || !label) return null;
            return <label className="text-xs" key={key}>{label}<input className={input} inputMode="decimal" value={canary[key as keyof typeof canary]} onChange={e => { setPreparation(null); setCanary({ ...canary, [key]: e.target.value }); }} /></label>;
          })}
        </div>
        <Button type="button" variant="outline" disabled={!perms.canaryReview} title={perms.canaryReview ? undefined : SUPER_ONLY} onClick={async () => { setPreparation(null); setErr(null); try { const j = await call(wallet, { action: "prepare_canary", maxBuyPrice: canary.maxBuyPrice, minSellPrice: canary.minSellPrice, slippageBps: percentToBps(canary.slippagePercent), expiresInMinutes: Number(canary.expiresInMinutes) }); setPreparation(j.preparation); } catch (e: any) { setErr(e.message); } }}>Prepare review ticket</Button>
        {preparation && <div className="text-xs text-muted space-y-1">
          <p>Indicative cap: {preparation.indicativeBot} BOT · block {preparation.block} · {new Date(preparation.fetchedAt).toLocaleTimeString()}</p>
          <p>Proposed gas cap: {preparation.gasReserveBot} BOT / {preparation.gasReserveUsdt} USDT · approval pending</p>
          <p>Total proposed exposure: {preparation.totalExposureBot} BOT / {preparation.totalExposureUsdt} USDT (5 trade + separate gas)</p>
          <p>Gas: {preparation.gasEffects.map((l: any) => `${l.effect} ${l.estimatedUnits} → ${l.maxUnits}`).join(" · ")} · max {preparation.maxFeeGwei} gwei</p>
          <p>{preparation.gasContingency} · local fork model, not dedicated-account simulation</p>
          <p>Buy max {preparation.ticket.maxBuyPrice ?? "not selected"} · sell min {preparation.ticket.minSellPrice ?? "not selected"} BOT per CA · slippage {preparation.ticket.slippageBps / 100}%</p>
          <p>Proposed order expiry {new Date(preparation.ticket.proposedOrderExpiresAt).toLocaleString()} · quote and gas proposal expire {new Date(preparation.expiresAt).toLocaleTimeString()}</p>
          <p>Review only · no order created · no guaranteed fill · independent RPC, exact gas, signer and order authorization pending</p>
        </div>}
      </section>
      <div className="rounded-lg border border-hairline bg-card p-3 text-sm space-y-1">
        <div className="flex flex-wrap items-center gap-2"><b>Monitor</b>
          <span>{s.worker?.lease?.heartbeat_at ? `heartbeat ${new Date(s.worker.lease.heartbeat_at).toLocaleTimeString()} · block ${s.worker.lease.last_block ?? "—"}` : "not running yet"}</span>
          <span className="text-xs text-muted">delay p50 {s.worker?.p50 ?? "—"} ms · p95 {s.worker?.p95 ?? "—"} ms · {s.worker?.samples ?? 0} samples · {s.worker?.lastConsensus ?? ""}</span></div>
        <div className="flex items-center gap-2">Emergency pause: <b>{s.control?.emergency_paused ? "ON" : "OFF"}</b>
          <Button type="button" variant="outline" disabled={!perms.emergency} title={perms.emergency ? undefined : SUPER_ONLY} onClick={() => run({ action: "emergency", paused: !s.control?.emergency_paused })}>{s.control?.emergency_paused ? "Resume" : "Pause all"}</Button></div>
      </div>
      <div className="rounded-lg border border-hairline bg-card p-3 text-sm space-y-1">
        <b>Router V4 venues (live read)</b>
        {s.registry ? <>
          <p className="text-xs text-muted break-all">Owner {s.registry.owner} · {s.registry.paused ? "paused" : "running"} · global fee {s.registry.globalFeeBps} bp</p>
          {s.registry.routers.map((r: any) => <p key={r.id} className="text-xs break-all">#{r.id} {r.name} ({r.type}) {r.active ? "active" : "inactive"} · {r.router}</p>)}
        </> : <p className="text-xs text-muted">Unavailable</p>}
        {s.candidates?.map((c: any) => <div key={c.key} className="text-xs border-t border-hairline pt-1">
          <b>{c.name}</b> · {c.recommendation === "DO_NOT_REGISTER" ? "not recommended" : "optional"} — {c.evidence}
          <Button type="button" variant="outline" className="ml-2" disabled={!perms.registryPreview} title={perms.registryPreview ? undefined : SUPER_ONLY} onClick={async () => { try { const j = await call(wallet, { action: "registry_preview", key: c.key }); setPreview(j.preview); } catch (e: any) { setErr(e.message); } }}>Preview owner transaction</Button>
        </div>)}
        {preview && <pre className="whitespace-pre-wrap break-all text-[11px] text-muted">{JSON.stringify(preview, null, 1)}</pre>}
        <p className="text-xs text-muted">Registry changes are disabled here; previews are for owner review only.</p>
      </div>
      <AutoTradePaperForm key={wallet} wallet={wallet} pairs={s.pairs} role={s.viewer?.role} permissions={perms} onCreated={load} />
      {!perms.emergency && <p className="text-xs text-muted">Emergency pause, canary review, infrastructure checks and registry previews are disabled for your role (super admin only).</p>}
      {!perms.controlAllPaper && <p className="text-xs text-muted">Showing only paper orders created by your account.</p>}
      <div className="space-y-2">
        {s.orders.map((o: any) => (
          <div key={o.id} className="rounded-lg border border-hairline bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b>{o.pair}</b><span>{o.mode}</span><span className="font-mono">{o.state}</span><span className="text-xs text-muted">{o.id.slice(0, 8)}</span></div>
            {o.last_decision && <p className="mt-1 break-words text-xs text-muted">{o.last_decision.kind}: {o.last_decision.reason ?? o.last_decision.leg?.side} · out {o.last_decision.quote?.amountOut ?? "—"}</p>}
            <div className="mt-2 flex flex-wrap gap-2">{["tick", "pause", "resume", "cancel"].map((a) => <Button type="button" variant="outline" key={a} onClick={() => run({ action: a, id: o.id })}>{a === "tick" ? "Check now" : a}</Button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
