import { createFileRoute } from "@tanstack/react-router";

// Retired identity oracle: no profile reads, regardless of caller or input.
export const Route = createFileRoute("/api/public/wallet-lookup")({
  server: { handlers: {
    POST: async () => Response.json({ verificationRequired: true }, {
      headers: { "Cache-Control": "no-store" },
    }),
  } },
});
