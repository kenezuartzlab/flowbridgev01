import { OFFICIAL_LAUNCH_AT, SOCIAL_WINDOW_ENDS_AT, INTERACTION_WINDOW_ENDS_AT, windowStatus } from "@/lib/application/officialLaunch";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, RefreshCw, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchLaunchPreparation, saveLaunchPreparation, uploadLaunchScreenshot, downloadLaunchScreenshot } from "@/lib/admin/adminApi";
import { launchEvidenceSchema, type LaunchTracker, type LaunchEvidence } from "@/lib/application/launchTracker";

export function LaunchPreparation({ wallet }: { wallet: string }) {
  const [tracker, setTracker] = useState<LaunchTracker | null>(null);
  const [drafts, setDrafts] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [kind, setKind] = useState<LaunchEvidence["kind"]>("transaction");
  const [coreFunction, setCoreFunction] = useState<LaunchEvidence["coreFunction"]>("Trade");
  const [url, setUrl] = useState(""); const [timestamp, setTimestamp] = useState("");
  const [address, setAddress] = useState(""); const [hash, setHash] = useState("");
  const [notes, setNotes] = useState(""); const [screenshot, setScreenshot] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const data = await fetchLaunchPreparation(wallet); setTracker(data.tracker); setDrafts(data.drafts); }
    catch (e) { setError(e instanceof Error ? e.message : "Private launch preparation unavailable"); }
    finally { setBusy(false); }
  }, [wallet]);
  useEffect(() => { void load(); }, [load]);
  const save = async (next: LaunchTracker) => {
    setBusy(true); setError(""); setSaved(false);
    try { const data = await saveLaunchPreparation(wallet, next); setTracker(data.tracker); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Evidence could not be saved"); }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!tracker) return;
    const row = launchEvidenceSchema.safeParse({ id: crypto.randomUUID(), kind, url, timestamp, wallet: address, transactionHash: hash, coreFunction, notes, screenshot });
    if (!row.success) { setError(row.error.issues[0]?.message ?? "Check evidence fields"); return; }
    await save({ ...tracker, evidence: [...tracker.evidence, row.data] });
  };
  const downloadDrafts = () => {
    const link = document.createElement("a"); const objectUrl = URL.createObjectURL(new Blob([drafts], { type: "text/markdown" }));
    link.href = objectUrl; link.download = "FlowBridge_Pre_Day_0_Private_Drafts.md"; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
  return <section className="min-w-0 space-y-4 border-t border-hairline py-5">
    <div className="flex items-start justify-between gap-2"><div><p className="fb-eyebrow">Private · owner-controlled</p><h2 className="text-base font-bold">BOT launch / grant evidence — Day 0 started</h2></div><Button size="icon" variant="ghost" title="Refresh launch preparation" disabled={busy} onClick={load}><RefreshCw /></Button></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {!tracker && !error && <p className="text-xs text-muted">Reading private launch preparation…</p>}
    {tracker && <>
      <dl className="grid gap-3 text-xs sm:grid-cols-2">{([["OFFICIAL LAUNCH DATE", OFFICIAL_LAUNCH_AT], ["30-DAY SOCIAL WINDOW", `${OFFICIAL_LAUNCH_AT} → ${SOCIAL_WINDOW_ENDS_AT}`], ["8-DAY USER/INTERACTION WINDOW", `${OFFICIAL_LAUNCH_AT} → ${INTERACTION_WINDOW_ENDS_AT}`], ["DAY 8 STATUS", windowStatus(INTERACTION_WINDOW_ENDS_AT)], ["DAY 30 STATUS", windowStatus(SOCIAL_WINDOW_ENDS_AT)]] as const).map(([label, v]) => <div key={label}><dt className="font-bold">{label}</dt><dd className="mt-1 break-all text-muted">{v}</dd></div>)}</dl>
      <p className="text-xs text-muted">Option A: REQUESTED · Monitoring pending BOT Chain approval/onboarding · Compliance: OWNER ACTION. Application not submitted.</p>
      <p className="text-xs text-muted">Evidence entries are owner-supplied source records, not verified eligibility or independent-user counts. Day 0 is fixed in code and cannot be moved from here.</p>
      <h3 className="text-sm font-bold">Genuine source evidence</h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">Evidence type<Select value={kind} onValueChange={(v: LaunchEvidence["kind"]) => setKind(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["launch_article", "Launch article"], ["launch_x", "Official launch X post"], ["x_post", "Qualifying X candidate"], ["wallet", "Independent wallet evidence"], ["transaction", "On-chain transaction"], ["screenshot", "Screenshot"]].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-xs">Core function<Select value={coreFunction} onValueChange={(v: LaunchEvidence["coreFunction"]) => setCoreFunction(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Trade", "Bridge", "MultiSend", "Staking", "Rewards", "Flow AI", "Other"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-xs">Source / publication URL<Input aria-label="Evidence source URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
        <label className="space-y-1 text-xs">Publication timestamp (UTC)<Input aria-label="Evidence publication timestamp" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} placeholder="YYYY-MM-DDTHH:mm:ssZ" /></label>
        <label className="space-y-1 text-xs">Wallet address<Input aria-label="Evidence wallet address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" /></label>
        <label className="space-y-1 text-xs">Transaction hash<Input aria-label="Evidence transaction hash" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x…" /></label>
      </div>
      <label className="block space-y-1 text-xs">Source context / independence evidence<Textarea aria-label="Evidence context" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} /></label>
      <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { const result = await uploadLaunchScreenshot(wallet, file); setScreenshot(result.path); } catch (err) { setError(err instanceof Error ? err.message : "Screenshot upload failed"); } finally { setBusy(false); e.target.value = ""; } }} />
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => uploadRef.current?.click()}><Upload />Upload private screenshot</Button><Button size="sm" disabled={busy} onClick={add}><Plus /><Save />Save evidence</Button></div>
      {screenshot && <p className="break-all text-xs text-muted">Private screenshot uploaded; save evidence to attach it.</p>}
      {saved && <p role="status" className="text-xs text-success">Evidence saved. Launch dates unchanged.</p>}
      {tracker.evidence.length === 0 ? <p className="text-xs text-muted">No launch-window evidence recorded.</p> : <ul className="space-y-3">{tracker.evidence.map((row) => <li key={row.id} className="min-w-0 space-y-1 border-b border-hairline pb-3 text-xs"><p className="font-bold">{row.kind.replaceAll("_", " ")} · {row.coreFunction} · Owner-supplied, pending review</p>{row.url && <a href={row.url} target="_blank" rel="noreferrer" className="break-all text-primary">{row.url}</a>}<p className="break-all text-muted">{row.timestamp || "No publication timestamp"} {row.wallet} {row.transactionHash}</p><p className="whitespace-pre-wrap break-words">{row.notes}</p>{row.screenshot && <Button size="sm" variant="outline" onClick={() => downloadLaunchScreenshot(wallet, row.screenshot).catch((e) => setError(e.message))}><Download />Private screenshot</Button>}</li>)}</ul>}
      <details className="border-t border-hairline pt-4"><summary className="cursor-pointer text-sm font-bold">Official launch article, social drafts &amp; originality note — DRAFT</summary><Button className="my-3" variant="outline" size="sm" onClick={downloadDrafts}><Download />Download private drafts</Button><div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">{drafts}</div></details>
    </>}
  </section>;
}