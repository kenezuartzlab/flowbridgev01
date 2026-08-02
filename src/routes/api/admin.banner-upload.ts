import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 2_000_000;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

// Admin-only banner artwork upload. Files land in the private "banners" bucket
// and are served back through /api/banner-image/*.
export const Route = createFileRoute("/api/admin/banner-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;

        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return jsonResponse({ error: "No file uploaded" }, 400);
        if (!ALLOWED.includes(file.type)) {
          return jsonResponse({ error: "Use a PNG, JPG, WebP, GIF or SVG image." }, 400);
        }
        if (file.size > MAX_BYTES) {
          return jsonResponse({ error: "Image is larger than 2 MB." }, 400);
        }

        const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "png"}`;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.storage
            .from("banners")
            .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
          if (error) throw error;
          return jsonResponse({ url: `/api/banner-image/${path}`, size: file.size });
        } catch (e: any) {
          return jsonResponse({ error: e?.message ?? "Upload failed" }, 500);
        }
      },
    },
  },
});
