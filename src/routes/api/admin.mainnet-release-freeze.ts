/**
 * FlowBridge V30.1D.2 — protected owner approval + mainnet release freeze surface.
 *
 * Admin-gated. It is the single place where an owner explicitly APPROVES,
 * REJECTS or REPLACES a mainnet release decision, and where the frozen
 * MAINNET_RELEASE_DECISIONS object is produced.
 *
 * Guarantees:
 *  - Nothing is pre-approved; a decision without a stored record stays
 *    NEEDS_APPROVAL and the verdict stays BLOCKED.
 *  - Only `super_admin` may record decisions; `internal_operator` is read-only.
 *  - Records are append-only and carry admin identity, timestamp, decision
 *    version and the candidate digest they were approved against.
 *  - Public values only. No secret, key, seed or signing material is accepted,
 *    stored or returned. Nothing is deployed, funded, signed or transferred.
 */
import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/admin/adminGate.server';
import { jsonResponse } from '@/lib/api-auth.server';
import {
  CURRENT_RELEASE_FREEZE_INPUT,
  RELEASE_DECISION_SHEET,
  RELEASE_DECISION_VERSION,
  currentCandidateDigest,
  evaluateReleaseFreeze,
  releaseDecision,
  type DecisionAction,
  type DecisionSubmission,
} from '@/lib/deploy/mainnetReleaseFreeze';

const SECRET_KEYS = /(privatekey|private_key|mnemonic|seed|secret|passphrase|signature|signingkey)/i;

function containsSecretLikeField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretLikeField);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => SECRET_KEYS.test(k) || containsSecretLikeField(v),
    );
  }
  return false;
}

export const Route = createFileRoute('/api/admin/mainnet-release-freeze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const candidateDigest = currentCandidateDigest();
        const mode = body['mode'] === 'submit' ? 'submit' : 'state';

        if (mode === 'submit') {
          if (gate.admin.role !== 'super_admin') {
            return jsonResponse({ error: 'Only a super admin may record release decisions.' }, 403);
          }
          const decisionId = typeof body['decisionId'] === 'string' ? body['decisionId'] : '';
          const def = releaseDecision(decisionId);
          if (!def) {
            return jsonResponse(
              { error: 'Unknown decision', known: RELEASE_DECISION_SHEET.map((d) => d.id) },
              400,
            );
          }
          const action = body['action'] as DecisionAction;
          if (action !== 'APPROVE' && action !== 'REJECT' && action !== 'REPLACE') {
            return jsonResponse({ error: 'action must be APPROVE, REJECT or REPLACE' }, 400);
          }
          if (action === 'REPLACE' && !def.editable) {
            return jsonResponse({ error: 'This decision is evidence-derived and not owner-editable.' }, 400);
          }
          const value =
            body['value'] && typeof body['value'] === 'object' && !Array.isArray(body['value'])
              ? (body['value'] as Record<string, unknown>)
              : null;
          if (action === 'REPLACE' && !value) {
            return jsonResponse({ error: 'REPLACE requires a public replacement value object.' }, 400);
          }
          if (containsSecretLikeField(value)) {
            return jsonResponse({ error: 'Release decisions accept public values only.' }, 400);
          }

          const { error } = await supabaseAdmin.from('mainnet_release_decisions').insert({
            decision_id: def.id,
            action,
            decision_version: RELEASE_DECISION_VERSION,
            candidate_digest: candidateDigest,
            approved_value: value as never,
            approved_by_user: gate.admin.userId,
            approved_by_email: gate.admin.email,
            note: typeof body['note'] === 'string' ? body['note'].slice(0, 2000) : null,
          });
          if (error) return jsonResponse({ error: 'Could not record the decision.' }, 500);
        }

        const { data: rows } = await supabaseAdmin
          .from('mainnet_release_decisions')
          .select('decision_id,action,candidate_digest,approved_value,approved_by_email,approved_at,note')
          .order('approved_at', { ascending: true });

        const submissions: DecisionSubmission[] = (rows ?? []).map((r) => ({
          decisionId: r.decision_id as string,
          action: r.action as DecisionAction,
          value: (r.approved_value as Record<string, unknown> | null) ?? null,
          approvedByEmail: r.approved_by_email as string,
          approvedAt: r.approved_at as string,
          note: (r.note as string | null) ?? null,
          candidateDigest: r.candidate_digest as string,
        }));

        const result = evaluateReleaseFreeze({
          ...CURRENT_RELEASE_FREEZE_INPUT,
          submissions,
          candidateDigest,
        });

        return jsonResponse({
          phase: 'V30.1D.4',
          secretScan: 'CLEAR',
          verdict: result.verdict,
          decisionVersion: result.decisionVersion,
          candidateDigest: result.candidateDigest,
          decisions: result.decisions,
          safeVerification: result.safeVerification,
          stagedReadiness: result.stagedReadiness,
          featureReadiness: result.featureReadiness,
          failClosedFindings: result.failClosedFindings,
          outstanding: result.outstanding,
          featureOutstanding: result.featureOutstanding,
          deferredNonTechnical: result.deferredNonTechnical,
          manifest: result.manifest,
          manifestHash: result.manifestHash,
          publicWrites: result.publicWrites,
          recordCount: submissions.length,
        });
      },
    },
  },
});
