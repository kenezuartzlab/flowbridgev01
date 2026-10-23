// Private responses are fetched only after the server's admin gate.
import { useCallback, useEffect, useState } from "react";
import { Download, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchApplicationMaterials, fetchApplicationReadiness, downloadApplicationFile } from "@/lib/admin/adminApi";
import { APPLICATION_FILES, EDITABLE_COPY_LABEL } from "@/lib/application/applicationFiles";
import { LaunchPreparation } from "./LaunchPreparation";

type Material = { id: string; title: string };
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export function ApplicationWorkspace({ wallet }: { wallet: string }) {
  const [files, setFiles] = useState<Material[]>([]);
  const [ready, setReady] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null); setReady(null);
    Promise.all([fetchApplicationMaterials(wallet), fetchApplicationReadiness(wallet)])
      .then(([materials, data]) => { setFiles(materials.files); setReady(data); })
      .catch((e) => setError(e?.message ?? "Application information unavailable"));
  }, [wallet]);
  useEffect(() => { load(); }, [load]);
  const stamp = ready?.generatedAt?.slice(0, 10) ?? "current";
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
      <section className="space-y-3 border-b border-hairline py-4">
        <h2 className="text-base font-bold">APPLICATION FILES — LATEST MASTER REFRESH</h2>
        <p className="text-xs text-muted">Admin-only downloads. Frozen v1.1 master refresh. PDFs are canonical; no expiring links.</p>
        <p className="text-xs font-bold text-muted">DOCX/PPTX: {EDITABLE_COPY_LABEL}</p>
        {[...new Set(APPLICATION_FILES.map((f) => f.group))].map((group) => <div key={group} className="space-y-1">
          <p className="text-xs font-bold">{group}</p>
          <div className="flex flex-wrap gap-2">{APPLICATION_FILES.filter((f) => f.group === group).map((f) => <Button key={f.id} variant={f.id === "package-zip" ? "default" : "outline"} size="sm" disabled={busy === f.id}
            onClick={() => { setBusy(f.id); setDlError(null); downloadApplicationFile(wallet, f.id, f.path.split("/").pop() ?? "application-file").catch((e) => setDlError(e?.message ?? "Download failed")).finally(() => setBusy(null)); }}><Download />{f.label}</Button>)}</div>
        </div>)}
        {dlError && <p className="text-xs text-destructive">{dlError}</p>}
      </section>
      <section className="space-y-3 py-4">
        <h2 className="text-base font-bold">Private reviewer materials</h2>
        <div className="flex flex-wrap gap-2">{files.map((file) => <Button key={file.id} variant="outline" size="sm" disabled={busy === file.id} onClick={() => {
          const record = APPLICATION_FILES.find(f => f.id === file.id); if (!record) return;
          setBusy(file.id); setDlError(null);
          downloadApplicationFile(wallet, file.id, record.path.split('/').pop() ?? 'application.pdf').catch(e => setDlError(e?.message ?? 'Download failed')).finally(() => setBusy(null));
        }}><Download />{file.title}</Button>)}</div>
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => download(`flowbridge-evidence-${stamp}.json`, JSON.stringify(ready, null, 2))}><Download />Evidence JSON</Button>
        <p className="text-xs text-muted">Owner information complete. Compliance confirmation remains an owner action. No application has been submitted.</p>
      </section>
      <LaunchPreparation wallet={wallet} />
    </div>
  );
}
