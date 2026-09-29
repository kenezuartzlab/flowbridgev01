import { createFileRoute } from "@tanstack/react-router";

// PRIVATE: Scheme A readiness + on-chain evidence. Admin-gated, read-only, noindex.
export const Route = createFileRoute("/api/admin/application-readiness")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        try {
          const { computeReadiness } = await import("@/lib/application/readiness.server");
          const res = jsonResponse(await computeReadiness(), 200);
          res.headers.set("x-robots-tag", "noindex, nofollow");
          res.headers.set("cache-control", "private, no-store");
          return res;
        } catch (e: any) {
          return jsonResponse({ error: `Chain read failed: ${e?.shortMessage ?? e?.message ?? "unknown"}` }, 502);
        }
      },
    },
  },
});
