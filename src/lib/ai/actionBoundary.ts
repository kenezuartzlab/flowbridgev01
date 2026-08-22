/**
 * V15 §9 — future bounded autonomy: architected now, DISABLED now.
 *
 * The action pipeline is declared so future work has a fixed shape, but the
 * execution boundary is hard-closed: `FLOW_AI_EXECUTION_ENABLED` is a const
 * false and `prepareAction` can only ever return a PREPARED plan the user must
 * carry into the normal wallet flow themselves.
 */

export const FLOW_AI_EXECUTION_ENABLED = false as const;

export const FLOW_AI_ACTION_PIPELINE = [
  "INTENT",
  "SIMULATE",
  "POLICY_CHECK",
  "AUTHORIZATION",
  "SUBMIT",
  "CONFIRM",
  "VERIFY",
  "AUDIT",
] as const;

export type FlowAiActionStage = (typeof FLOW_AI_ACTION_PIPELINE)[number];

export type PreparableAction =
  | "PREPARE_SWAP"
  | "PREPARE_BRIDGE"
  | "PREPARE_STAKE"
  | "PREPARE_CLAIM"
  | "PREPARE_CAMPAIGN_DRAFT";

/** Authorities Flow AI must never hold, in any release. */
export const FORBIDDEN_AUTHORITIES = [
  "TREASURY",
  "REWARD_SIGNER",
  "CONTRACT_OWNER",
  "SUPER_ADMIN",
  "KEY_CUSTODY",
] as const;

const ACTION_PATTERNS: readonly { re: RegExp; action: PreparableAction; where: string }[] = [
  { re: /\b(swap|trade|exchange)\b/, action: "PREPARE_SWAP", where: "the Trade → SWAP tab" },
  { re: /\bbridge\b/, action: "PREPARE_BRIDGE", where: "the Trade → BRIDGE tab" },
  { re: /\b(stake|unstake|staking)\b/, action: "PREPARE_STAKE", where: "the Stake page" },
  { re: /\bclaim\b/, action: "PREPARE_CLAIM", where: "the Earn page" },
  { re: /\b(publish|approve)\b.*\bcampaign\b/, action: "PREPARE_CAMPAIGN_DRAFT", where: "Partner Studio" },
];

const IMPERATIVE = /\b(do it|execute|for me|go ahead|send it|sign|submit|now please|please (swap|bridge|stake|claim|publish))\b/;

export interface ActionIntentResult {
  actionRequested: boolean;
  action: PreparableAction | null;
  notice: string | null;
}

/**
 * Detects "please do X for me" requests. Flow AI answers by explaining or
 * preparing — never by executing.
 */
export function classifyActionIntent(question: string): ActionIntentResult {
  const q = question.toLowerCase();
  const match = ACTION_PATTERNS.find((p) => p.re.test(q));
  if (!match) return { actionRequested: false, action: null, notice: null };
  const imperative = IMPERATIVE.test(q) || /^(swap|bridge|stake|claim|publish)\b/.test(q.trim());
  if (!imperative) return { actionRequested: false, action: null, notice: null };
  return {
    actionRequested: true,
    action: match.action,
    notice: `I can't run transactions or publish on your behalf — I'll explain the steps and you confirm in ${match.where} with your own wallet.`,
  };
}

export interface PreparedActionPlan {
  action: PreparableAction;
  executed: false;
  stagesCompleted: readonly FlowAiActionStage[];
  blockedAtStage: FlowAiActionStage;
  humanStep: string;
  summary: string;
}

/** Prepares an explanation-only plan. Never submits anything. */
export function prepareAction(input: {
  action: PreparableAction;
  summary: string;
}): PreparedActionPlan {
  if (FLOW_AI_EXECUTION_ENABLED) {
    throw new Error("V15 invariant violated: Flow AI execution must remain disabled");
  }
  return {
    action: input.action,
    executed: false,
    stagesCompleted: ["INTENT", "SIMULATE", "POLICY_CHECK"],
    blockedAtStage: "AUTHORIZATION",
    humanStep: "You authorize and sign in your own wallet — Flow AI cannot.",
    summary: input.summary,
  };
}

export function assertNoWriteAuthority(requested: string): void {
  if ((FORBIDDEN_AUTHORITIES as readonly string[]).includes(requested)) {
    throw new Error(`Flow AI may never hold ${requested} authority`);
  }
}
