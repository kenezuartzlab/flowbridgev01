import { createFileRoute } from "@tanstack/react-router";
import { retiredPrivateSharingHandlers } from "@/lib/application/privateSharingRetired";

// Permanent retirement; retain the URL to deny direct and stale callers.
export const Route = createFileRoute("/api/admin/application-files")({
  server: {
    handlers: retiredPrivateSharingHandlers,
  },
});
