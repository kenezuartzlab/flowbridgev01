import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditPublisherRoles, isSettlementStale, prepareSettlementBatch, SETTLEMENT_AUTOMATION, SETTLEMENT_SIGNER, verifyPublishedRound,
} from "./settlementPlanner";
import { discoverRounds } from "./payoutBatch";

const DIST = "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922" as const;
const W = 10n ** 18n;
const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const chain = { epochCount: 2, campaignBudgetWei: 1_005_001n * W, totalClaimedWei: 1n * W, totalReservedWei: 10n * W, balanceWei: 2_499_999n * W, minPublishDelay: 86_400, paused: false, nowSec: 1_800_000_000 };
const r = (i: number, pts: number, cls = "MATCH", pending = 0) => ({ userId: `u${i}`, wallet: w(i), classification: cls, authoritative: pts, pendingReview: pending, alreadyAllocatedPoints: 0 });
const ROLES = { PUBLISHER_ROLE: true, DEFAULT_ADMIN_ROLE: false, BUDGET_MANAGER_ROLE: false, PAUSER_ROLE: false };
const prog = (core: number, avail = 3000) => [{ programId: "CORE_SWAP" as const, includedPoints: core, availablePoints: avail }];
const run = (rows: ReturnType<typeof r>[], o: Record<string, unknown> = {}) =>
  prepareSettlementBatch({ rows, fundedPointsAvailable: 3000, publisherRoles: ROLES, chain, chainId: 677, distributor: DIST, ...o } as never);
const leaves = (s: ReturnType<typeof run>) => (s.batch?.leaves ?? []).map((l) => BigInt(l.amount) / W);

describe("settlement safety gate", () => {
  it("999 and 999.99 excluded; 1,000 and 1,001 eligible", () => {
    expect(leaves(run([r(1, 999), r(2, 999.99)]))).toEqual([]);
    expect(leaves(run([r(1, 1000), r(2, 1001)], { programs: prog(2001) }))).toEqual([1000n, 1001n]);
  });
  it("no eligible wallets ⇒ NOT READY with explicit reason, no tx", () => {
    const s = run([r(1, 999)]);
    expect(s.status).toBe("BLOCKED");
    expect(s.reason).toBe("NO_ELIGIBLE_WALLETS_ABOVE_MINIMUM");
    expect(s.tx).toBeNull();
  });
  it("deterministic: same state ⇒ identical round/root/total/window/calldata/fingerprint", () => {
    const a = run([r(1, 1500)], { programs: prog(1500) });
    const b = run([r(1, 1500)], { programs: prog(1500) });
    expect(a.status).toBe("READY_FOR_PUBLISHER_REVIEW");
    expect([a.epochId, a.batch!.root, a.batch!.totalWei, a.claimStart, a.claimEnd, a.tx!.data, a.fingerprint])
      .toEqual([b.epochId, b.batch!.root, b.batch!.totalWei, b.claimStart, b.claimEnd, b.tx!.data, b.fingerprint]);
    expect(a.checks.find((c) => c.id === "DETERMINISTIC")!.pass).toBe(true);
  });
  it("stale protection: any material change alters fingerprint", () => {
    const base = run([r(1, 1500)], { programs: prog(1500) }).fingerprint;
    const variants = [
      { chain: { ...chain, epochCount: 3 } }, { chain: { ...chain, paused: true } }, { chain: { ...chain, campaignBudgetWei: 1n } },
      { chain: { ...chain, balanceWei: 1n } }, { chain: { ...chain, totalClaimedWei: 2n * W } }, { fundedPointsAvailable: 2999 },
    ];
    for (const v of variants) expect(isSettlementStale(base, run([r(1, 1500)], { programs: prog(1500), ...v }).fingerprint)).toBe(true);
    expect(isSettlementStale(base, run([r(1, 1600)], { programs: prog(1600) }).fingerprint)).toBe(true);
    expect(isSettlementStale(base, run([r(1, 1500, "MATCH", 5)], { programs: prog(1500) }).fingerprint)).toBe(true);
    expect(isSettlementStale(null, base)).toBe(true);
    expect(isSettlementStale(base, base)).toBe(false);
  });
  it("round-count race / round already published blocks", () => {
    expect(run([r(1, 1500)], { programs: prog(1500), chain: { ...chain, epochCount: 3 } }).status).toBe("BLOCKED");
    expect(discoverRounds(3).missingFromApp).toEqual([3]);
  });
  it("duplicate wallet and duplicate entitlement block", () => {
    expect(run([r(1, 1500), { ...r(2, 1500), wallet: w(1) }]).status).toBe("BLOCKED");
    expect(run([r(1, 1500), r(1, 1500)]).status).toBe("BLOCKED");
  });
  it("unfunded / review-held / historical / Testnet-derived rows excluded", () => {
    expect(run([r(1, 1500, "MATCH", 10)]).batch?.leaves.length ?? 0).toBe(0);
    expect(run([r(1, 5000, "REVIEWED_NONCLAIMABLE_HISTORICAL")]).batch?.leaves.length ?? 0).toBe(0);
    expect(run([r(1, 1500)], { fundedPointsAvailable: 1000 }).status).toBe("BLOCKED");
  });
  it("cross-budget leakage blocks", () => {
    const leak = [{ programId: "CORE_SWAP" as const, includedPoints: 1500, availablePoints: 1000 }];
    expect(run([r(1, 1500)], { programs: leak }).checks.find((c) => c.id === "BUDGET_SEPARATION")!.pass).toBe(false);
    const misattributed = [{ programId: "CORE_SWAP" as const, includedPoints: 500, availablePoints: 3000 }];
    expect(run([r(1, 1500)], { programs: misattributed }).status).toBe("BLOCKED");
  });
  it("paused / insufficient balance block", () => {
    expect(run([r(1, 1500)], { programs: prog(1500), chain: { ...chain, paused: true } }).status).toBe("BLOCKED");
    expect(run([r(1, 1500)], { programs: prog(1500), chain: { ...chain, balanceWei: 100n * W } }).status).toBe("BLOCKED");
  });
  it("wrong publisher / extra roles reported", () => {
    expect(run([r(1, 1500)], { programs: prog(1500), publisherRoles: { ...ROLES, PUBLISHER_ROLE: false } }).status).toBe("BLOCKED");
    expect(run([r(1, 1500)], { programs: prog(1500), publisherRoles: null }).status).toBe("BLOCKED");
    expect(auditPublisherRoles({ ...ROLES, DEFAULT_ADMIN_ROLE: true })).toMatchObject({ status: "FAIL", extraRoles: ["DEFAULT_ADMIN_ROLE"] });
    expect(auditPublisherRoles(ROLES).status).toBe("PASS");
    expect(SETTLEMENT_SIGNER.address).toBe("0x971E7790FE6C8F77dc666Bb05D4aedA362653f94");
  });
  it("post-publish verification: success, mismatched root, malformed proof, unexpected wallet, no receipt", () => {
    const s = run([r(1, 1500), r(2, 2000)], { programs: prog(3500, 3500), fundedPointsAvailable: 3500 });
    const batch = { epochId: s.epochId, root: s.batch!.root!, totalWei: s.batch!.totalWei, claimStart: s.claimStart, claimEnd: s.claimEnd, leaves: s.batch!.leaves.map((l) => ({ ...l })) };
    const epoch = { root: batch.root, allocation: BigInt(batch.totalWei), claimStart: batch.claimStart, claimEnd: batch.claimEnd, cancelled: false, released: false };
    const base = { batch, receiptStatus: "success" as const, liveEpochCount: 3, epoch, paused: false, balanceWei: 10_000n * W, totalReservedWei: 3510n * W, chainId: 677, distributor: DIST };
    expect(verifyPublishedRound(base).complete).toBe(true);
    expect(verifyPublishedRound({ ...base, receiptStatus: null }).complete).toBe(false);
    expect(verifyPublishedRound({ ...base, epoch: { ...epoch, root: ("0x" + "11".repeat(32)) as `0x${string}` } }).complete).toBe(false);
    const bad = { ...batch, leaves: batch.leaves.map((l, i) => (i === 0 ? { ...l, proof: [("0x" + "22".repeat(32)) as `0x${string}`] } : l)) };
    expect(verifyPublishedRound({ ...base, batch: bad }).checks.find((c) => c.id === "EXPECTED_WALLETS_VERIFY")!.pass).toBe(false);
    expect(verifyPublishedRound(base).checks.find((c) => c.id === "NO_UNEXPECTED_WALLET")!.pass).toBe(true);
  });
  it("automatic round discovery accepts verified server rounds", () => {
    expect(run([r(1, 1500)], { programs: prog(1500), chain: { ...chain, epochCount: 3 }, knownEpochIds: [3] }).epochId).toBe(4);
  });
  it("no app signing; publisher key never exposed; batch generation is admin-gated", () => {
    expect(SETTLEMENT_AUTOMATION).toMatchObject({ autonomousSigning: false, serverPrivateKey: false, publicClaimsUnlocked: false });
    const srcs = ["src/lib/rewards/settlementPlanner.ts", "src/lib/rewards/settlement.server.ts", "src/routes/api/public/reward-rounds.ts", "src/components/ops/RewardsSolvencyTab.tsx"]
      .map((f) => readFileSync(f, "utf8")).join("\n");
    expect(srcs).not.toMatch(/privateKeyToAccount|PRIVATE_KEY|sendTransaction|writeContract|signTransaction/);
    const admin = readFileSync("src/routes/api/admin.rewards-solvency.ts", "utf8");
    expect(admin).toMatch(/requireAdmin\(request\)[\s\S]*if \(!gate\.ok\) return gate\.response/);
  });
});
