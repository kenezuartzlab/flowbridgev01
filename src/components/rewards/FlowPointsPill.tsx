import { Link } from "@tanstack/react-router";
import { Gift, Loader2, LogIn, MailWarning, Wallet, Sparkles } from "lucide-react";
import { PTS, formatPts } from "@/lib/points";

/**
 * P2 — compact FLOW Points (PTS) pill in the header. Purely presentational: it
 * reads the incentives payload the app already fetches and never mutates reward
 * state. PTS are off-chain campaign points, never labelled as FLOW tokens.
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
  /** Hide the text label on very narrow screens (icon stays as the affordance). */
  compact?: boolean;
};

function resolveState({ googleUser, incentives, loading }: FlowPointsPillProps): PillState {
  if (!googleUser) {
    return { icon: <LogIn className="w-3 h-3" />, label: "SIGN IN", compact: true, title: "Sign in to earn FLOW Points (PTS) from swaps", tone: "muted" };
  }
  const verified = !!(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo);
  if (!verified) {
    return { icon: <MailWarning className="w-3 h-3" />, label: "VERIFY", compact: true, title: "Verify your email to start accruing PTS", tone: "warn" };
  }
  if (loading && !incentives) {
    return { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: PTS, title: "Loading your FLOW Points balance", tone: "muted" };
  }
  if (!incentives) {
    return { icon: <Gift className="w-3 h-3" />, label: PTS, title: "Open FLOW Portal", tone: "muted" };
  }
  if (!incentives.walletAddress) {
    return { icon: <Wallet className="w-3 h-3" />, label: "BIND", compact: true, title: "Bind your wallet to claim rewards", tone: "warn" };
  }
  const claimable = Number(incentives.claimableTotal ?? 0);
  const total = Number(incentives.flowPoints ?? 0);
  if (claimable > 0) {
    return {
      icon: <Sparkles className="w-3 h-3" />,
      label: `${formatPts(claimable)} ${PTS}`,
      title: `${formatPts(claimable)} ${PTS} ready to claim`,
      tone: "hot",
    };
  }
  return {
    icon: <Gift className="w-3 h-3" />,
    label: `${formatPts(total)} ${PTS}`,
    title: "Swap to accrue more FLOW Points",
    tone: "accent",
  };
}

const TONES: Record<PillState["tone"], string> = {
  muted: "text-[#C5C1B9] hover:text-[#32FF8B]",
  warn: "text-amber-300 hover:text-amber-200",
  accent: "text-[#32FF8B] hover:opacity-80",
  hot: "text-[#32FF8B] hover:opacity-80",
};

export function FlowPointsPill(props: FlowPointsPillProps) {
  const state = resolveState(props);
  return (
    <Link
      to="/rewards"
      title={state.title}
      aria-label={state.title}
      className={`flex shrink-0 items-center gap-1 rounded-lg px-1 py-0.5 font-mono text-[10px] font-black uppercase leading-none tracking-[0.08em] transition-all active:scale-95 ${TONES[state.tone]}`}
    >
      {state.icon}
      <span className={`max-w-[92px] truncate ${state.compact ? "hidden sm:inline" : ""}`}>{state.label}</span>
    </Link>
  );
}
