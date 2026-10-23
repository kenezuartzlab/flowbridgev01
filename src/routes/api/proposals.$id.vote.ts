import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/proposals/$id/vote")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { getAuthUser, jsonResponse, unauthorized } = await import("@/lib/api-auth.server");
        const { upvoteProposal } = await import("@/lib/flowbridge-db.server");
        const user = await getAuthUser(request);
        if (!user) return unauthorized();
        try {
          if (!params.id) return jsonResponse({ error: "Missing proposal ID" }, 400);
          const result = await upvoteProposal(params.id, user.id);
          return jsonResponse({ success: true, ...result });
        } catch (e: any) {
          return jsonResponse({ error: "Unable to vote. Check the proposal and retry." }, 503);
        }
      },
    },
  },
});
