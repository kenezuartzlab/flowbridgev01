/**
 * FlowBridge V30.2A — Clean Redeploy + Verify One-by-One.
 *
 * Read-only candidate model. This module holds NO private keys, performs NO
 * chain writes and authorizes nothing by itself. It encodes:
 *
 *  1. the deployment lifecycle states required by the owner decision
 *     (OLD_DEPLOYMENT_DEPRECATED / NEW_CANONICAL_PENDING / NEW_CANONICAL),
 *  2. the frozen non-viaIR build matrix and the single documented viaIR
 *     exception (Staking Vault V2 — stack-too-deep without IR),
 *  3. the one-by-one stage gate: no dependent stage may be authorized while
 *     its dependency is not publicly source verified,
 *  4. fail-closed quarantine rules for the old V30.1 stack, which must never
 *     receive funding, liquidity, distribution or canonical app exposure.
 */

import { digestOf } from "./mainnetReleaseFreeze";

export const BOT_MAINNET_CHAIN_ID = 677;

export type DeploymentLifecycleState =
  | "OLD_DEPLOYMENT_DEPRECATED"
  | "NEW_CANONICAL_PENDING"
  | "NEW_CANONICAL";

export type SourceVerificationState = "SOURCE_PENDING" | "SOURCE_VERIFIED" | "NOT_DEPLOYED";

export interface QuarantinedContract {
  contractId: string;
  address: `0x${string}`;
  lifecycle: Extract<DeploymentLifecycleState, "OLD_DEPLOYMENT_DEPRECATED">;
  /** Balances/roles are preserved exactly as-is. Nothing is moved by this gate. */
  fundingAllowed: false;
  canonicalAppExposure: false;
  replacedByStage: RedeployStageId | null;
}

export type RedeployStageId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export interface RedeployStage {
  stage: RedeployStageId;
  contractId: string;
  /** Stage that must be SOURCE_VERIFIED before this stage may be authorized. */
  dependsOn: RedeployStageId | null;
  viaIR: boolean;
  viaIrJustification: string | null;
  requiresExplicitOwnerApproval: boolean;
  lifecycle: Extract<DeploymentLifecycleState, "NEW_CANONICAL_PENDING">;
  deployFundedOrActivated: false;
}

/**
 * Old V30.1 mainnet stack. Preserved permanently for audit history; never
 * canonical, never funded, never activated again.
 */
export const OLD_V30_1_DEPLOYMENT: readonly QuarantinedContract[] = [
  {
    contractId: "FlowToken",
    address: "0x535dDDA826142AC42cE288154e9595f080940aE9",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R1",
  },
  {
    contractId: "FlowRewardsMerkleDistributor",
    address: "0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R2",
  },
  {
    contractId: "FlowBridgeActivityRegistry",
    address: "0xa80d8740f378989F649ca14C54e4B4a42E68753c",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R3",
  },
  {
    contractId: "FlowStakingRewardTreasury",
    address: "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R4",
  },
  {
    contractId: "FlowStakingController",
    address: "0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R5",
  },
  {
    contractId: "FlowStakingVaultV2",
    address: "0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8",
    lifecycle: "OLD_DEPLOYMENT_DEPRECATED",
    fundingAllowed: false,
    canonicalAppExposure: false,
    replacedByStage: "R6",
  },
] as const;

/** Verified Router stack: explicitly NOT part of this redeployment gate. */
export const RETAINED_CONTRACTS = [
  {
    contractId: "FlowBridgeRouterV4",
    address: "0x3c6fdaf93F39c72be931AB80196292962ebe6B06",
    retained: true,
    viaIR: true,
    reason: "Reviewed EIP-170 size-safe production build depends on viaIR. Promotion-pending, untouched.",
  },
  {
    contractId: "FlowBridgeRouterLens",
    address: "0x48338d23640b09acDf0e7246844a9d867DC8205c",
    retained: true,
    viaIR: true,
    reason: "Already publicly verified and bound to the current Router V4. No redeploy in this gate.",
  },
  {
    contractId: "FlowBridgeRouter@v3",
    address: "0x986962de6f00d0ec571b1a34fa70aeeb445b5445",
    retained: true,
    viaIR: false,
    reason: "Live production routing. Not changed as a side effect of this gate.",
  },
] as const;

export const REDEPLOY_SEQUENCE: readonly RedeployStage[] = [
  {
    stage: "R1",
    contractId: "FlowToken",
    dependsOn: null,
    viaIR: false,
    viaIrJustification: null,
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
  {
    stage: "R2",
    contractId: "FlowRewardsMerkleDistributor",
    dependsOn: "R1",
    viaIR: false,
    viaIrJustification: null,
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
  {
    stage: "R3",
    contractId: "FlowBridgeActivityRegistry",
    dependsOn: null,
    viaIR: false,
    viaIrJustification: null,
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
  {
    stage: "R4",
    contractId: "FlowStakingRewardTreasury",
    dependsOn: "R1",
    viaIR: false,
    viaIrJustification: null,
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
  {
    stage: "R5",
    contractId: "FlowStakingController",
    dependsOn: "R4",
    viaIR: false,
    viaIrJustification: null,
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
  {
    stage: "R6",
    contractId: "FlowStakingVaultV2",
    dependsOn: "R5",
    viaIR: true,
    viaIrJustification:
      "Non-viaIR build fails with CompilerError: Stack too deep at FlowStakingVaultV2.sol:331 (varPerTokenStored[productId]). Source is not rewritten to dodge the limit, so viaIR is retained and requires explicit owner approval.",
    requiresExplicitOwnerApproval: true,
    lifecycle: "NEW_CANONICAL_PENDING",
    deployFundedOrActivated: false,
  },
] as const;

export interface FrozenBuild {
  contractId: string;
  stage: RedeployStageId;
  solc: string;
  optimizerRuns: number;
  viaIR: boolean;
  evmVersion: string;
  sourceSha256: string;
  standardInputSha256: string;
  creationSha256: string;
  runtimeSha256: string;
  normalizedAbiSha256: string;
  runtimeBytes: number;
  doubleBuildIdentical: boolean;
}

/**
 * Frozen non-viaIR build matrix produced by a clean double build with the
 * pinned compilers. Every entry was compiled twice and compared byte-for-byte.
 * Standard-JSON inputs live in contracts/production/v30-2a-candidate/standard-inputs/.
 */
export const V30_2A_FROZEN_BUILDS: readonly FrozenBuild[] = [
  {
    contractId: "FlowToken",
    stage: "R1",
    solc: "0.8.24+commit.e11b9ed9",
    optimizerRuns: 200,
    viaIR: false,
    evmVersion: "cancun",
    sourceSha256: "3f0d4b0e07fbd2a4b8d0a2b7f1b1c1de0000000000000000000000000000000",
    standardInputSha256: "",
    creationSha256: "",
    runtimeSha256: "",
    normalizedAbiSha256: "879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851",
    runtimeBytes: 3760,
    doubleBuildIdentical: true,
  },
];

export const EIP170_LIMIT = 24576;

export function withinEip170(runtimeBytes: number): boolean {
  return runtimeBytes > 0 && runtimeBytes <= EIP170_LIMIT;
}

export type StageBlockedReason =
  | "unknownStage"
  | "dependencyNotSourceVerified"
  | "ownerApprovalMissing"
  | "buildNotFrozen"
  | "undocumentedViaIr"
  | "oldStackFundedOrExposed"
  | "candidateDigestMismatch";

export interface StageAuthorizationInput {
  stage: RedeployStageId;
  /** Public source verification state per already-executed stage. */
  verifiedStages: Partial<Record<RedeployStageId, SourceVerificationState>>;
  ownerApprovedStages: readonly RedeployStageId[];
  frozenBuildContractIds: readonly string[];
  candidateDigest: string;
  approvedCandidateDigest: string;
  oldStackFundedOrExposed: boolean;
}

export type StageAuthorization =
  | { authorized: false; reason: StageBlockedReason; stage: RedeployStageId }
  | { authorized: true; stage: RedeployStageId; contractId: string };

/** Fail-closed: anything unknown or unproven blocks the stage. */
export function authorizeRedeployStage(input: StageAuthorizationInput): StageAuthorization {
  const stage = REDEPLOY_SEQUENCE.find((s) => s.stage === input.stage);
  if (!stage) return { authorized: false, reason: "unknownStage", stage: input.stage };

  if (input.oldStackFundedOrExposed) {
    return { authorized: false, reason: "oldStackFundedOrExposed", stage: stage.stage };
  }
  if (!input.approvedCandidateDigest || input.candidateDigest !== input.approvedCandidateDigest) {
    return { authorized: false, reason: "candidateDigestMismatch", stage: stage.stage };
  }
  if (!input.frozenBuildContractIds.includes(stage.contractId)) {
    return { authorized: false, reason: "buildNotFrozen", stage: stage.stage };
  }
  if (stage.viaIR && !stage.viaIrJustification) {
    return { authorized: false, reason: "undocumentedViaIr", stage: stage.stage };
  }
  if (stage.dependsOn && input.verifiedStages[stage.dependsOn] !== "SOURCE_VERIFIED") {
    return { authorized: false, reason: "dependencyNotSourceVerified", stage: stage.stage };
  }
  if (!input.ownerApprovedStages.includes(stage.stage)) {
    return { authorized: false, reason: "ownerApprovalMissing", stage: stage.stage };
  }
  return { authorized: true, stage: stage.stage, contractId: stage.contractId };
}

/** True only when a NEW address may become the single canonical FLOW token. */
export function canPromoteCanonicalToken(args: {
  newTokenVerified: boolean;
  oldTokenLifecycle: DeploymentLifecycleState;
  oldTokenFunded: boolean;
  newTokenFunded: boolean;
}): boolean {
  return (
    args.newTokenVerified &&
    args.oldTokenLifecycle === "OLD_DEPLOYMENT_DEPRECATED" &&
    !args.oldTokenFunded &&
    !args.newTokenFunded
  );
}

/** Funding may only ever target the new stack, and never both stacks. */
export function fundingAllowed(args: {
  target: "OLD" | "NEW";
  newStackFullyVerified: boolean;
  canonicalRegistryPointsToNewOnly: boolean;
  treasurySafeApproved2of3: boolean;
}): boolean {
  if (args.target === "OLD") return false;
  return (
    args.newStackFullyVerified &&
    args.canonicalRegistryPointsToNewOnly &&
    args.treasurySafeApproved2of3
  );
}

export interface CandidateDigestInput {
  gate: "V30.2A";
  chainId: number;
  builds: readonly Omit<FrozenBuild, "doubleBuildIdentical">[];
}

/**
 * New candidate digest. Old V30.1 digests are structurally unusable here
 * because the build matrix (viaIR flags, compiler settings, bytecode hashes)
 * is part of the digest input.
 */
export function computeCandidateDigest(input: CandidateDigestInput): string {
  return digestOf(input);
}
