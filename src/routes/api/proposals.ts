import { createFileRoute } from "@tanstack/react-router";

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
          const { category, text, author } = (await request.json()) as {
            category?: string;
            text?: string;
            author?: string;
          };
          if (!category || !text) {
            return jsonResponse({ error: "Missing required fields (category or text)" }, 400);
          }
          if (typeof text !== "string" || typeof category !== "string") {
            return jsonResponse({ error: "Invalid field types" }, 400);
          }
          if (text.length > 1000) {
            return jsonResponse({ error: "Text too long (max 1000 chars)" }, 400);
          }
          if (category.length > 100) {
            return jsonResponse({ error: "Category too long (max 100 chars)" }, 400);
          }
          if (author && (typeof author !== "string" || author.length > 60)) {
            return jsonResponse({ error: "Author too long (max 60 chars)" }, 400);
          }
          const proposal = await createProposal(category, text, author || "Anonymous Supporter");
          return jsonResponse({ success: true, proposal }, 201);
        } catch (e: any) {
          return jsonResponse({ error: e.message ?? "Failed to save proposal" }, 500);
        }
      },
    },
  },
});
