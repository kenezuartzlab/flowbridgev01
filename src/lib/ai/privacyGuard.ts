/**
 * V15.1 §4 — cross-actor privacy guard.
 *
 * Runs BEFORE any retrieval. If a question asks for another wallet's, user's or
 * organization's private state, Flow AI refuses at the boundary instead of
 * relying on the model to behave. Public/on-chain lookups stay allowed because
 * on-chain data is public by construction, but they are labelled as such.
 */
import type { FlowAiActor } from "./aiTypes";

const EVM_ADDRESS = /\b0x[a-fA-F0-9]{40}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;

const PRIVATE_SUBJECT =
  /\b(points|pts|xp|balance|balances|rewards?|claims?|claimed|staked|staking|earnings?|history|profile|email|referrals?|campaigns? budget|budget|analytics|conversion|revenue|submissions?|drafts?|review notes?)\b/i;

const THIRD_PARTY_PERSON =
  /\b(another user|other users?|someone else|this user|that user|user b|their (?:points|balance|rewards|wallet|email|profile))\b/i;

const THIRD_PARTY_ORG =
  /\b(another (?:partner|org|organization|project)|other (?:partners|orgs|organizations|projects)|competitor'?s?|(?:their|other) (?:campaign|org) (?:budget|analytics|drafts?))\b/i;

export interface PrivacyDecision {
  /** True when retrieval must not run at all. */
  blocked: boolean;
  reason: string | null;
  /** Refusal text to show verbatim when blocked. */
  refusal: string | null;
  /** Addresses in the question that are NOT the actor's own bound wallet. */
  foreignAddresses: readonly string[];
}

const ALLOW =
  /\b(tx|transaction|hash|explorer|contract|token address|pool|router|vault|scan)\b/i;

export function evaluatePrivacy(input: {
  question: string;
  actor: FlowAiActor;
  ownWallets?: readonly string[];
}): PrivacyDecision {
  const q = input.question;
  const own = new Set((input.ownWallets ?? []).map((w) => w.toLowerCase()));
  const addresses = Array.from(q.match(EVM_ADDRESS) ?? []).map((a) => a.toLowerCase());
  const foreign = addresses.filter((a) => !own.has(a));
  const emails = Array.from(q.match(EMAIL) ?? []).filter(
    (e) => e.toLowerCase() !== (input.actor.email ?? "").toLowerCase(),
  );

  const wantsPrivate = PRIVATE_SUBJECT.test(q);
  const publicLookup = ALLOW.test(q);

  if (emails.length > 0 && wantsPrivate) {
    return blockedBy("another person's account by email");
  }
  if (THIRD_PARTY_PERSON.test(q) && wantsPrivate) {
    return blockedBy("another user's private account state");
  }
  if (THIRD_PARTY_ORG.test(q)) {
    return blockedBy("another organization's private campaign or analytics data");
  }
  if (foreign.length > 0 && wantsPrivate && !publicLookup) {
    return {
      blocked: true,
      reason: "foreign wallet private state",
      refusal:
        "I can't report another wallet's FlowBridge account state — points, XP, claims and staking positions are private to the signed-in owner. I can explain how any of those are calculated, or look up a public transaction hash on the BOT Chain explorer.",
      foreignAddresses: foreign,
    };
  }

  return { blocked: false, reason: null, refusal: null, foreignAddresses: foreign };
}

function blockedBy(what: string): PrivacyDecision {
  return {
    blocked: true,
    reason: what,
    refusal: `I can't access ${what}. Flow AI only reads the signed-in account's own data and the organizations you're a member of. I can still explain how the rules and calculations work, or answer about your own account.`,
    foreignAddresses: [],
  };
}
