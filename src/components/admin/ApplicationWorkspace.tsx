// PRIVATE admin-only BOT Ecosystem Support application workspace.
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Download, Copy, RefreshCw } from "lucide-react";
import { fetchApplicationMaterials, fetchApplicationReadiness } from "@/lib/admin/adminApi";
import whitepaper from "@/assets/whitepaper.pdf.asset.json";
import awards from "@/assets/builder-challenge-awards.jpg.asset.json";
import {
  ANTI_CHEATING_NOTICE,
  AWARD_CREDENTIAL,
  CONTRACT_REGISTRY,
  CORE_HIGHLIGHTS,
  OWNER_INPUT,
  SCHEME_A_RULES,
  applicationFields,
} from "@/lib/application/applicationProfile";

type Material = { id: string; title: string; url: string | null };

function abs(u: string) {
  return typeof window === "undefined" ? u : new URL(u, window.location.origin).toString();
}
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmt = (n: number, unit: string) => (unit === "USD" ? usd(n) : n.toLocaleString());

export function ApplicationWorkspace({ wallet }: { wallet: string }) {
  const [files, setFiles] = useState<Material[] | null>(null);
  const [ready, setReady] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rErr, setRErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    setRErr(null);
    fetchApplicationMaterials(wallet).then((r) => setFiles(r.files)).catch((e) => setErr(e?.message ?? "Failed"));
    setReady(null);
    fetchApplicationReadiness(wallet).then(setReady).catch((e) => setRErr(e?.message ?? "Failed"));
  }, [wallet]);
  useEffect(() => { load(); }, [load]);

  const fields = applicationFields({ whitepaperUrl: abs(whitepaper.url) });
  const owners = fields.filter((f) => f.status === "owner");
  const stamp = new Date().toISOString().slice(0, 10);

  const exp = {
    whitepaper: () => window.open(whitepaper.url, "_blank"),
    registry: () => download(`flowbridge-contract-registry-${stamp}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), contracts: ready?.contracts ?? CONTRACT_REGISTRY }, null, 2)),
    explorer: () => download(`flowbridge-explorer-evidence-${stamp}.json`, JSON.stringify({ generatedAt: ready?.generatedAt, block: ready?.block, contracts: ready?.contracts, rawSwapLedger: ready?.rawLedger, reportingView: ready?.reportingView }, null, 2)),
    award: () => download(`flowbridge-award-proof-${stamp}.json`, JSON.stringify({ credential: AWARD_CREDENTIAL, handle: "@flowbridgeweb3", graphic: abs(awards.url), note: "Not the overall Grand Prize." }, null, 2)),
    liquidity: () => download(`flowbridge-liquidity-evidence-${stamp}.json`, JSON.stringify({ generatedAt: ready?.generatedAt, block: ready?.block, pool: ready?.pool, rules: SCHEME_A_RULES.version, tier1: ready?.tier1, concentrationFlags: ready?.concentrationFlags, window: ready?.window }, null, 2)),
    staking: () => download(`flowbridge-staking-rewards-evidence-${stamp}.json`, JSON.stringify({
      generatedAt: new Date().toISOString(),
      contracts: (ready?.contracts ?? CONTRACT_REGISTRY).filter((c: any) => /Staking|Rewards|FLOW Token/.test(c.name)),
      states: { flowPriceOracle: "address(0)", dynamicStandardRewards: "DISABLED", epochAndPublisherRoles: "UNASSIGNED", thirtyDayMaturityWithdrawal: "PENDING scheduled maturity" },
    }, null, 2)),
    summary: () => download(`flowbridge-reviewer-summary-${stamp}.md`, [
      `# FlowBridge — Reviewer Summary (${stamp})`, "", `**${AWARD_CREDENTIAL}**`, "",
      "## Core Highlights", ...CORE_HIGHLIGHTS.map((h) => `- ${h}`), "",
      "## Contracts (BOT Mainnet 677)", ...(ready?.contracts ?? CONTRACT_REGISTRY).map((c: any) => `- ${c.name}: ${c.address} — ${c.state}`), "",
      `## Scheme A readiness (${SCHEME_A_RULES.version})`,
      ...(ready?.tier1 ?? []).map((r: any) => `- ${r.metric}: ${fmt(r.current, r.unit)} / ${fmt(r.required, r.unit)} — ${r.eligible ? "Eligible" : "Not Yet Eligible"}`),
      `- Overall: ${ready?.overall ?? "not computed"}`, "",
      "## Integrity", ANTI_CHEATING_NOTICE.flowbridgeRule,
    ].join("\n"), "text/markdown"),
  };

  const Btn = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick} className="flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40">
      <Download className="h-3 w-3" />{label}
    </button>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-4">
        <p className="flex items-center gap-1.5 text-[13px] font-black text-destructive"><ShieldAlert className="h-4 w-4" />{ANTI_CHEATING_NOTICE.title}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px]">
          {ANTI_CHEATING_NOTICE.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <p className="mt-2 text-[12px] font-bold">{ANTI_CHEATING_NOTICE.flowbridgeRule}</p>
      </section>

      <section className="fb-surface space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="fb-eyebrow">Private · noindex</p>
            <h2 className="text-[16px] font-black">BOT application fields</h2>
          </div>
          <button type="button" onClick={load} className="flex items-center gap-1 text-[11px] font-bold text-primary"><RefreshCw className="h-3 w-3" />Refresh</button>
        </div>
        <ul className="space-y-2">
          {fields.map((f) => (
            <li key={f.id} className="rounded-xl border border-hairline p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold">{f.label}</span>
                {f.status === "owner" ? (
                  <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-black text-destructive">{OWNER_INPUT}</span>
                ) : f.status === "private" ? (
                  <span className="rounded-md bg-muted/30 px-2 py-0.5 text-[10px] font-black">PRIVATE</span>
                ) : (
                  <button type="button" onClick={() => navigator.clipboard?.writeText(f.value)} className="flex items-center gap-1 text-[10px] font-bold text-primary"><Copy className="h-3 w-3" />Copy</button>
                )}
              </div>
              {f.status !== "owner" && <p className="mt-1 whitespace-pre-line break-all text-[12px] text-muted">{f.value}</p>}
              {f.note && <p className="mt-1 text-[11px] text-muted">{f.note}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="fb-surface space-y-3 p-4">
        <p className="fb-eyebrow">Scheme A · DEX Incentive Support</p>
        <h2 className="text-[16px] font-black">Readiness — Tier 1</h2>
        <p className="text-[11px] text-muted">Rules snapshot {SCHEME_A_RULES.version} · checked {SCHEME_A_RULES.checkedAt} · {SCHEME_A_RULES.source}</p>
        {rErr && <p className="text-[12px] text-destructive">{rErr}</p>}
        {!ready && !rErr && <p className="text-[12px] text-muted">Reading BOT Mainnet…</p>}
        {ready && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[10.5px] uppercase text-muted"><tr><th className="py-1">Metric</th><th>Current</th><th>Required</th><th>Status</th></tr></thead>
                <tbody>
                  {ready.tier1.map((r: any) => (
                    <tr key={r.metric} className="border-t border-hairline align-top">
                      <td className="py-2 pr-2">{r.metric}<p className="text-[10.5px] text-muted">{r.note}</p></td>
                      <td className="pr-2 font-bold">{fmt(r.current, r.unit)}</td>
                      <td className="pr-2">{fmt(r.required, r.unit)}</td>
                      <td className={r.eligible ? "font-black text-primary" : "font-black text-destructive"}>{r.eligible ? "Eligible" : "Not Yet Eligible"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px]">Overall: <b className={ready.overall === "ELIGIBLE" ? "text-primary" : "text-destructive"}>{ready.overall}</b> · {ready.uniqueWallets} unique wallets · max single-wallet daily share {(ready.maxDailyShare * 100).toFixed(1)}%</p>
            {ready.concentrationFlags.length > 0 && <p className="text-[11px] text-destructive">Over 40% daily concentration: {ready.concentrationFlags.join("; ")}</p>}
            <p className="text-[10.5px] text-muted">Block {ready.block} · {ready.generatedAt} · Pool {ready.pool.address} · {ready.pool.flow.inPool.toLocaleString()} {ready.pool.flow.symbol} + {ready.pool.usdt.inPool.toLocaleString()} {ready.pool.usdt.symbol}</p>
            <ul className="list-disc pl-4 text-[10.5px] text-muted">{SCHEME_A_RULES.countingRules.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="text-[10.5px] text-muted">{SCHEME_A_RULES.portalDifference}</p>
          </>
        )}
      </section>

      <section className="fb-surface space-y-3 p-4">
        <p className="fb-eyebrow">Private exports</p>
        {err && <p className="text-[12px] text-destructive">{err}</p>}
        <div className="flex flex-wrap gap-2">
          {files?.map((f) => (
            <Btn key={f.id} label={f.id === "dossier" ? "Application dossier" : "Pitch deck"} disabled={!f.url} onClick={() => window.open(f.url!, "_blank")} />
          ))}
          <Btn label="Whitepaper" onClick={exp.whitepaper} />
          <Btn label="Contract registry" onClick={exp.registry} />
          <Btn label="Explorer evidence" onClick={exp.explorer} disabled={!ready} />
          <Btn label="Award proof" onClick={exp.award} />
          <Btn label="Liquidity evidence" onClick={exp.liquidity} disabled={!ready} />
          <Btn label="Staking / rewards evidence" onClick={exp.staking} />
          <Btn label="Reviewer summary" onClick={exp.summary} disabled={!ready} />
        </div>
        <div className="flex flex-wrap gap-2">
          {files?.filter((f) => f.url).map((f) => (
            <button key={f.id} type="button" onClick={() => navigator.clipboard?.writeText(f.url!)} className="text-[11px] font-bold text-primary">Copy private {f.id} link (7 days)</button>
          ))}
        </div>
        <p className="text-[11px] text-muted">Owner inputs remaining: {owners.map((o) => o.label).join(", ")}</p>
      </section>
    </div>
  );
}
