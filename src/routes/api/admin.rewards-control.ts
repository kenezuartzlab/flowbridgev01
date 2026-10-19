import { createFileRoute } from "@tanstack/react-router";

// Ops → Rewards Control Center. Admin-gated; off-chain funding workflow only.
export const Route = createFileRoute("/api/admin/rewards-control")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        try {
          const m = await import("@/lib/rewards/controlCenter.server");
          return jsonResponse({ ...(await m.readControlCenter()), viewer: { role: gate.admin.role } });
        } catch {
          return jsonResponse({ error: "Control center is temporarily unavailable." }, 503);
        }
      },
      POST: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : "";
        try {
          const m = await import("@/lib/rewards/controlCenter.server");
          let r: { ok: boolean } & Record<string, unknown>;
          switch (b.action) {
            case "propose": r = await m.proposeFunding(gate.admin, String(b.programId ?? ""), typeof b.note === "string" ? b.note.slice(0, 500) : undefined); break;
            case "approve": case "reject": r = await m.decideFunding(gate.admin, id, b.action); break;
            case "confirm": r = await m.confirmFunding(gate.admin, id, String(b.hash ?? "")); break;
            case "resolve-exception": r = await m.resolveException(gate.admin, id); break;
            case "automation": r = await m.setAutomationPolicy(gate.admin, { programId: String(b.programId ?? ""), suspended: b.suspended as boolean | undefined, perRunCap: b.perRunCap as number | undefined, dailyCap: b.dailyCap as number | undefined }); break;
            case "sweep": r = { ok: true, summary: await m.runOpsSweep(`manual:${gate.admin.email}`) }; break;
            default: return jsonResponse({ error: "Unknown action" }, 400);
          }
          return jsonResponse(r, r.ok ? 200 : 409);
        } catch {
          return jsonResponse({ error: "Action failed safely; nothing was changed." }, 503);
        }
      },
    },
  },
});
