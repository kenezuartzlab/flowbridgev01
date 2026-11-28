import { createFileRoute } from "@tanstack/react-router";

// Scheduler-triggered AutoTrade worker (paper only). Caller must present the managed
// scheduling secret or AUTOTRADE_WORKER_SECRET (manual benchmark runs).
async function workerSecretOk(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env["AUTOTRADE_WORKER_SECRET"];
  if (!secret || !token) return false;
  const dg = async (v: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  const [a, b] = await Promise.all([dg(token), dg(secret)]); let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
export const Route = createFileRoute("/api/public/hooks/autotrade-worker")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!(await workerSecretOk(request))) {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      try { const { runWorker } = await import("@/lib/autotrade/worker.server"); return Response.json(await runWorker("cron")); }
      catch { return Response.json({ ok: false }, { status: 503 }); }
    },
  } },
});
