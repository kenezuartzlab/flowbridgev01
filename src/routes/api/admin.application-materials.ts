import { createFileRoute } from "@tanstack/react-router";

// PRIVATE: BOT Ecosystem Support application materials. Never linked from public
// pages, sitemap or navigation. Admin-gated; returns short-lived signed URLs.
const FILES = [
  {
    id: "dossier",
    title: "Technical Documentation & BOT Support Application Dossier v1.0",
    path: "FlowBridge_Technical_Documentation_and_BOT_Support_Application_Dossier_v1.0.pdf",
  },
  {
    id: "pitch-deck",
    title: "BOT Ecosystem Support Pitch Deck v1.0",
    path: "FlowBridge_BOT_Ecosystem_Support_Pitch_Deck_v1.0.pdf",
  },
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
            const { data, error } = await supabaseAdmin.storage
              .from("application-materials")
              .createSignedUrl(f.path, expiresIn, { download: f.path });
            return { id: f.id, title: f.title, url: error ? null : data.signedUrl };
          }),
        );
        return jsonResponse(
          { files, expiresInSeconds: expiresIn },
          200,
        );
      },
    },
  },
});
