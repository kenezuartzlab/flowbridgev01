import { createFileRoute } from "@tanstack/react-router";

// Public runtime configuration (admin-published tokens + settings).
export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: async () => {
        const { buildPublicConfig } = await import("@/lib/appConfig.server");
        const { DEFAULT_APP_CONFIG } = await import("@/lib/config/appConfig");
        try {
          const cfg = await buildPublicConfig();
          return new Response(JSON.stringify(cfg), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "public, max-age=15" },
          });
        } catch {
          return new Response(JSON.stringify(DEFAULT_APP_CONFIG), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
