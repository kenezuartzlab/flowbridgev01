/**
 * FlowBridge V26 §9 — journey-aware Assistant quick prompts.
 *
 * Prompts are questions, never commands, and never imply Flow AI can execute
 * anything. They also never imply a journey is mandatory or that skipping it
 * loses funds or rewards. The assistant stays useful with no active journey.
 */
import { contextualPrompts } from "../experience/experienceModel";
import type { DecisionResult } from "../decision/decisionTypes";
import type { ResolvedJourney } from "./journeyTypes";

export function journeyPrompts(input: {
  journey: ResolvedJourney | null;
  decision: DecisionResult | null;
  max?: number;
}): string[] {
  const max = input.max ?? 4;
  const out: string[] = [];
  const journey = input.journey;

  if (journey) {
    for (const p of journey.prompts) if (!out.includes(p)) out.push(p);
    if (journey.currentStatus === "NEEDS_YOU" && !out.includes("Show what my wallet will confirm")) {
      out.push("Show what my wallet will confirm");
    }
  }

  for (const p of contextualPrompts(input.decision)) {
    if (out.length >= max) break;
    if (!out.includes(p)) out.push(p);
  }
  return out.slice(0, max);
}

/**
 * A short, honest description of where the user is, that the assistant may use
 * as context. Built only from already-resolved canonical facts.
 */
export function journeyContextLine(journey: ResolvedJourney | null): string | null {
  if (!journey) return null;
  const stage = journey.stages.find((s) => s.id === journey.currentStageId);
  if (!stage) return null;
  return `${journey.title} · ${stage.label}: ${stage.title}`;
}
