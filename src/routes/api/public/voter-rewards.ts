import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { validateOwnershipMessage } from "@/lib/wallet/ownershipMessage";

const addr = z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/);
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "Cache-Control": "no-store" } });

// Public on-chain vote tallies; a wallet's own reward balance; and FLOW claims that require a fresh ownership signature.
export const Route = createFileRoute("/api/public/voter-rewards")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const u = new URL(request.url);
        const since = z.string().datetime().safeParse(u.searchParams.get("since"));
        const until = z.string().datetime().safeParse(u.searchParams.get("until"));
        const s = await import("@/lib/ecosystem/voterRewards.server");
        const sync = await s.syncVotes().catch(() => ({ halted: false, lastBlock: 0 }));
        const now = new Date();
        const from = since.success ? since.data : new Date(now.getTime() - 7 * 86_400_000).toISOString();
        const to = until.success ? until.data : now.toISOString();
        const top = await s.rankedVoters(from, to, 25);
        const w = addr.safeParse(u.searchParams.get("wallet"));
        let mine = null;
        if (w.success) {
          const wallet = w.data.toLowerCase();
          const all = await s.rankedVoters(from, to, 100_000);
          const idx = all.findIndex((x) => x.wallet === wallet);
          mine = { rank: idx >= 0 ? idx + 1 : null, votes: idx >= 0 ? all[idx].votes : 0, ...(await s.walletSummary(wallet)) };
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin.from("vote_payout_config").select("enabled,min_claim_flow").eq("id", 1).maybeSingle();
        return json({ top, mine, halted: sync.halted, claimsOpen: !!cfg?.enabled, minClaimFlow: Number(cfg?.min_claim_flow ?? 0) });
      } catch { return json({ error: "Voter rewards are temporarily unavailable." }, 503); }
    },
    POST: async ({ request }) => {
      try {
        const input = z.object({ walletAddress: addr, message: z.string().min(1).max(2048), signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/), nonce: z.string().regex(/^[a-f0-9]{48}$/), chainId: z.literal(677) }).strict().safeParse(await request.json());
        if (!input.success) return json({ error: "Invalid claim request." }, 400);
        const { walletAddress, nonce, chainId, message } = input.data;
        if (!validateOwnershipMessage(message, { wallet: walletAddress, nonce, chainId, requestOrigin: request.headers.get("origin"), nowMs: Date.now() })) return json({ error: "Signature does not match this site or network." }, 400);
        const { checkWalletRequestLimit } = await import("@/lib/wallet/requestLimit.server");
        const limited = await checkWalletRequestLimit(walletAddress.toLowerCase());
        if (limited) return limited;
        const { verifyWalletChallenge } = await import("@/lib/walletChallenge.server");
        const proof = await verifyWalletChallenge(input.data);
        if (!proof.ok) return json({ error: "Signature expired or already used. Try again." }, proof.status);
        const { claimFlow } = await import("@/lib/ecosystem/voterRewards.server");
        return json(await claimFlow(proof.wallet));
      } catch { return json({ error: "Claims are temporarily unavailable." }, 503); }
    },
  } },
});
