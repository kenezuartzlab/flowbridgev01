import { createFileRoute } from "@tanstack/react-router";

// PRIVATE: BOT Ecosystem Support application materials. Never linked from public
// pages, sitemap or navigation. Every download rechecks the current admin gate.
// Serves only the frozen CANONICAL v1.1 master-refresh PDFs.
const FILES = [
  { id: "dossier-pdf", title: "Application dossier v1.1 (PDF)" },
  { id: "whitepaper-pdf", title: "Whitepaper v1.1 (PDF)" },
  { id: "pitch-pdf", title: "BOT pitch deck v1.1 (PDF)" },
  { id: "evidence-pdf", title: "On-chain evidence pack v1.1 (PDF)" },
  { id: "reviewer-pdf", title: "Reviewer summary v1.1 (PDF)" },
];

export const Route = createFileRoute("/api/admin/application-materials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const response = jsonResponse({ files: FILES, expiresInSeconds: 0 }, 200);
        response.headers.set("cache-control", "private, no-store");
        response.headers.set("x-robots-tag", "noindex, nofollow");
        return response;
      },
    },
  },
});
