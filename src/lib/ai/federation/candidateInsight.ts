/**
 * FlowBridge V19 §6/§7 — the ONLY bridge from external output to product flow.
 *
 * An external suggestion may become a *candidate insight* and nothing more. It
 * carries no amount, no target and no chain: V16 must re-resolve the canonical
 * opportunity, and V18 still requires an explicit user "Build mission". If the
 * suggested kind is not a supported internal kind, the result is
 * explanation-only.
 */
import { opportunitySupportsMission } from "../opportunity/missionTemplates";
import type { ExternalEvidenceProvenance, SanitizedCapabilityOutput } from "./capabilityTypes";

export interface CandidateInsight {
  /** Sanitized advisory text shown as EXTERNAL evidence, never as truth. */
  insights: readonly { label: string; detail: string; referenceUrl: string | null }[];
  /** Supported internal opportunity kind, or null → explanation only. */
  mappedOpportunityKind: string | null;
  explanationOnly: boolean;
  /** Why it stayed explanation-only, in user-facing language. */
  explanationOnlyReason: string | null;
  /** Always true: V16 must re-resolve canonical state before any planning. */
  requiresCanonicalReResolution: true;
  /** Always true: V18 compile stays an explicit user action. */
  requiresExplicitUserBuild: true;
  provenance: ExternalEvidenceProvenance;
  /** Names of provider fields discarded because economics are canonical only. */
  discardedProviderFields: readonly string[];
  unsafeContentFlagged: boolean;
}

function parseKind(kind: string): { domain: string; type: string } | null {
  const [domain, type] = kind.split(":");
  if (!domain || !type) return null;
  return { domain, type };
}

export function toCandidateInsight(input: {
  output: SanitizedCapabilityOutput;
  provenance: ExternalEvidenceProvenance;
}): CandidateInsight {
  const suggested = input.output.suggestedOpportunityKind;
  const parsed = suggested ? parseKind(suggested) : null;
  const supported = parsed ? opportunitySupportsMission(parsed) : false;

  return {
    insights: input.output.insights,
    mappedOpportunityKind: supported ? suggested : null,
    explanationOnly: !supported,
    explanationOnlyReason: supported
      ? null
      : suggested
        ? "That suggestion isn't a FlowBridge opportunity type, so it stays informational."
        : "The skill returned context only — no FlowBridge opportunity to plan from.",
    requiresCanonicalReResolution: true,
    requiresExplicitUserBuild: true,
    provenance: input.provenance,
    discardedProviderFields: input.output.strippedFields,
    unsafeContentFlagged: input.output.unsafeContentFlagged,
  };
}

/**
 * V19 §6 — canonical economics always win. Given a provider-suggested numeric
 * value and the canonical value, this always returns canonical and reports the
 * contradiction for the evidence drawer.
 */
export function reconcileWithCanonical<T extends number | string>(input: {
  field: string;
  providerValue: T | null;
  canonicalValue: T;
}): { value: T; contradiction: boolean; note: string | null } {
  const contradiction =
    input.providerValue !== null && String(input.providerValue) !== String(input.canonicalValue);
  return {
    value: input.canonicalValue,
    contradiction,
    note: contradiction
      ? `External skill reported ${input.field}=${input.providerValue}; FlowBridge live value ${input.canonicalValue} is authoritative.`
      : null,
  };
}
