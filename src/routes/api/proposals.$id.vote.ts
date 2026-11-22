import { createFileRoute } from "@tanstack/react-router";
import { communityRetiredResponse } from '@/lib/communityRetired';

export const Route = createFileRoute("/api/proposals/$id/vote")({
  server: {
    handlers: {
      POST: communityRetiredResponse,
    },
  },
});
