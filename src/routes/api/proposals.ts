import { createFileRoute } from "@tanstack/react-router";
import { communityRetiredResponse } from '@/lib/communityRetired';

export const Route = createFileRoute("/api/proposals")({
  server: {
    handlers: {
      GET: communityRetiredResponse,
      POST: communityRetiredResponse,
    },
  },
});
