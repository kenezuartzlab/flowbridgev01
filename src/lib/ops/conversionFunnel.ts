/**
 * Growth V1 — conversion funnel + drop-off intelligence (pure, counts only).
 * Stages count distinct pseudonymous sessions from specific events — never
 * page views. User cancellation and technical failure are never combined.
 */
export interface SessionEvent { session_hash: string | null; event_name: string; area?: string }

export const CONVERSION_STAGES = [
  { key: "VISITOR", label: "Visitor", events: ["visit"] },
  { key: "EXPLORE", label: "Explore", events: ["explore_opened", "DISCOVERY_ITEM_OPENED"] },
  { key: "WALLET_CONNECT", label: "Wallet connect", events: ["wallet_connected"] },
  { key: "ACCOUNT", label: "Account", events: ["account_signed_in"] },
  { key: "VERIFY_EMAIL", label: "Verify email", events: ["EMAIL_VERIFIED_OBSERVED"] },
  { key: "BIND_WALLET", label: "Bind wallet", events: ["WALLET_BOUND_OBSERVED"] },
  { key: "FIRST_QUOTE", label: "First quote", events: ["quote_success"] },
  { key: "FIRST_REVIEW", label: "First review", events: ["review_opened"] },
  { key: "FIRST_SUBMITTED", label: "First submitted trade", events: ["tx_submitted"] },
  { key: "FIRST_CONFIRMED", label: "First confirmed trade", events: ["tx_confirmed"] },
  { key: "FIRST_EARN", label: "First Earn exploration", events: ["earn_category_viewed", "earn_action_started", "staking_product_reviewed", "pool_inspected"] },
  { key: "REPEAT", label: "Repeat user", events: [] as string[] },
] as const;

export const USER_CANCELLED_EVENTS = ["wallet_rejected", "ACTIVATION_PROMPT_DECLINED", "review_cancelled"];
export const TECHNICAL_FAILURE_EVENTS = ["rpc_failure", "simulation_failure", "quote_failure", "tx_reverted", "client_error"];

const STAGE_FAILURE_EVENTS: Record<string, string[]> = {
  FIRST_QUOTE: ["quote_failure", "rpc_failure"],
  FIRST_REVIEW: ["simulation_failure"],
  FIRST_SUBMITTED: ["wallet_rejected", "rpc_failure"],
  FIRST_CONFIRMED: ["tx_reverted"],
};

export interface ConversionStage { key: string; label: string; entered: number; completed: number; abandoned: number; userCancelled: number; technicalFailure: number }

export function conversionFunnel(rows: readonly SessionEvent[]): ConversionStage[] {
  const by = new Map<string, Set<string>>();
  const confirmedCount = new Map<string, number>();
  for (const r of rows) {
    if (!r.session_hash) continue;
    (by.get(r.event_name) ?? by.set(r.event_name, new Set()).get(r.event_name)!).add(r.session_hash);
    if (r.event_name === "tx_confirmed") confirmedCount.set(r.session_hash, (confirmedCount.get(r.session_hash) ?? 0) + 1);
  }
  const sess = (events: readonly string[]) => {
    const s = new Set<string>();
    for (const e of events) for (const h of by.get(e) ?? []) s.add(h);
    return s;
  };
  const sets = CONVERSION_STAGES.map((st) =>
    st.key === "REPEAT" ? new Set([...confirmedCount].filter(([, n]) => n >= 2).map(([h]) => h)) : sess(st.events),
  );
  return CONVERSION_STAGES.map((st, i) => {
    const completedSet = sets[i]!;
    const entered = i === 0 ? completedSet.size : sets[i - 1]!.size;
    const failEvents = STAGE_FAILURE_EVENTS[st.key] ?? [];
    const failedSessions = (names: string[]) => [...sess(names.filter((n) => failEvents.includes(n)))].filter((h) => !completedSet.has(h)).length;
    const userCancelled = failedSessions(USER_CANCELLED_EVENTS);
    const technicalFailure = failedSessions(TECHNICAL_FAILURE_EVENTS);
    const completed = Math.min(completedSet.size, Math.max(entered, completedSet.size));
    return {
      key: st.key, label: st.label, entered, completed,
      abandoned: Math.max(0, entered - completed - userCancelled - technicalFailure),
      userCancelled, technicalFailure,
    };
  });
}

export interface ObservedSignal { observedSignal: string; possibleAction: string; autoApplied: false }

/** Advisory only: nothing here changes the product. */
export function conversionSignals(stages: ConversionStage[], minSample = 10): ObservedSignal[] {
  const g = (k: string) => stages.find((s) => s.key === k);
  const out: ObservedSignal[] = [];
  const add = (observedSignal: string, possibleAction: string) => out.push({ observedSignal, possibleAction, autoApplied: false });
  const v = g("VERIFY_EMAIL"), b = g("BIND_WALLET"), r = g("FIRST_REVIEW"), s = g("FIRST_SUBMITTED");
  if (v && b && v.completed >= minSample && b.completed / v.completed < 0.3)
    add(`Users verify email but do not bind wallet (${b.completed}/${v.completed})`, "Improve the wallet-binding benefit explanation.");
  if (r && s && r.completed >= minSample && s.completed / r.completed < 0.3)
    add(`Many users reach route review but do not sign (${s.completed}/${r.completed})`, "Simplify the fee and route explanation.");
  for (const st of stages) if (st.technicalFailure >= minSample && st.technicalFailure > st.userCancelled)
    add(`${st.label}: technical failures (${st.technicalFailure}) exceed user cancellations`, "Investigate reliability at this stage.");
  return out;
}
