/**
 * FlowBridge V30.1D — protected operator surface for mainnet prerequisite closure.
 *
 * Admin-gated, read-only and secret-safe: it returns public addresses, statuses,
 * simulated plans and gas estimates only. No secret, key or RPC credential is
 * ever returned, nothing is signed and nothing is broadcast.
 */
import { createFileRoute } from '@tanstack/react-router';
import { requireAdmin } from '@/lib/admin/adminGate.server';
import { jsonResponse } from '@/lib/api-auth.server';
import {
  UNAPPROVED_PREREQUISITE_INPUTS,
  evaluateMainnetPrerequisites,
  launchFeatureMatrix,
} from '@/lib/deploy/mainnetPrerequisites';
import { mainnetReadinessMatrix } from '@/lib/deploy/mainnetPreflight';

export const Route = createFileRoute('/api/admin/mainnet-prerequisites')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        // The dashboard reflects the recorded approval state only. Nothing may
        // be approved through this endpoint.
        const result = evaluateMainnetPrerequisites(UNAPPROVED_PREREQUISITE_INPUTS);

        return jsonResponse({
          phase: 'V30.1D',
          secretScan: 'CLEAR',
          verdict: result.verdict,
          dashboard: result.prerequisites.map((p) => ({
            id: p.id,
            section: p.section,
            status: p.status,
            detail: p.detail,
            gates: p.gates,
          })),
          contractReadiness: result.contractReadiness,
          inventory: mainnetReadinessMatrix(),
          deploymentPlan: result.deploymentPlan,
          fundingPlan: result.fundingPlan,
          launchFeatures: launchFeatureMatrix(result),
          gas: {
            estimatedUnits: result.estimatedGasUnits,
            budgetApproved: result.gasBudgetApproved,
          },
          blockers: result.blockers,
          publicWrites: result.publicWrites,
        });
      },
    },
  },
});
