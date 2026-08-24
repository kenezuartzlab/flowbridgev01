/**
 * FlowBridge V25 §8/§12 — the one shared status/evidence chip.
 *
 * Presentation only. Canonical (VERIFIED) always gets the strongest treatment;
 * EXTERNAL and PREVIEW are deliberately quieter so untrusted or estimated data
 * can never read as on-chain truth.
 */
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Globe, Loader2, ShieldCheck, Wallet } from "lucide-react";
import type { EvidenceLevel, ExperienceStatus } from "@/lib/ai/experience/experienceModel";

const STATUS: Record<ExperienceStatus, { label: string; className: string; icon: ReactNode }> = {
  VERIFIED: {
    label: "Verified by FlowBridge",
    className: "bg-primary/12 text-primary",
    icon: <ShieldCheck className="h-2.5 w-2.5" />,
  },
  EXTERNAL: {
    label: "External insight",
    className: "bg-foreground/6 text-muted",
    icon: <Globe className="h-2.5 w-2.5" />,
  },
  PREVIEW: {
    label: "Preview · estimate",
    className: "bg-foreground/6 text-muted",
    icon: <FlaskConical className="h-2.5 w-2.5" />,
  },
  BLOCKED: {
    label: "Blocked",
    className: "bg-danger/12 text-danger",
    icon: <AlertTriangle className="h-2.5 w-2.5" />,
  },
  WAITING_FOR_USER: {
    label: "Your wallet confirms",
    className: "bg-primary/12 text-primary",
    icon: <Wallet className="h-2.5 w-2.5" />,
  },
  VERIFYING: {
    label: "Verifying",
    className: "bg-foreground/6 text-muted",
    icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-success/12 text-success",
    icon: <CheckCircle2 className="h-2.5 w-2.5" />,
  },
};

export function StatusChip({
  status,
  label,
  className = "",
}: {
  status: ExperienceStatus;
  label?: string;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] ${s.className} ${className}`}
    >
      {s.icon}
      {label ?? s.label}
    </span>
  );
}

export function EvidenceChip({ level, className }: { level: EvidenceLevel; className?: string }) {
  return <StatusChip status={level} className={className} />;
}
