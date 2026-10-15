import { createFileRoute } from "@tanstack/react-router";

// V36.3A — admin-only post-broadcast verification. READ-ONLY: receipt + eth_call.
// The publisher's own wallet signs and broadcasts; this route never does.
export const Route = createFileRoute("/api/admin/rewards-publish-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireAdmin } = await import("@/lib/admin/adminGate.server");
        const { jsonResponse } = await import("@/lib/api-auth.server");
        const gate = await requireAdmin(request);
        if (!gate.ok) return gate.response;
        const body = (await request.json().catch(() => null)) as { epochId?: number; root?: string; txHash?: string } | null;
        if (!body || !Number.isInteger(body.epochId) || !/^0x[0-9a-fA-F]{64}$/.test(body.root ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash ?? "")) {
          return jsonResponse({ error: "invalid request" }, 400);
        }
        try {
          const { createPublicClient, http } = await import("viem");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { readChainState, readEpoch, DISTRIBUTOR } = await import("@/lib/rewards/settlement.server");
          const { verifyPublishedRound, SETTLEMENT_SIGNER } = await import("@/lib/rewards/settlementPlanner");
          const { phaseFromVerification } = await import("@/lib/rewards/publishGate");
          const c = createPublicClient({ transport: http("https://rpc.botchain.ai") });
          const [receipt, tx] = await Promise.all([
            c.getTransactionReceipt({ hash: body.txHash as `0x${string}` }).catch(() => null),
            c.getTransaction({ hash: body.txHash as `0x${string}` }).catch(() => null),
          ]);
          const { data: row } = await supabaseAdmin.from("reward_settlement_batches").select("epoch_id,root,total_wei,claim_start,claim_end,leaves")
            .eq("chain_id", 677).eq("epoch_id", body.epochId!).eq("root", body.root!).maybeSingle();
          if (!row) return jsonResponse({ error: "batch not found" }, 404);
          const wrongTx = !!tx && (tx.to?.toLowerCase() !== DISTRIBUTOR.toLowerCase() || tx.from.toLowerCase() !== SETTLEMENT_SIGNER.address.toLowerCase());
          if (wrongTx) return jsonResponse({ phase: "ERROR", detail: "Transaction is not a publisher → distributor call." });
          const status = receipt ? receipt.status : null;
          if (!status) return jsonResponse({ phase: "BROADCAST_PENDING", checks: [] });
          const [live, ep] = await Promise.all([readChainState(), readEpoch(body.epochId!)]);
          const v = verifyPublishedRound({
            batch: { epochId: row.epoch_id, root: row.root as `0x${string}`, totalWei: BigInt(String(row.total_wei).split(".")[0]).toString(), claimStart: Number(row.claim_start), claimEnd: Number(row.claim_end), leaves: row.leaves as never },
            receiptStatus: status, liveEpochCount: live?.epochCount ?? 0, epoch: ep as never, paused: live?.paused ?? true,
            balanceWei: live?.balanceWei ?? 0n, totalReservedWei: live?.totalReservedWei ?? 1n, chainId: 677, distributor: DISTRIBUTOR,
          });
          if (v.complete) {
            await supabaseAdmin.from("reward_settlement_batches").update({ publication_verified_at: new Date().toISOString() })
              .eq("epoch_id", row.epoch_id).eq("root", row.root).is("publication_verified_at", null);
          }
          return jsonResponse({ phase: phaseFromVerification(status, v.complete), block: receipt?.blockNumber?.toString() ?? null, checks: v.checks });
        } catch {
          return jsonResponse({ phase: "ERROR", detail: "Verification temporarily unavailable." }, 503);
        }
      },
    },
  },
});
