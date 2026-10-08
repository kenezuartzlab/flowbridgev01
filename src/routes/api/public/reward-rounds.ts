import { createFileRoute } from "@tanstack/react-router";

// Public, read-only round discovery for Earn. Returns only the queried wallet's
// own leaf + proof, and only for rounds whose stored root equals the LIVE
// on-chain root and passes post-publish verification. Proofs are not secrets:
// they can only pay the listed wallet. No other wallets are ever returned.
export const Route = createFileRoute("/api/public/reward-rounds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const wallet = new URL(request.url).searchParams.get("wallet")?.toLowerCase() ?? "";
        const headers = { "content-type": "application/json", "cache-control": "no-store" };
        if (!/^0x[0-9a-f]{40}$/.test(wallet)) return new Response(JSON.stringify({ rounds: [] }), { status: 400, headers });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { readChainState, discoverPublishedBatches, DISTRIBUTOR } = await import("@/lib/rewards/settlement.server");
          const live = await readChainState();
          if (!live) return new Response(JSON.stringify({ rounds: [], error: "unavailable" }), { status: 503, headers });
          const found = await discoverPublishedBatches(supabaseAdmin, live.epochCount); // indexes missing historical rounds first
          const rounds = found.filter((f) => f.verification.complete).flatMap(({ batch, source }) => {
            const leaf = batch.leaves.find((l) => l.account.toLowerCase() === wallet);
            return leaf ? [{ epochId: batch.epochId, root: batch.root, allocationWei: batch.totalWei, claimStart: batch.claimStart, claimEnd: batch.claimEnd, distributor: DISTRIBUTOR, source, leaf }] : [];
          });
          return new Response(JSON.stringify({ rounds }), { headers });
        } catch {
          return new Response(JSON.stringify({ rounds: [], error: "unavailable" }), { status: 503, headers });
        }
      },
    },
  },
});
