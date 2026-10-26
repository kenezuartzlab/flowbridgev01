import { planApprovalLinks } from "./approvalLinkage";
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/**
 * Durable, retry-safe linkage of confirmed approvals to verified-published rounds.
 * Uses only stored on-chain verification (publication_verified_at + confirmed
 * publish attempt). Uncertain publications are left unlinked: the approval keeps
 * its commitment and the account stays excluded from new cycles.
 */
export async function linkPublishedApprovals(admin: Admin) {
  const [ap, bt, at] = await Promise.all([
    admin.from("reward_payout_approvals").select("id,wallet,points,confirmed_at").eq("status", "CONFIRMED").is("settlement_batch_id", null).limit(500),
    admin.from("reward_settlement_batches").select("id,epoch_id,created_at,publication_verified_at,leaves").eq("chain_id", 677).not("publication_verified_at", "is", null).gte("epoch_id", 4).limit(200),
    admin.from("reward_publish_attempts").select("batch_id,tx_hash,phase").eq("chain_id", 677).eq("phase", "CONFIRMED_VERIFIED").limit(500),
  ]);
  if (ap.error || bt.error || at.error) throw new Error("approval linkage state unavailable");
  if (!ap.data?.length) return { linked: 0, pending: 0 };
  const tx = new Map((at.data ?? []).filter((a) => a.tx_hash).map((a) => [a.batch_id, a.tx_hash as string]));
  const links = planApprovalLinks(
    ap.data.map((a) => ({ id: a.id, wallet: a.wallet, points: a.points, confirmedAt: a.confirmed_at ?? "9999" })),
    (bt.data ?? []).map((b) => ({ id: b.id, epochId: b.epoch_id, createdAt: b.created_at, publishedAt: b.publication_verified_at, txHash: tx.get(b.id) ?? null, leaves: (Array.isArray(b.leaves) ? b.leaves : []) as never })),
  );
  let linked = 0;
  for (const l of links) {
    const { data, error } = await admin.rpc("link_payout_approval" as never, { p_approval: l.approvalId, p_batch: l.batchId, p_tx: l.txHash } as never);
    if (!error && (data as { ok?: boolean } | null)?.ok) linked++;
  }
  return { linked, pending: ap.data.length - linked };
}
