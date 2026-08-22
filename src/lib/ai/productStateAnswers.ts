/**
 * V15.3H §6 — product-state awareness.
 *
 * When the user says "no review card" or "nothing was prefilled", Flow AI must
 * answer from the *reported render/handoff state*, not from optimism. This pure
 * module maps the client-reported state to a deterministic reply code. It never
 * blames another app or interface, and never tells the user to tap a control
 * whose render status is not RENDERED.
 */
import { RENDER_FAILED_MESSAGE, type ActionRenderStatus } from "./actionRender";

export type ProductComplaint = "NO_REVIEW_CARD" | "NO_PREFILL" | null;

export interface ProductState {
  renderStatus: ActionRenderStatus;
  hasPreparedHandle: boolean;
  handoff: { code: "HANDOFF_HYDRATED" | "HANDOFF_HYDRATION_FAILED"; surface: string; detail: string } | null;
}

const NO_CARD =
  /\b(no|missing|can'?t (?:see|find)|don'?t see|didn'?t see|where'?s|there(?:'| i)s no)\b[^.?!]{0,40}\b(review|card|button|cta|prepared action)\b/i;
const NO_PREFILL =
  /\b(no|not|nothing|isn'?t|wasn'?t|didn'?t)\b[^.?!]{0,40}\b(prefill(?:ed)?|pre-?filled|filled|populated|empty (?:form|trade))\b/i;

export function detectProductComplaint(question: string): ProductComplaint {
  if (NO_CARD.test(question)) return "NO_REVIEW_CARD";
  if (NO_PREFILL.test(question)) return "NO_PREFILL";
  return null;
}

export interface ProductStateAnswer {
  code:
    | "HANDOFF_RENDER_FAILED"
    | "HANDOFF_HYDRATION_FAILED"
    | "NO_PREPARED_ACTION"
    | "ACTION_CARD_RENDERED"
    | "HANDOFF_HYDRATED";
  message: string;
  /** True when the user should be offered a fresh preparation. */
  offerRetry: boolean;
}

export function answerProductState(input: {
  complaint: Exclude<ProductComplaint, null>;
  state: ProductState;
}): ProductStateAnswer {
  const { state } = input;

  if (input.complaint === "NO_REVIEW_CARD") {
    if (state.renderStatus === "RENDER_FAILED") {
      return { code: "HANDOFF_RENDER_FAILED", message: RENDER_FAILED_MESSAGE, offerRetry: true };
    }
    if (!state.hasPreparedHandle || state.renderStatus === "NONE") {
      return {
        code: "NO_PREPARED_ACTION",
        message:
          "You're right — there is no review card, because no action of mine is currently prepared. Nothing was signed or submitted. Tell me the pair and exact amount and I'll prepare one; the card appears in this chat only when a validated plan exists.",
        offerRetry: true,
      };
    }
    return {
      code: "ACTION_CARD_RENDERED",
      message:
        "A prepared plan is active in this conversation and its review card is rendered above this message. If you scrolled past it, the same plan is also offered on /trade as \"Prepared action available\" — you never have to retype it.",
      offerRetry: false,
    };
  }

  if (state.handoff?.code === "HANDOFF_HYDRATION_FAILED") {
    return {
      code: "HANDOFF_HYDRATION_FAILED",
      message: `${state.handoff.surface} reported that it could not prefill the prepared plan: ${state.handoff.detail} Nothing was signed or submitted. I can prepare it again, or you can enter the values on /trade yourself.`,
      offerRetry: true,
    };
  }
  if (!state.hasPreparedHandle) {
    return {
      code: "NO_PREPARED_ACTION",
      message:
        "Nothing was prefilled because I have no prepared plan for you right now — a normal /trade visit is just Trade. Give me the pair and exact amount and I'll prepare one to review.",
      offerRetry: true,
    };
  }
  if (state.handoff?.code === "HANDOFF_HYDRATED") {
    return {
      code: "HANDOFF_HYDRATED",
      message: `${state.handoff.surface} reported the plan was prefilled: ${state.handoff.detail} If the form looks empty now, it was reset after that report — ask me to prepare it again rather than guessing values.`,
      offerRetry: false,
    };
  }
  return {
    code: "HANDOFF_HYDRATION_FAILED",
    message:
      "A plan is prepared, but Trade has not reported a successful prefill for it, so I won't claim it was carried over. Open the prepared action from /trade, or ask me to prepare it again.",
    offerRetry: true,
  };
}
