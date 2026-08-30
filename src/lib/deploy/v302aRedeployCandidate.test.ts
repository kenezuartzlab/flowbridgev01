import { describe, expect, it } from "vitest";
import {
  OLD_V30_1_DEPLOYMENT,
  REDEPLOY_SEQUENCE,
  RETAINED_CONTRACTS,
  V30_2A_CANDIDATE_DIGEST_INPUT,
  V30_2A_FROZEN_BUILDS,
  authorizeRedeployStage,
  canPromoteCanonicalToken,
  computeCandidateDigest,
  fundingAllowed,
  withinEip170,
} from "./v302aRedeployCandidate";

const DIGEST = computeCandidateDigest(V30_2A_CANDIDATE_DIGEST_INPUT);
const frozenIds = V30_2A_FROZEN_BUILDS.map((b) => b.contractId);

const base = {
  verifiedStages: {} as Record<string, "SOURCE_VERIFIED">,
  ownerApprovedStages: ["R1"] as const,
  frozenBuildContractIds: frozenIds,
  candidateDigest: DIGEST,
  approvedCandidateDigest: DIGEST,
  oldStackFundedOrExposed: false,
};

describe("V30.2A build matrix", () => {
  it("freezes every replacement contract with double-build parity inside EIP-170", () => {
    expect(V30_2A_FROZEN_BUILDS).toHaveLength(6);
    for (const b of V30_2A_FROZEN_BUILDS) {
      expect(b.doubleBuildIdentical).toBe(true);
      expect(withinEip170(b.runtimeBytes)).toBe(true);
      expect(b.creationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.runtimeSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("uses non-viaIR everywhere except the documented Vault V2 exception", () => {
    const ir = V30_2A_FROZEN_BUILDS.filter((b) => b.viaIR).map((b) => b.contractId);
    expect(ir).toEqual(["FlowStakingVaultV2"]);
    const vault = REDEPLOY_SEQUENCE.find((s) => s.stage === "R6")!;
    expect(vault.viaIR).toBe(true);
    expect(vault.viaIrJustification).toContain("Stack too deep");
  });

  it("produces a new candidate digest, not a reused V30.1 digest", () => {
    expect(DIGEST).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(DIGEST).not.toBe("fnv1a64:9972234982dbe76f");
    expect(DIGEST).not.toBe("fnv1a64:19671fd13a81be19");
  });
});

describe("one-by-one stage authorization", () => {
  it("authorizes R1 only with owner approval and a matching digest", () => {
    expect(authorizeRedeployStage({ stage: "R1", ...base })).toEqual({
      authorized: true,
      stage: "R1",
      contractId: "FlowToken",
    });
    expect(authorizeRedeployStage({ stage: "R1", ...base, ownerApprovedStages: [] })).toMatchObject({
      authorized: false,
      reason: "ownerApprovalMissing",
    });
    expect(
      authorizeRedeployStage({ stage: "R1", ...base, approvedCandidateDigest: "fnv1a64:0000000000000000" }),
    ).toMatchObject({ authorized: false, reason: "candidateDigestMismatch" });
  });

  it("blocks a dependent stage while its dependency is source-pending", () => {
    expect(
      authorizeRedeployStage({ stage: "R2", ...base, ownerApprovedStages: ["R2"] }),
    ).toMatchObject({ authorized: false, reason: "dependencyNotSourceVerified" });
    expect(
      authorizeRedeployStage({
        stage: "R2",
        ...base,
        ownerApprovedStages: ["R2"],
        verifiedStages: { R1: "SOURCE_VERIFIED" },
      }),
    ).toMatchObject({ authorized: true, contractId: "FlowRewardsMerkleDistributor" });
  });

  it("fails closed on unknown stages, unfrozen builds and old-stack exposure", () => {
    expect(
      authorizeRedeployStage({ stage: "R9" as never, ...base }),
    ).toMatchObject({ authorized: false, reason: "unknownStage" });
    expect(
      authorizeRedeployStage({ stage: "R1", ...base, frozenBuildContractIds: [] }),
    ).toMatchObject({ authorized: false, reason: "buildNotFrozen" });
    expect(
      authorizeRedeployStage({ stage: "R1", ...base, oldStackFundedOrExposed: true }),
    ).toMatchObject({ authorized: false, reason: "oldStackFundedOrExposed" });
  });

  it("never marks a replacement stage as funded or activated at deploy time", () => {
    for (const s of REDEPLOY_SEQUENCE) expect(s.deployFundedOrActivated).toBe(false);
  });
});

describe("quarantine and funding safety", () => {
  it("quarantines the whole old economic stack with no funding or app exposure", () => {
    expect(OLD_V30_1_DEPLOYMENT).toHaveLength(6);
    for (const c of OLD_V30_1_DEPLOYMENT) {
      expect(c.lifecycle).toBe("OLD_DEPLOYMENT_DEPRECATED");
      expect(c.fundingAllowed).toBe(false);
      expect(c.canonicalAppExposure).toBe(false);
    }
  });

  it("retains the verified Router stack untouched", () => {
    expect(RETAINED_CONTRACTS.map((c) => c.contractId)).toEqual([
      "FlowBridgeRouterV4",
      "FlowBridgeRouterLens",
      "FlowBridgeRouter@v3",
    ]);
    for (const c of RETAINED_CONTRACTS) expect(c.retained).toBe(true);
  });

  it("never allows funding the old stack and requires new-only canonical registry", () => {
    expect(
      fundingAllowed({
        target: "OLD",
        newStackFullyVerified: true,
        canonicalRegistryPointsToNewOnly: true,
        treasurySafeApproved2of3: true,
      }),
    ).toBe(false);
    expect(
      fundingAllowed({
        target: "NEW",
        newStackFullyVerified: true,
        canonicalRegistryPointsToNewOnly: false,
        treasurySafeApproved2of3: true,
      }),
    ).toBe(false);
    expect(
      fundingAllowed({
        target: "NEW",
        newStackFullyVerified: true,
        canonicalRegistryPointsToNewOnly: true,
        treasurySafeApproved2of3: true,
      }),
    ).toBe(true);
  });

  it("promotes a canonical token only when verified and neither stack is funded", () => {
    expect(
      canPromoteCanonicalToken({
        newTokenVerified: true,
        oldTokenLifecycle: "OLD_DEPLOYMENT_DEPRECATED",
        oldTokenFunded: false,
        newTokenFunded: false,
      }),
    ).toBe(true);
    expect(
      canPromoteCanonicalToken({
        newTokenVerified: false,
        oldTokenLifecycle: "OLD_DEPLOYMENT_DEPRECATED",
        oldTokenFunded: false,
        newTokenFunded: false,
      }),
    ).toBe(false);
    expect(
      canPromoteCanonicalToken({
        newTokenVerified: true,
        oldTokenLifecycle: "NEW_CANONICAL_PENDING",
        oldTokenFunded: false,
        newTokenFunded: false,
      }),
    ).toBe(false);
  });
});
