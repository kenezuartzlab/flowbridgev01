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
    sourceSha256: "96a757b53494a5cee3268ef289183c660c6c8b6bd22e27a44469b6780c83229e",
    standardInputSha256: "d8188e0288c79807f2ff8a209cb099e48cedce51a3ef69086e44c6a448d73590",
    creationSha256: "f15c487550c01c071784a39ff1de895645cb24ab626a719d449103730c7258d5",
    runtimeSha256: "73dcb8db0657a18bd57e4021900c57a646da1c6cb9b6eda3c2e3e725db4130f9",
    normalizedAbiSha256: "879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851",
    runtimeBytes: 3760,
    doubleBuildIdentical: true,
  },
  {
    contractId: "FlowRewardsMerkleDistributor",
    stage: "R2",
    solc: "0.8.24+commit.e11b9ed9",
    optimizerRuns: 200,
    viaIR: false,
    evmVersion: "cancun",
    sourceSha256: "cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43",
    standardInputSha256: "f57d0b9357b68a1d876a065fe16f6f21e4272972d4a7f78307c30444d8d94719",
    creationSha256: "b54e6071d7859265dbf12999f6804f5f5f26af759104aea5a2cb85a8b043f0f5",
    runtimeSha256: "0d240fe4af5ebb24d16cead6aacd8175dbf6620e516754bd26809be35fa24713",
    normalizedAbiSha256: "821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79",
    runtimeBytes: 6629,
    doubleBuildIdentical: true,
  },
  {
    contractId: "FlowBridgeActivityRegistry",
    stage: "R3",
    solc: "0.8.20+commit.a1b79de6",
    optimizerRuns: 200,
    viaIR: false,
    evmVersion: "shanghai",
    sourceSha256: "2735de22c1f59a4c7ba7c4c66a2944b03db19aa3c76d670d0ef9a20ff5aeca6e",
    standardInputSha256: "8ccef59346968e5d800f237ca0deecd9ea51970f0c90b7bbb88c1a4ce4b8976f",
    creationSha256: "cc61be5fadf4fd164a6c996e3f30874197702795c8ebe99c70124e85f0d0037e",
    runtimeSha256: "9f4b0026beb3b139065313193309605aa312d06343af34def8dd46b178b9df78",
    normalizedAbiSha256: "e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d",
    runtimeBytes: 3082,
    doubleBuildIdentical: true,
  },
  {
    contractId: "FlowStakingRewardTreasury",
    stage: "R4",
    solc: "0.8.24+commit.e11b9ed9",
    optimizerRuns: 200,
    viaIR: false,
    evmVersion: "cancun",
    sourceSha256: "963ce367246ebc673e1d915202759a5159604dd0a794484b68500f921155d8a8",
    standardInputSha256: "99848d1f1aa7ab20f56acb61ee77447e8608af30b53e1a50fafb130b2656896a",
    creationSha256: "d3b676d3da8cc38247be64b9ab83dc49cc0675cc4e4b41dbd3a638611d518360",
    runtimeSha256: "747a268c8740d24099594de823af2a10b9472f09d85f61da5a17a597f7a09cea",
    normalizedAbiSha256: "3cfeefcdd459ca697e3f6f1891e3ffe9a325896f544d9b32a7358fabb115065a",
    runtimeBytes: 4827,
    doubleBuildIdentical: true,
  },
  {
    contractId: "FlowStakingController",
    stage: "R5",
    solc: "0.8.24+commit.e11b9ed9",
    optimizerRuns: 200,
    viaIR: false,
    evmVersion: "cancun",
    sourceSha256: "b2a58b1128c0a9d42630b0026ce69cc377abbce6c9ea3ec42721c73d40afc0d4",
    standardInputSha256: "2cb8a4247762f6bdfb774d834f2788b4db0644792edbaf6a7a5409298e019e06",
    creationSha256: "7734b53078fd6cc2668b9f03534a6c015e8864dfaae7c07d0c12f4b3f022da9d",
    runtimeSha256: "408ee63a90219cdb873fbff9602dbddfe4875e3c78108ea44c1d7e601c95a250",
    normalizedAbiSha256: "b61bcac1780e51fda835b9e57318a7198c09d4d6e7542a3dabb7640c3fe0e88f",
    runtimeBytes: 7997,
    doubleBuildIdentical: true,
  },
  {
    contractId: "FlowStakingVaultV2",
    stage: "R6",
    solc: "0.8.24+commit.e11b9ed9",
    optimizerRuns: 200,
    viaIR: true,
    evmVersion: "cancun",
    sourceSha256: "4a82e4f0f9c07e2a24bc7150d80675c6c3d1b8359ce11589aac55fb7c75b2531",
    standardInputSha256: "5b35d7eb0ed90baabd8862e28d32a1b27498833aefd1e78a81f9de4e74d6bcef",
    creationSha256: "159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6",
    runtimeSha256: "af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce",
    normalizedAbiSha256: "a22dacc20032a9a188034b1fd1ea4c66eaa8ae3827259ac790a6897fd52369e0",
    runtimeBytes: 10366,
    doubleBuildIdentical: true,
  },
];

export const V30_2A_CANDIDATE_DIGEST_INPUT = {
  gate: "V30.2A" as const,
  chainId: BOT_MAINNET_CHAIN_ID,
  builds: V30_2A_FROZEN_BUILDS.map(({ doubleBuildIdentical: _ignored, ...rest }) => rest),
};


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
