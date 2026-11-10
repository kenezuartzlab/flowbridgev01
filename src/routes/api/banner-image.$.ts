import { createFileRoute } from "@tanstack/react-router";

// Public read-through for admin-uploaded banner artwork stored in the private
// "banners" bucket. Only serves image bytes; no listing, no metadata.
export const Route = createFileRoute("/api/banner-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as any)._splat ?? "");
        if (!/^(?:[a-f0-9-]{36}\/)?[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif|svg)$/.test(path)) return new Response("Not found", { status: 404 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage.from("banners").download(path);
          if (error || !data) return new Response("Not found", { status: 404 });
          return new Response(await data.arrayBuffer(), {
            status: 200,
            headers: {
              "content-type": data.type || "image/png",
              "x-content-type-options": "nosniff",
              "content-security-policy": "default-src 'none'; sandbox",
              "cache-control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
