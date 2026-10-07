import { describe, expect, it } from "vitest";
import { buildPayoutBatch, discoverRounds } from "./payoutBatch";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";
import { merkleClaimLeafHash, verifyMerkleProof } from "./merkleClaim";

const DIST = "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922" as const;
const CANARY = "0x628e237b73C5a37EF3968527563FA1a26b32BB97";
const row = (wallet: string, authoritative: number) => ({ userId: wallet, wallet, classification: "MATCH", authoritative, pendingReview: 0 });
const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

describe("payout batch generation", () => {
  it("reproduces the published round #2 root exactly", () => {
    const b = buildPayoutBatch([row(CANARY, 10)], { chainId: 677, distributor: DIST, epochId: 2 });
    const m = MAINNET_EPOCH_MANIFESTS.find((x) => x.epochId === 2)!;
    expect(b.root).toBe(m.root);
    expect(b.leaves[0].proof).toEqual([]);
    expect(b.totalWei).toBe("10000000000000000000");
  });
  it("multi-leaf proofs all verify and sub-minimum leaves are dropped", () => {
    const rows = [1000, 1200, 999, 5000, 2000].map((p, i) => row(w(i + 1), p));
    const b = buildPayoutBatch(rows, { chainId: 677, distributor: DIST, epochId: 3 });
    expect(b.leaves).toHaveLength(4);
    for (const l of b.leaves) {
      const h = merkleClaimLeafHash({ chainId: 677, distributor: DIST, leaf: { epochId: 3, index: l.index, account: l.account, amount: l.amount } });
      expect(verifyMerkleProof({ leaf: h, proof: l.proof, root: b.root! })).toBe(true);
    }
    expect(b.status).toBe("CANDIDATE_UNSIGNED");
  });
  it("canary exception does not carry into another round", () => {
    expect(buildPayoutBatch([row(CANARY, 10)], { chainId: 677, distributor: DIST, epochId: 3 }).root).toBeNull();
  });
});

describe("round discovery", () => {
  it("in sync with live epochCount 2", () => expect(discoverRounds(2).inSync).toBe(true));
  it("flags an on-chain round missing from the app", () => expect(discoverRounds(3).missingFromApp).toEqual([3]));
});
