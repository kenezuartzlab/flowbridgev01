import { createFileRoute } from "@tanstack/react-router";

// Internal Ops + Growth Intelligence report — admin only, aggregates only, read-only.
export const Route = createFileRoute("/api/admin/ops")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const raw = new URL(request.url).searchParams.get("period");
        const period = raw === "today" || raw === "30d" ? raw : "7d";
        try {
          const { buildOpsReport } = await import("@/lib/ops/opsReport.server");
          return jsonResponse(await buildOpsReport(period));
        } catch {
          return jsonResponse({ error: "Operations report is temporarily unavailable." }, 503);
        }
      },
    },
  },
});
