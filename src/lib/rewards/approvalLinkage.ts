/**
 * V37.1 — links confirmed payout approvals to verified-published rounds (pure).
 * A link is proposed only when the round was prepared after the approval was
 * confirmed, is verified on chain, has a confirmed publication transaction and
 * contains the approval's wallet with at least the approved amount. Each
 * (round, wallet) pair is used once. The DB function re-checks all of this.
 */
export interface LinkApproval { id: string; wallet: string; points: number; confirmedAt: string }
export interface LinkBatch { id: string; epochId: number; createdAt: string; publishedAt: string | null; txHash: string | null; leaves: { account: string; amount: string }[] }

const WEI = 10n ** 18n;

export function planApprovalLinks(approvals: LinkApproval[], batches: LinkBatch[]) {
  const used = new Set<string>();
  const links: { approvalId: string; batchId: string; epochId: number; txHash: string }[] = [];
  const published = batches
    .filter((b) => b.publishedAt && b.txHash && /^0x[0-9a-fA-F]{64}$/.test(b.txHash))
    .sort((a, b) => a.epochId - b.epochId);
  const ordered = [...approvals].sort((a, b) => (a.confirmedAt < b.confirmedAt ? -1 : a.confirmedAt > b.confirmedAt ? 1 : a.id < b.id ? -1 : 1));
  for (const a of ordered) {
    const w = a.wallet.toLowerCase();
    const b = published.find((x) => x.createdAt >= a.confirmedAt && !used.has(`${x.id}|${w}`)
      && x.leaves.some((l) => l.account.toLowerCase() === w && /^\d+$/.test(l.amount) && BigInt(l.amount) >= BigInt(Math.floor(a.points)) * WEI));
    if (!b) continue;
    used.add(`${b.id}|${w}`);
    links.push({ approvalId: a.id, batchId: b.id, epochId: b.epochId, txHash: b.txHash! });
  }
  return links;
}

/** User-facing stage of one approval. Claimable only once the window is open. */
export type ApprovalStage = "AWAITING_APPROVAL" | "AWAITING_PUBLICATION" | "PUBLISHED_WAITING_FOR_CLAIM_WINDOW" | "CLAIM_WINDOW_OPEN" | "CLAIM_WINDOW_ENDED";
export function approvalStage(a: { status: string; linked: boolean; claimStartSec: number | null; claimEndSec: number | null }, nowSec: number): ApprovalStage | null {
  if (a.status === "PROPOSED" || a.status === "APPROVED") return "AWAITING_APPROVAL";
  if (a.status !== "CONFIRMED") return null;
  if (!a.linked || a.claimStartSec == null) return "AWAITING_PUBLICATION";
  if (nowSec < a.claimStartSec) return "PUBLISHED_WAITING_FOR_CLAIM_WINDOW";
  if (a.claimEndSec != null && nowSec >= a.claimEndSec) return "CLAIM_WINDOW_ENDED";
  return "CLAIM_WINDOW_OPEN";
}
