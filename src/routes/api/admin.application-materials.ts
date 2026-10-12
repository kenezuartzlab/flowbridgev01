import { createFileRoute } from "@tanstack/react-router";

// PRIVATE: BOT Ecosystem Support application materials. Never linked from public
// pages, sitemap or navigation. Admin-gated; returns short-lived signed URLs.
// Serves only the frozen CANONICAL v1.1 master-refresh PDFs.
const FILES = [
  { id: "dossier", title: "Application dossier v1.1 (PDF)", path: "master-refresh/FlowBridge_Application_Dossier_v1.1.pdf" },
  { id: "whitepaper", title: "Whitepaper v1.1 (PDF)", path: "master-refresh/FlowBridge_Whitepaper_v1.1.pdf" },
  { id: "pitch-deck", title: "BOT pitch deck v1.1 (PDF)", path: "master-refresh/FlowBridge_BOT_Pitch_Deck_v1.1.pdf" },
  { id: "evidence-pack", title: "On-chain evidence pack v1.1 (PDF)", path: "master-refresh/FlowBridge_Onchain_Evidence_Pack_v1.1.pdf" },
  { id: "reviewer-summary", title: "Reviewer summary v1.1 (PDF)", path: "master-refresh/FlowBridge_Reviewer_Summary_v1.1.pdf" },
];

export const Route = createFileRoute("/api/admin/application-materials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // 7 days: long enough to hand to a BOT Chain reviewer as an unlisted link.
        const expiresIn = 60 * 60 * 24 * 7;
        const files = await Promise.all(
          FILES.map(async (f) => {
            const name = f.path.split("/").pop()!;
            const { data, error } = await supabaseAdmin.storage
              .from("application-materials")
              .createSignedUrl(f.path, expiresIn, { download: name });
            return { id: f.id, title: f.title, url: error ? null : data.signedUrl };
          }),
        );
        const response = jsonResponse({ files, expiresInSeconds: expiresIn }, 200);
        response.headers.set("cache-control", "private, no-store");
        response.headers.set("x-robots-tag", "noindex, nofollow");
        return response;
      },
    },
  },
});
