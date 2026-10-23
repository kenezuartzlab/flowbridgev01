import { createFileRoute } from "@tanstack/react-router";
import { readProposalInput } from '@/lib/proposalPolicy';

export const Route = createFileRoute("/api/proposals")({
  server: {
    handlers: {
      GET: async () => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { getProposals } = await import("@/lib/flowbridge-db.server");
        try {
          const proposals = await getProposals();
          return jsonResponse({ success: true, proposals });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to load proposals" }, 500);
        }
      },
      POST: async ({ request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { createProposal } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          const { category, text } = await readProposalInput(request).catch(() => { throw new Error('INVALID_PROPOSAL'); });
          const proposal = await createProposal(category, text, "Anonymous Supporter");
          return jsonResponse({ success: true, proposal }, 201);
        } catch (e: any) {
          return jsonResponse({ error: e.message === 'INVALID_PROPOSAL' ? 'Proposal exceeds limits or has invalid content.' : 'Unable to save proposal.' }, e.message === 'INVALID_PROPOSAL' ? 400 : 503);
        }
      },
    },
  },
});
