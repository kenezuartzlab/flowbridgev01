import { createFileRoute } from "@tanstack/react-router";
import { retiredPrivateSharingHandlers } from "@/lib/application/privateSharingRetired";

export const Route = createFileRoute("/api/admin/application-materials")({
  server: {
    handlers: retiredPrivateSharingHandlers,
  },
});
