/**
 * FlowBridge V10 — legacy compatibility route.
 *
 * Partners is no longer a competing first-class destination: it is a view inside
 * Explore. The long-standing /partners URL therefore redirects to
 * /campaigns/partners so external links, QR codes and bookmarks keep working.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/partners")({
  beforeLoad: () => {
    throw redirect({ to: "/campaigns/partners", replace: true });
  },
});
