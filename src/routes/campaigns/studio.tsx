import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * V9.2 — legacy operator bookmark. Campaign Studio now lives inside the secure
 * Sets console; this alias keeps existing links working.
 */
export const Route = createFileRoute("/campaigns/studio")({
  beforeLoad: () => {
    throw redirect({ to: "/sets", search: { section: "campaigns" } });
  },
});
