import { useEffect, useState, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { PHASE_LABEL } from "@/lib/liquidity/lifecycle";
import type { TxStepView, ApprovalNeed } from "./useLiquidityTx";
import type { Token } from "@/lib/swap/tokenRegistry";
import { ModalPortal } from "@/modals/ModalPortal";

export function fmt(v: bigint | null | undefined, dec: number, max = 6): string {
  if (v == null) return "—";
  const s = formatUnits(v, dec);
  const [i, f = ""] = s.split(".");
  const ff = f.slice(0, max).replace(/0+$/, "");
  return ff ? `${i}.${ff}` : i;
}

export function safeParse(v: string, dec: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(v.trim()) || !v.trim() || v.trim() === ".") return null;
  try { return parseUnits(v.trim(), dec); } catch { return null; }
}

export function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12px]">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`min-w-0 break-all text-right font-bold ${mono ? "font-mono text-[11px]" : ""}`}>{v}</span>
    </div>
  );
}

export function TokenSelect({ label, tokens, value, onChange, exclude }: { label: string; tokens: Token[]; value: string; onChange: (a: string) => void; exclude?: string }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="fb-eyebrow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-hairline bg-card px-3 text-[13px] font-bold">
        <option value="">Select token</option>
        {tokens.filter((t) => t.address !== exclude).map((t) => <option key={t.address} value={t.address}>{t.symbol}</option>)}
      </select>
    </label>
  );
}

export function AmountInput({ label, value, onChange, balance, readOnly }: { label: string; value: string; onChange?: (v: string) => void; balance?: string; readOnly?: boolean }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="fb-eyebrow">{label}</span>
        {balance != null && <span className="text-[11px] text-muted">Balance {balance}</span>}
      </span>
      <input inputMode="decimal" autoComplete="off" value={value} readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value.replace(",", "."))} placeholder="0.0"
        className="mt-1 h-11 w-full rounded-xl border border-hairline bg-card px-3 font-mono text-[15px] font-bold read-only:bg-card-alt" />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-card p-1">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={`min-h-9 shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 text-[12px] font-bold transition-colors motion-reduce:transition-none disabled:opacity-40 ${value === o.id ? "bg-primary text-primary-foreground" : "text-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const c = tone === "error" ? "border-danger/40 text-danger" : tone === "warn" ? "border-warning/40 text-warning" : "border-hairline text-muted";
  return <p className={`rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${c}`}>{children}</p>;
}

export function TxProgress({ steps, leftover, onClear, busy, explorer }: { steps: TxStepView[]; leftover: ApprovalNeed[]; onClear: (a: ApprovalNeed) => void; busy: boolean; explorer: string }) {
  if (!steps.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-hairline p-3" aria-live="polite">
      <p className="fb-eyebrow">{steps.length} transaction{steps.length === 1 ? "" : "s"}</p>
      {steps.map((s, i) => (
        <div key={i} className="text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-bold">{i + 1}. {s.label}</span>
            <span className={`shrink-0 font-bold ${s.phase === "confirmed" ? "text-success" : s.phase === "failed" ? "text-danger" : "text-muted"}`}>{PHASE_LABEL[s.phase]}</span>
          </div>
          {s.hash && <a className="font-mono text-[10.5px] text-primary" href={`${explorer}/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.hash.slice(0, 18)}…</a>}
          {s.error && <p className="text-[11px] text-danger">{s.error}</p>}
        </div>
      ))}
      {leftover.map((a) => (
        <div key={a.token + a.spender} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-warning">Leftover {a.symbol} approval remains</span>
          <button type="button" disabled={busy} onClick={() => onClear(a)} className="rounded-lg border border-hairline px-2 py-1 font-bold">Clear (sign)</button>
        </div>
      ))}
    </div>
  );
}

export function ReviewModal({ open, title, rows, approvals, notes, onConfirm, onClose, confirmLabel, busy }: {
  open: boolean; title: string; rows: [string, ReactNode][]; approvals: ApprovalNeed[]; notes?: string[];
  onConfirm: () => void; onClose: () => void; confirmLabel: string; busy: boolean;
}) {
  const [ack, setAck] = useState(false);
  useEffect(() => { if (open) setAck(false); }, [open]);
  if (!open) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-background/70 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-hairline bg-card p-4 sm:rounded-3xl" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-black">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-xl border border-hairline">×</button>
          </div>
          <div className="mt-3 divide-y divide-hairline">{rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</div>
          <div className="mt-3">
            <p className="fb-eyebrow">Approvals ({approvals.length})</p>
            {approvals.length === 0 ? <p className="text-[12px] text-muted">No token approval needed.</p> : approvals.map((a) => (
              <Row key={a.token} k={`Exact ${a.symbol}`} v={<span className="font-mono text-[11px]">spender {a.spender.slice(0, 8)}…{a.spender.slice(-4)}</span>} />
            ))}
          </div>
          {notes?.map((n) => <p key={n} className="mt-2 text-[11.5px] leading-relaxed text-muted">{n}</p>)}
          <label className="mt-3 flex items-start gap-2 text-[12px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>I reviewed the amounts, minimums and approvals. Each transaction will ask my wallet for a signature.</span>
          </label>
          <button type="button" disabled={!ack || busy} onClick={onConfirm}
            className="mt-3 h-12 w-full rounded-2xl bg-primary text-[14px] font-black text-primary-foreground disabled:opacity-40">
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
