import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AutoTradeRequestError, callAutoTrade } from "@/lib/autotrade/clientRequest";
import { budgetEquivalent, buildPaperRequest, paperCreateBody, type PaperCreateBody, type PaperDraft, type PaperReference } from "@/lib/autotrade/paperForm";
import { pairById } from "@/lib/autotrade/config";

const input = "min-h-11 w-full min-w-0 rounded-md border border-hairline bg-card px-3 py-2 text-sm";
export function AutoTradePaperForm({ wallet, pairs, role, onCreated }: { wallet: string; pairs: string[]; role?: string; onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState<PaperDraft>({ pair: "CA/BOT", budgetUnit: "QUOTE" });
  const [reference, setReference] = useState<PaperReference | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState<PaperCreateBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const referenceGeneration = useRef(0);
  const lock = useRef(false);
  const unknownResult = useRef(false);
  const notice = useRef<HTMLParagraphElement>(null);
  const pair = pairById(draft["pair"] ?? "CA/BOT");
  const quote = pair?.quote.symbol ?? "BOT", base = pair?.base.symbol ?? "CA";
  const storageKey = `autotrade-paper-request:${wallet.toLowerCase()}`;
  useEffect(() => {
    try { const raw = sessionStorage.getItem(storageKey); if (raw) { const saved = paperCreateBody.parse(JSON.parse(raw)); if (saved.requestId) { setReview(saved); setDraft({ pair: saved.pair }); setAttempted(true); unknownResult.current = true; setError("A previous paper request has an unknown result. Refresh orders or retry this unchanged request to check it safely."); } } } catch { /* Invalid local drafts cannot authorize a request. */ }
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [storageKey]);
  const fresh = reference !== null && reference.pair === pair?.id && reference.expiresAt > now;
  const edit = (key: string, value: string) => { setDraft(prev => ({ ...prev, [key]: value })); setReview(null); setError(null); setSuccess(null); };
  const readReference = async (force = false) => {
    if ((reading && !force) || !pair || role === "internal_operator") return;
    const generation = ++referenceGeneration.current;
    const selectedPair = pair.id;
    setReading(true); setReferenceError(null); setReference(null);
    try { const result = await callAutoTrade(wallet, { action: "paper_reference", pair: selectedPair }); if (generation === referenceGeneration.current) setReference(result.reference); }
    catch (e) { if (generation === referenceGeneration.current) setReferenceError(e instanceof Error ? e.message : "Reference unavailable. Retry."); }
    finally { if (generation === referenceGeneration.current) setReading(false); }
  };
  useEffect(() => { setReference(null); void readReference(true); return () => { referenceGeneration.current++; }; }, [draft["pair"]]); // eslint-disable-line react-hooks/exhaustive-deps
  let equivalent: string | null = null;
  try { if (fresh && reference?.usdtPerBot && draft["budgetUnit"] !== "USDT_EQUIVALENT" && draft["budget"]) equivalent = budgetEquivalent(draft["budget"], reference.usdtPerBot); } catch { /* Validation is shown on review. */ }
  const prepare = () => {
    setError(null);
    try { setReview(buildPaperRequest(draft, reference, Date.now())); }
    catch (e) { setError(e instanceof Error ? e.message : "Check the order values."); requestAnimationFrame(() => notice.current?.focus()); }
  };
  const submit = async () => {
    if (lock.current || !review || success) return;
    lock.current = true; setBusy(true); setError(null);
    const request = { ...review, requestId: review.requestId ?? crypto.randomUUID() };
    setReview(request); setAttempted(true);
    try {
      // Persist before any send so a reload can only replay this same id.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      const result = await callAutoTrade(wallet, request);
      if (!result.ok || !result.id) throw new Error("No saved order confirmation returned. Refresh orders or retry this unchanged request.");
      sessionStorage.removeItem(storageKey);
      setSuccess(`Paper order ${String(result.id).slice(0, 8)} saved. No real trade was placed.`);
      try { await onCreated(); } catch { setError("Order saved, but the list could not refresh. Use Refresh orders; do not create it again."); }
    } catch (e) {
      if (e instanceof AutoTradeRequestError && [400, 401, 403, 409].includes(e.status) && !unknownResult.current) {
        setAttempted(false); sessionStorage.removeItem(storageKey);
      } else { unknownResult.current = true; }
      setError(e instanceof Error ? e.message : "Paper request failed. Refresh orders before retrying.");
    }
    finally { setBusy(false); lock.current = false; requestAnimationFrame(() => notice.current?.focus()); }
  };
  const fields: [string, string, string][] = [
    ["budget", draft["budgetUnit"] === "USDT_EQUIVALENT" ? "Budget (USDT equivalent)" : `Budget (${quote})`, "decimal"],
    ["maxBuyPrice", `Buy at or below (${quote} per ${base})`, "decimal"],
    ["minSellPrice", `Sell at or above (${quote} per ${base})`, "decimal"],
    ["stopPrice", `Stop below (${quote} per ${base}, optional)`, "decimal"],
    ["slippagePercent", "Slippage (%)", "decimal"], ["maxGasNative", "Max gas per leg (BOT)", "decimal"],
    ["maxLoss", `Max loss (${quote})`, "decimal"], ["expiresInMinutes", "Expires in (minutes)", "numeric"],
  ];
  return <section className="space-y-3 border-t border-hairline pt-4" aria-label="Paper order">
    <h3 className="font-semibold">Create a paper order</h3>
    <p className="text-xs text-muted">Simulation only · single buy/sell cycle · repeat OFF. The approved 5 USDT-equivalent live canary cap is separate; these paper parameters do not authorize gas, signing or real trading.</p>
    {role && <p role="status" className="text-xs text-muted">{role === "super_admin" ? "Super-admin access · connected bound wallet verified for this read." : "Read-only operator access. Paper creation requires your approved super-admin account and its connected bound wallet."}</p>}
    <div className="space-y-1 text-xs" aria-live="polite">
      {fresh && reference ? <><p>Indicative net sell reference: 1 {base} ≈ {reference.price} {quote} · block {reference.block}</p><p>Inverse: 1 {quote} ≈ {reference.inverse} {base}. Fees and trade size affect actual quotes; this is not a chosen target.</p></> : <p className="text-muted">{reading ? "Reading current reference…" : "Reference unavailable or expired; no market price assumed."}</p>}
      {referenceError && <p className="text-destructive">{referenceError}</p>}
      <Button type="button" variant="outline" className="min-h-11" disabled={reading} onClick={() => void readReference()}>{reading ? "Reading…" : "Refresh reference"}</Button>
    </div>
    {!review && <form onSubmit={e => { e.preventDefault(); prepare(); }} noValidate className="space-y-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0 text-xs">Pair<select className={input} value={draft["pair"] ?? "CA/BOT"} onChange={e => { setDraft({ pair: e.target.value, budgetUnit: "QUOTE" }); setReference(null); setError(null); }}>{pairs.map(p => <option key={p}>{p}</option>)}</select></label>
        {quote === "BOT" && <label className="min-w-0 text-xs">Budget entry<select className={input} value={draft["budgetUnit"] ?? "QUOTE"} onChange={e => { edit("budgetUnit", e.target.value); setDraft(prev => ({ ...prev, budget: "" })); }}><option value="QUOTE">BOT</option><option value="USDT_EQUIVALENT">USDT equivalent</option></select></label>}
        {fields.map(([key, label, mode]) => <label key={key} className="min-w-0 text-xs">{label}<input className={input} name={key} inputMode={mode === "numeric" ? "numeric" : "decimal"} autoComplete="off" value={draft[key] ?? ""} onChange={e => edit(key, e.target.value)} /></label>)}
      </div>
      {quote === "BOT" && <p className="text-xs text-muted">{equivalent !== null ? `Budget ≈ ${equivalent} USDT (indicative, expires with the reference).` : draft["budgetUnit"] === "USDT_EQUIVALENT" ? "A fresh reference and parameter review are required for conversion to BOT." : "USDT equivalent unavailable until a fresh reference and BOT budget are entered."}</p>}
      <p className="text-xs text-muted">Buy: {draft["maxBuyPrice"] || "not entered"} · Sell: {draft["minSellPrice"] || "not entered"} {quote} per {base} · Slippage: {draft["slippagePercent"] || "not entered"}%</p>
      <Button type="submit" className="min-h-11" disabled={role === "internal_operator"}>Create paper order</Button>
    </form>}
    {review && <div className="space-y-2 text-sm">
      <h4 className="font-semibold">Review paper parameters</h4>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 break-words">
        <dt>Pair</dt><dd>{review.pair}</dd><dt>Budget</dt><dd>{review.reviewedBudget ?? review.budget} {quote}{review.budgetUnit === "USDT_EQUIVALENT" ? ` (from ${review.budget} USDT equivalent; rechecked on save)` : ""}</dd>
        <dt>Buy ≤</dt><dd>{review.maxBuyPrice} {quote} per {base}</dd><dt>Sell ≥</dt><dd>{review.minSellPrice} {quote} per {base}</dd>
        <dt>Stop</dt><dd>{review.stopPrice ?? "None"}</dd><dt>Slippage</dt><dd>{review.slippageBps / 100}%</dd>
        <dt>Gas / leg</dt><dd>{review.maxGasNative} BOT (simulation limit)</dd><dt>Max loss</dt><dd>{review.maxLoss} {quote}</dd><dt>Expiry</dt><dd>{review.expiresInMinutes} minutes from save</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {!success && <Button type="button" className="min-h-11" disabled={busy} onClick={() => void submit()}>{busy ? "Saving paper order…" : attempted ? "Retry same paper request" : "Confirm paper order"}</Button>}
        {!attempted && <Button type="button" variant="outline" className="min-h-11" onClick={() => setReview(null)}>Edit parameters</Button>}
        {success && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setReview(null); setDraft({ pair: "CA/BOT", budgetUnit: "QUOTE" }); setSuccess(null); setError(null); setAttempted(false); unknownResult.current = false; }}>New paper order</Button>}
        {attempted && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={async () => { try { await onCreated(); } catch { setError("Could not refresh orders. Check your session and connection."); } }}>Refresh orders</Button>}
      </div>
    </div>}
    <p ref={notice} tabIndex={-1} role={error ? "alert" : "status"} aria-live="polite" className={error ? "break-words text-sm text-destructive" : "break-words text-sm text-muted"}>{error ?? success ?? (busy ? "Saving… Keep this page open." : "")}</p>
  </section>;
}