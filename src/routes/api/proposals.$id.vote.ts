import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/proposals/$id/vote")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const { upvoteProposal } = await import("@/lib/flowbridge-db.server");
        try {
          if (!params.id) return jsonResponse({ error: "Missing proposal ID" }, 400);
          const proposal = await upvoteProposal(params.id);
          return jsonResponse({ success: true, proposal });
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to upvote proposal" }, 500);
        }
      },
    },
  },
});
