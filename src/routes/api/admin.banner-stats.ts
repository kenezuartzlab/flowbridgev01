import { createFileRoute } from "@tanstack/react-router";

// Admin-only banner engagement summary: impressions, clicks and CTR per slide.
export const Route = createFileRoute("/api/admin/banner-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("banner_events")
            .select("surface, slide_id, kind")
            .gte("created_at", since)
            .limit(100000);
          if (error) throw error;

          const map = new Map<string, { surface: string; slideId: string; impressions: number; clicks: number }>();
          for (const row of data ?? []) {
            const key = `${row.surface}::${row.slide_id}`;
            const entry =
              map.get(key) ?? { surface: row.surface, slideId: row.slide_id, impressions: 0, clicks: 0 };
            if (row.kind === "click") entry.clicks += 1;
            else entry.impressions += 1;
            map.set(key, entry);
          }

          const stats = [...map.values()]
            .map((s) => ({ ...s, ctr: s.impressions ? (s.clicks / s.impressions) * 100 : 0 }))
            .sort((a, b) => b.impressions - a.impressions);

          return jsonResponse({ days, stats });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Failed to load stats" }, 500);
        }
      },
    },
  },
});
