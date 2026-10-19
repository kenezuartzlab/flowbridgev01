import { createFileRoute } from "@tanstack/react-router";

// Scheduled read-only rewards sweep. The bearer check only filters stray
// traffic; the handler never funds, signs, publishes or returns personal data.
export const Route = createFileRoute("/api/public/hooks/rewards-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        try {
          const { runOpsSweep } = await import("@/lib/rewards/controlCenter.server");
          await runOpsSweep("cron");
          return Response.json({ ok: true });
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      },
    },
  },
});
