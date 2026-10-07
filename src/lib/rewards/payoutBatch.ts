/**
 * Automated payout-batch generation + published-round discovery (pure).
 * Grants NO publishing authority: output is an unsigned candidate the
 * existing publisher must still review, sign and broadcast.
 */
import type { Hex } from "viem";
import { buildDraftAllocation, type DraftAllocationInput } from "./rewardFundingPlan";
import { hashPair, merkleClaimLeafHash, verifyMerkleProof } from "./merkleClaim";
import { MAINNET_EPOCH_MANIFESTS } from "./mainnetEpochManifest";

export interface PayoutBatchLeaf { index: number; account: Hex; amount: string; leafHash: Hex; proof: Hex[] }
export interface PayoutBatch {
  status: "CANDIDATE_UNSIGNED";
  chainId: number;
  distributor: Hex;
  epochId: number;
  root: Hex | null;
  totalWei: string;
  leaves: PayoutBatchLeaf[];
}

function buildTree(leaves: Hex[]): Hex[][] {
  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    layers.push(next);
  }
  return layers;
}

function proofFor(layers: Hex[][], index: number): Hex[] {
  const proof: Hex[] = [];
  let i = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const sib = i ^ 1;
    if (sib < layers[l].length) proof.push(layers[l][sib]);
    i = Math.floor(i / 2);
  }
  return proof;
}

export function buildPayoutBatch(
  rows: DraftAllocationInput[],
  opts: { chainId: number; distributor: Hex; epochId: number },
): PayoutBatch {
  const draft = buildDraftAllocation(rows, { epochId: opts.epochId });
  const hashed = draft.leaves.map((l) => ({
    index: l.index,
    account: l.account as Hex,
    amount: l.amountWei,
    leafHash: merkleClaimLeafHash({
      chainId: opts.chainId,
      distributor: opts.distributor,
      leaf: { epochId: opts.epochId, index: l.index, account: l.account as Hex, amount: l.amountWei },
    }),
  }));
  if (!hashed.length) return { status: "CANDIDATE_UNSIGNED", ...opts, root: null, totalWei: "0", leaves: [] };
  const layers = buildTree(hashed.map((h) => h.leafHash));
  const root = layers[layers.length - 1][0];
  const leaves = hashed.map((h) => {
    const proof = proofFor(layers, h.index);
    if (!verifyMerkleProof({ leaf: h.leafHash, proof, root })) throw new Error("PROOF_SELF_CHECK_FAILED");
    return { ...h, proof };
  });
  return { status: "CANDIDATE_UNSIGNED", ...opts, root, totalWei: draft.totalWei, leaves };
}

/**
 * Compare the live on-chain epochCount with the frozen app manifest.
 * Rounds on chain but missing from the app are flagged so the app is updated
 * (the bug that hid round #2). Never auto-trusts unregistered roots.
 */
export function discoverRounds(liveEpochCount: number, manifests = MAINNET_EPOCH_MANIFESTS) {
  const known = new Set(manifests.map((m) => m.epochId));
  const missingFromApp: number[] = [];
  for (let e = 1; e <= liveEpochCount; e++) if (!known.has(e)) missingFromApp.push(e);
  const aheadOfChain = [...known].filter((e) => e > liveEpochCount);
  return { liveEpochCount, missingFromApp, aheadOfChain, inSync: !missingFromApp.length && !aheadOfChain.length };
}
