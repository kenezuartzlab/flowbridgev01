import { Link } from "@tanstack/react-router";
import { Gift, Loader2, LogIn, MailWarning, Wallet, Sparkles } from "lucide-react";

/**
 * P2 — compact FLOW pill in the header. Purely presentational: it reads the
 * incentives payload the app already fetches and never mutates reward state.
 * Six states: loading, guest, unverified email, no bound wallet, claimable,
 * accruing (points shown, nothing claimable yet).
 */
export interface FlowPointsPillProps {
  googleUser?: any;
  incentives?: any;
  loading?: boolean;
}

type PillState = {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone: "muted" | "warn" | "accent" | "hot";
};

function resolveState({ googleUser, incentives, loading }: FlowPointsPillProps): PillState {
  if (!googleUser) {
    return { icon: <LogIn className="w-3 h-3" />, label: "SIGN IN", title: "Sign in to earn FLOW points from swaps", tone: "muted" };
  }
  const verified = !!(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo);
  if (!verified) {
    return { icon: <MailWarning className="w-3 h-3" />, label: "VERIFY", title: "Verify your email to start accruing FLOW", tone: "warn" };
  }
  if (loading && !incentives) {
    return { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: "FLOW", title: "Loading your FLOW balance", tone: "muted" };
  }
  if (!incentives) {
    return { icon: <Gift className="w-3 h-3" />, label: "FLOW", title: "Open rewards", tone: "muted" };
  }
  if (!incentives.walletAddress) {
    return { icon: <Wallet className="w-3 h-3" />, label: "BIND", title: "Bind your wallet to claim FLOW", tone: "warn" };
  }
  const claimable = Number(incentives.claimableTotal ?? 0);
  const total = Number(incentives.flowPoints ?? 0);
  if (claimable > 0) {
    return {
      icon: <Sparkles className="w-3 h-3" />,
      label: `${claimable.toLocaleString()} FLOW`,
      title: `${claimable.toLocaleString()} FLOW ready to claim`,
      tone: "hot",
    };
  }
  return {
    icon: <Gift className="w-3 h-3" />,
    label: `${total.toLocaleString()} FLOW`,
    title: "Swap to accrue more FLOW points",
    tone: "accent",
  };
}

const TONES: Record<PillState["tone"], string> = {
  muted: "border-white/10 bg-white/5 text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/30",
  warn: "border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
  accent: "border-[#32FF8B]/30 bg-[#32FF8B]/10 text-[#32FF8B] hover:bg-[#32FF8B]/20",
  hot: "border-[#32FF8B]/60 bg-[#32FF8B]/20 text-[#32FF8B] shadow-[0_0_18px_-4px_rgba(50,255,139,0.6)] hover:bg-[#32FF8B]/30",
};

export function FlowPointsPill(props: FlowPointsPillProps) {
  const state = resolveState(props);
  return (
    <Link
      to="/rewards"
      title={state.title}
      aria-label={state.title}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2 py-2 font-mono text-[10px] font-black uppercase tracking-[0.08em] transition-all active:scale-95 ${TONES[state.tone]}`}
    >
      {state.icon}
      <span className="max-w-[92px] truncate">{state.label}</span>
    </Link>
  );
}
