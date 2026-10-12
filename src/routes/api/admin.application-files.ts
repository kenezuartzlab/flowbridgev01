import { createFileRoute } from "@tanstack/react-router";
import { findApplicationFile } from "@/lib/application/applicationFiles";

// PRIVATE: streams current master-refresh files to verified admins only.
// No signed/expiring links are created.
export const Route = createFileRoute("/api/admin/application-files")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const file = findApplicationFile(new URL(request.url).searchParams.get("id") ?? "");
        if (!file) return jsonResponse({ error: "Unknown file" }, 404);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("application-materials").download(file.path);
        if (error || !data) return jsonResponse({ error: "File unavailable" }, 404);
        const name = file.path.split("/").pop()!;
        return new Response(data, {
          headers: {
            "content-type": data.type || "application/octet-stream",
            "content-disposition": `attachment; filename="${name}"`,
            "cache-control": "private, no-store",
            "x-robots-tag": "noindex, nofollow",
          },
        });
      },
    },
  },
});
