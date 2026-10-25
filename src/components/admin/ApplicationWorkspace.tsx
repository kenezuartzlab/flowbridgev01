// Private responses are fetched only after the server's admin gate.
import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchApplicationReadiness } from "@/lib/admin/adminApi";
import { LaunchPreparation } from "./LaunchPreparation";

export function ApplicationWorkspace({ wallet }: { wallet: string }) {
  const [ready, setReady] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null); setReady(null);
    fetchApplicationReadiness(wallet)
      .then(setReady)
      .catch((e) => setError(e?.message ?? "Application information unavailable"));
  }, [wallet]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <section className="space-y-3 border-b border-hairline py-4">
        <div className="flex items-center justify-between gap-2">
          <div><p className="fb-eyebrow">Private · noindex</p><h2 className="text-base font-bold">BOT Application</h2></div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw />Refresh</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!ready && !error && <p className="text-sm text-muted">Reading current application evidence…</p>}
        {ready && <>
          <dl className="space-y-2 text-xs">{Object.entries(ready.status).map(([key,value]) => <div key={key}><dt className="font-bold">{key}</dt><dd className="break-words text-muted">{String(value)}</dd></div>)}</dl>
          <p className="text-xs text-muted">{ready.supportPosition}</p>
          <p className="text-xs text-muted">{ready.scope}</p>
        </>}
      </section>
      {ready && <>
        <section className="space-y-3 border-b border-hairline py-4">
          <h2 className="text-base font-bold">Copy-ready application answers</h2>
          {ready.formOrder?.verified === false && <p className="text-xs text-destructive">{ready.formOrder.reason}</p>}
          <ol className="space-y-3">{ready.fields.map((field: any) => <li key={field.id} className="border-b border-hairline pb-3">
            <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold">{field.label}</p>
              {field.status !== "owner" && <Button variant="ghost" size="icon" title={`Copy ${field.label}`} onClick={() => navigator.clipboard?.writeText(field.value)}><Copy /></Button>}
            </div>
            {field.status === "owner" ? <p className="text-xs font-bold text-destructive">OWNER ACTION — personally review and accept in the official form. Not accepted or submitted.</p> : <p className="whitespace-pre-line break-words text-xs text-muted">{field.value}</p>}
            {field.note && <p className="mt-1 text-xs text-muted">{field.note}</p>}
          </li>)}</ol>
        </section>
        <section className="space-y-3 border-b border-hairline py-4">
          <h2 className="text-base font-bold">VERIFIED SMART CONTRACTS &amp; ON-CHAIN INFRASTRUCTURE</h2>
          <ul className="space-y-3">{ready.contracts.map((contract: any) => <li key={`${contract.chainId}:${contract.address}`}>
            <p className="text-xs font-bold">{contract.name} · {contract.network} · {contract.chainId}</p>
            <p className="text-xs text-muted">{contract.state} — {contract.role}</p>
            <a href={contract.explorer} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-primary">{contract.address}</a>
            <p className="text-xs text-muted">{contract.verification} · Code: {contract.hasCode === true ? "present" : "UNVERIFIED"}</p>
          </li>)}</ul>
          <p className="text-xs text-muted">Block {ready.block} · {ready.generatedAt}. Historical and quarantined replacements excluded from the current registry.</p>
        </section>
      </>}
      <LaunchPreparation wallet={wallet} />
    </div>
  );
}
