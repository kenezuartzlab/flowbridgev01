import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";
import { buildPayoutBatch } from "./payoutBatch";
import {
  buildHistoricalImport, CLAIM_DATA_UNAVAILABLE, detectRoundDrift, discoverWalletRounds, HISTORICAL_SOURCE,
  planRoundIndexSync, roundClaimDisplay, type IndexedRound, type ProofSource,
} from "./historicalRoundIndex";
import type { OnchainEpoch } from "./settlementPlanner";

const DIST = "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922" as const;
const CANARY = "0x628e237b73C5a37EF3968527563FA1a26b32BB97";
const r2 = MAINNET_EPOCH_MANIFESTS.find((m) => m.epochId === 2)!;
const r1 = MAINNET_EPOCH_MANIFESTS.find((m) => m.epochId === 1)!;
const src = (m: typeof r2): ProofSource => ({ epochId: m.epochId, root: m.root, leaves: m.entitlements.map((e) => ({ ...e })) });
const chainOf = (m: typeof r2): OnchainEpoch => ({ root: m.root, allocation: BigInt(m.allocationWei), claimStart: BigInt(m.claimStart), claimEnd: BigInt(m.claimEnd), cancelled: false, released: false });
const epochs = new Map([[1, chainOf(r1)], [2, chainOf(r2)]]);
const sources = [src(r1), src(r2)];

describe("historical round import", () => {
  it("indexes round #2 from chain truth with explicit historical source", () => {
    const r = buildHistoricalImport({ chainId: 677, distributor: DIST, epochId: 2, chain: chainOf(r2), proofSource: src(r2) });
    expect(r.status).toBe("IMPORT");
    if (r.status !== "IMPORT") return;
    expect(r.record.source).toBe(HISTORICAL_SOURCE);
    expect(r.record.root).toBe("0x21c416d3a1dc9da9b7bab9d4d97668598713e5419b0d7fb3aa055705f090c860");
    expect(r.record.totalWei).toBe("10000000000000000000");
    expect(r.record.leaves).toHaveLength(1);
    expect(r.record.leaves[0].account).toBe(CANARY);
    expect(new Date(r.record.claimStart * 1000).toISOString()).toBe("2026-10-08T12:42:49.000Z");
    expect(new Date(r.record.claimEnd * 1000).toISOString()).toBe("2026-11-07T12:42:49.000Z");
  });
  it("missing proof fails safely, never fabricated", () => {
    expect(buildHistoricalImport({ chainId: 677, distributor: DIST, epochId: 2, chain: chainOf(r2), proofSource: null }).status).toBe("PROOF_UNAVAILABLE");
    const bad = { ...src(r2), leaves: [{ ...src(r2).leaves[0], amount: "11000000000000000000" }] };
    expect(buildHistoricalImport({ chainId: 677, distributor: DIST, epochId: 2, chain: chainOf(r2), proofSource: bad }).status).toBe("PROOF_MISMATCH");
    expect(CLAIM_DATA_UNAVAILABLE).toBe("CLAIM DATA UNAVAILABLE — RETRY");
  });
  it("wrong root from proof source is rejected", () => {
    expect(buildHistoricalImport({ chainId: 677, distributor: DIST, epochId: 2, chain: chainOf(r2), proofSource: { ...src(r2), root: r1.root } }).status).toBe("PROOF_MISMATCH");
  });
});

describe("index sync", () => {
  it("imports missing rounds then is idempotent (no duplicate)", () => {
    const first = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 2, local: [], chainEpochs: epochs, proofSources: sources });
    expect(first.map((a) => a.action)).toEqual(["IMPORT", "IMPORT"]);
    const local = first.flatMap((a) => (a.action === "IMPORT" ? [a.record] : []));
    const again = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 2, local, chainEpochs: epochs, proofSources: sources });
    expect(again.map((a) => a.action)).toEqual(["SKIP_EXISTING", "SKIP_EXISTING"]);
  });
  it("flags ROUND_METADATA_DRIFT with local and chain values, never overwrites", () => {
    const local = [{ epochId: 2, root: r2.root, totalWei: "10000000000000000000", claimStart: r2.claimStart + 60, claimEnd: r2.claimEnd, leaves: [] }];
    const p = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 2, local, chainEpochs: epochs, proofSources: sources });
    const d = p.find((a) => a.epochId === 2)!;
    expect(d.action).toBe("DRIFT");
    if (d.action === "DRIFT") expect(d.fields[0]).toEqual({ field: "claimStart", local: String(r2.claimStart + 60), chain: String(r2.claimStart) });
    expect(detectRoundDrift(local[0], { ...chainOf(r2), cancelled: true }).map((f) => f.field)).toContain("status");
  });
  it("chain read failure is unavailable, not imported", () => {
    const p = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 3, local: [], chainEpochs: epochs, proofSources: sources });
    expect(p[2]).toEqual({ epochId: 3, action: "UNAVAILABLE", reason: "CHAIN_READ_FAILED" });
  });
});

describe("discovery + claim state", () => {
  const imported = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 2, local: [], chainEpochs: epochs, proofSources: sources })
    .flatMap((a) => (a.action === "IMPORT" ? [a.record] : []));
  it("automatic discovery returns round #2 for the canary without the manifest", () => {
    const found = discoverWalletRounds(CANARY.toLowerCase(), imported);
    expect(found.map((f) => f.epochId)).toContain(2);
    expect(found.find((f) => f.epochId === 2)!.source).toBe(HISTORICAL_SOURCE);
    expect(discoverWalletRounds("0x000000000000000000000000000000000000dEaD", imported)).toEqual([]);
  });
  it("claimed-state refresh hides the claim button", () => {
    const base = { nowSec: r2.claimStart + 10, claimStart: r2.claimStart, claimEnd: r2.claimEnd };
    expect(roundClaimDisplay({ ...base, claimed: false })).toEqual({ state: "CLAIMABLE", claimButton: true });
    expect(roundClaimDisplay({ ...base, claimed: true })).toEqual({ state: "CLAIMED", claimButton: false });
    expect(roundClaimDisplay({ ...base, nowSec: r2.claimStart - 1, claimed: false }).claimButton).toBe(false);
  });
  it("round #3 simulated path: builder batch → record → discovery → proof", () => {
    const row = (w: string, a: number) => ({ userId: w, wallet: w, classification: "MATCH", authoritative: a, pendingReview: 0 });
    const wallets = [1, 2, 3].map((n) => `0x${n.toString(16).padStart(40, "0")}`);
    const b = buildPayoutBatch(wallets.map((w, i) => row(w, 1000 + i)), { chainId: 677, distributor: DIST, epochId: 3 });
    const b2 = buildPayoutBatch(wallets.map((w, i) => row(w, 1000 + i)), { chainId: 677, distributor: DIST, epochId: 3 });
    expect(b.root).toBe(b2.root);
    const rec: IndexedRound = { source: "SETTLEMENT_BUILDER", epochId: 3, root: b.root as Hex, totalWei: b.totalWei, claimStart: 2_000_000_000, claimEnd: 2_002_592_000, leaves: b.leaves.map((l) => ({ index: l.index, account: l.account, amount: l.amount, proof: l.proof })) };
    const chain3: OnchainEpoch = { root: rec.root, allocation: BigInt(rec.totalWei), claimStart: BigInt(rec.claimStart), claimEnd: BigInt(rec.claimEnd), cancelled: false, released: false };
    const plan = planRoundIndexSync({ chainId: 677, distributor: DIST, epochCount: 3, local: [...imported, rec], chainEpochs: new Map([...epochs, [3, chain3]]), proofSources: sources });
    expect(plan.map((a) => a.action)).toEqual(["SKIP_EXISTING", "SKIP_EXISTING", "SKIP_EXISTING"]);
    const found = discoverWalletRounds(wallets[1], [...imported, rec]);
    expect(found).toHaveLength(1);
    const ok = buildHistoricalImport({ chainId: 677, distributor: DIST, epochId: 3, chain: chain3, proofSource: { epochId: 3, root: rec.root, leaves: rec.leaves } });
    expect(ok.status).toBe("IMPORT"); // proofs reproduce the root
    expect(roundClaimDisplay({ claimed: false, nowSec: rec.claimStart + 1, claimStart: rec.claimStart, claimEnd: rec.claimEnd }).claimButton).toBe(true);
  });
});
