import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — the control panel now lives at /sets. */
export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw redirect({ to: "/sets" });
  },
});
