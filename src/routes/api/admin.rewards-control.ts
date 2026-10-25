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
          return jsonResponse({ ...(await m.readControlCenter(gate.admin)), viewer: { role: gate.admin.role } });
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
            case "evidence-list": r = { ok: true, ...(await m.readEvidenceReviews(gate.admin)) }; break;
            case 'evidence-group-propose': r=await m.groupedEvidenceReview(gate.admin,{action:'propose',ids:Array.isArray(b.ids)?b.ids.filter((x):x is string=>typeof x==='string' && /^[0-9a-f-]{36}$/i.test(x)):[],rationale:String(b.rationale??''),uncertainty:String(b.uncertainty??'')}); break;
            case 'evidence-group-approve': case 'evidence-group-reject': r=await m.groupedEvidenceReview(gate.admin,{action:b.action==='evidence-group-approve'?'APPROVED':'REJECTED',groupId:id,rationale:typeof b.note==='string'?b.note.slice(0,1000):undefined}); break;
            case 'evidence-batch-propose': case 'evidence-batch-approve': case 'evidence-batch-reject': r=await m.batchEvidenceReview(gate.admin,Array.isArray(b.ids)?b.ids.filter((x):x is string=>typeof x==='string' && /^[0-9a-f-]{36}$/i.test(x)):[],b.action==='evidence-batch-propose'?'propose':b.action==='evidence-batch-approve'?'APPROVED':'REJECTED',{rationale:String(b.rationale??''),uncertainty:String(b.uncertainty??''),priceSource:typeof b.priceSource==='string'?b.priceSource:undefined});break;
            case "evidence-propose": r = await m.proposeEvidenceException(gate.admin, id, { rationale: String(b.rationale ?? ""), uncertainty: String(b.uncertainty ?? ""), priceSource: typeof b.priceSource === "string" ? b.priceSource : undefined, priceUsd: typeof b.priceUsd === "number" ? b.priceUsd : null }); break;
            case "evidence-approve": case "evidence-reject": r = await m.decideEvidenceException(gate.admin, id, b.action === "evidence-approve" ? "APPROVED" : "REJECTED", typeof b.note === "string" ? b.note.slice(0, 1000) : undefined); break;
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
