/** Ops: vote-reward payout wallet, kill switch/caps, and crediting a period after BOT Chain pays. */
import { useEffect, useState } from "react";
import { getIdToken } from "@/lib/auth";

async function call(wallet: string, body?: unknown) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  const r = await fetch("/api/admin/voter-rewards", { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-wallet-address": wallet }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`);
  return j;
}
const n = (v: unknown) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
const input = "w-full rounded-lg border border-hairline bg-card px-2 py-1.5 text-sm";

export function VoterRewardsTab({ wallet }: { wallet: string }) {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", startsAt: "", endsAt: "", botReceived: "" });
  const [preview, setPreview] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const load = () => call(wallet).then((d) => { setS(d); setCfg(d.config); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = () => ({ label: form.label, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), botReceived: Number(form.botReceived) });
  const run = async (f: () => Promise<void>) => { setErr(null); try { await f(); } catch (e: any) { setErr(e.message); } };

  if (!s) return <p className="text-sm text-muted">{err ?? "Loading…"}</p>;
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="rounded-xl border border-hairline p-3 text-sm">
        <p className="font-bold">Payout wallet</p>
        {s.wallet.configured ? <p className="mt-1 break-all">{s.wallet.address}<br />FLOW {n(s.wallet.flow)} · BOT gas {n(s.wallet.bot)}</p> : <p className="mt-1 text-destructive">Not set up — the payout key secret is missing.</p>}
        <p className="mt-2">Paid {n(s.claims.confirmed)} FLOW · in flight {n(s.claims.inFlight)} · failed (restored) {n(s.claims.failed)}</p>
        <p className="mt-1">Vote counting: {s.indexer?.halted ? <span className="text-destructive">HALTED — {s.indexer.halt_reason}</span> : `OK through block ${s.indexer?.last_block ?? "—"}`}</p>
      </div>

      {cfg && <div className="space-y-2 rounded-xl border border-hairline p-3 text-sm">
        <p className="font-bold">Claims</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Claims open</label>
        {[["min_claim_flow", "Minimum claim (FLOW)"], ["per_claim_cap_flow", "Per-claim cap (FLOW)"], ["daily_cap_flow", "Daily cap (FLOW)"]].map(([k, l]) => (
          <label key={k} className="block">{l}<input className={input} type="number" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>))}
        <button type="button" className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground" onClick={() => run(async () => { await call(wallet, { action: "config", enabled: cfg.enabled, minClaimFlow: Number(cfg.min_claim_flow), perClaimCapFlow: Number(cfg.per_claim_cap_flow), dailyCapFlow: Number(cfg.daily_cap_flow) }); await load(); })}>Save</button>
      </div>}

      <div className="space-y-2 rounded-xl border border-hairline p-3 text-sm">
        <p className="font-bold">Credit a period (after BOT Chain's payment arrives)</p>
        <label className="block">Label<input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Week of Nov 3" /></label>
        <label className="block">Start<input className={input} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
        <label className="block">End<input className={input} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        <label className="block">BOT received<input className={input} type="number" value={form.botReceived} onChange={(e) => setForm({ ...form, botReceived: e.target.value })} /></label>
        <button type="button" className="rounded-lg border border-primary px-3 py-1.5 font-bold text-primary" onClick={() => run(async () => setPreview(await call(wallet, { action: "preview", ...p() })))}>Preview</button>
        {preview && <div className="rounded-lg bg-card p-2">
          <p>{preview.voters} voters · {n(preview.totalFlow)} FLOW total · 1 BOT = {n(preview.flowPerBot)} FLOW</p>
          <ul className="mt-1 text-xs">{preview.top.map((c: any) => <li key={c.wallet}>{c.wallet.slice(0, 6)}…{c.wallet.slice(-4)} · {c.votes} votes · {n(c.flow)} FLOW</li>)}</ul>
          <button type="button" className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground" onClick={() => run(async () => { await call(wallet, { action: "credit", ...p(), approvedFlowPerBot: preview.flowPerBot }); setPreview(null); await load(); })}>Approve &amp; credit balances</button>
        </div>}
      </div>

      <div className="rounded-xl border border-hairline p-3 text-sm">
        <p className="font-bold">Credited periods</p>
        {s.periods.length === 0 ? <p className="text-muted">None yet.</p> : s.periods.map((x: any) => <p key={x.id}>{x.label}: {n(x.bot_received)} BOT → {n(x.total_flow)} FLOW to {x.voter_count} voters</p>)}
      </div>
    </div>
  );
}
