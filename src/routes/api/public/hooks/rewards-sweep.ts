import { createFileRoute } from "@tanstack/react-router";

// Server-secret authenticated sweep: records private alerts/reconciliation only.
export const Route = createFileRoute("/api/public/hooks/rewards-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        const secret = process.env['REWARDS_SWEEP_SECRET'];
        if (!secret || !token) return Response.json({ error: 'Unauthorized' }, {status:401});
        const digest = async (value:string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
        const [a,b]=await Promise.all([digest(token),digest(secret)]);
        let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
        if(diff!==0)return Response.json({error:'Unauthorized'},{status:401});
        try {
          const { runOpsSweep } = await import("@/lib/rewards/controlCenter.server");
          await runOpsSweep("cron");
          // Inert unless a super admin enabled it with a budget and confirmed acceptance.
          const { runAutoApproval } = await import("@/lib/rewards/autoApproval.server");
          await runAutoApproval("cron").catch(() => null);
          return Response.json({ ok: true });
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      },
    },
  },
});
