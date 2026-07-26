import { createFileRoute } from "@tanstack/react-router";

// Tells the client whether the caller is the admin (verified email + bound wallet).
export const Route = createFileRoute("/api/admin/whoami")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) {
          let reason = "not_admin";
          try {
            reason = ((await gate.response.clone().json()) as any)?.error ?? reason;
          } catch {
            /* ignore */
          }
          return jsonResponse({ isAdmin: false, reason });
        }
        return jsonResponse({ isAdmin: true, email: gate.admin.email, wallet: gate.admin.wallet });
      },
    },
  },
});
