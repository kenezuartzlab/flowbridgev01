/**
 * FlowBridge V30.1E.6 Stage B — FlowRewardsMerkleDistributor preflight,
 * unsigned deployment review and the single Stage B approval binding.
 *
 * Secret-safe by construction: public deployer address and public chain
 * observations only. Nothing here signs, broadcasts, funds or transfers.
 * Stage B remains NOT BROADCAST until the owner records approval.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  APPROVED_AUTHORITIES,
  GAS_SAFETY_BUFFER_BPS,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { payloadFor } from './deploymentPayloads';
import { createStageApproval, type StageApproval } from './deploymentTransport';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';
import { STAGE_A_SETTLEMENT } from './stageASettlement';

/**
 * V30.1E.6 progression rule: public source publication is a release-completion
 * blocker, not a blocker to deploying the next unfunded contract, provided the
 * settled stage has proven on-chain parity and a frozen verification bundle.
 * Economic activation (funding, roots, product enablement, traffic migration)
 * stays blocked while a contract is SOURCE_PENDING.
 */
export const FLOW_TOKEN_RELEASE_STATUS = 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING' as const;
export const EXPLORER_BLOCK_CLASSIFICATION = 'EXPLORER_TRANSPORT_BLOCKED' as const;

/** Frozen Stage B artifact identity (must equal V30.1E.1 evidence). */
export const STAGE_B_ARTIFACT = {
  contractId: 'FlowRewardsMerkleDistributor',
  sourceSha256: 'cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43',
  creationSha256: '21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581',
  runtimeSha256: 'a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367',
  normalizedAbiSha256: '821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79',
  runtimeBytes: 5861,
} as const;

/** Exact constructor arguments resolved against the settled Stage A token. */
export const STAGE_B_CONSTRUCTOR_ARGS = {
  token_: STAGE_A_SETTLEMENT.contractAddress,
  admin_: APPROVED_AUTHORITIES.governanceSafe,
  budgetManager_: APPROVED_AUTHORITIES.governanceSafe,
  publisher_: APPROVED_AUTHORITIES.rootPublisher,
  pauser_: APPROVED_AUTHORITIES.operationsSafe,
  recoveryRecipient_: APPROVED_AUTHORITIES.treasurySafe,
  minPublishDelay_: 86_400,
} as const;

/** Live read-only observation recorded for the Stage B preflight (chain 677). */
export interface StageBObservation {
  chainId: number;
  blockNumber: number;
  deployerCode: string;
  deployerBalanceWei: bigint;
  nonce: number;
  gasPriceWei: bigint;
  gasEstimate: bigint;
  safesVerified: boolean;
  candidateDigest: string;
  decisionManifestHash: string;
  /** Deployed FlowToken observations — Stage B binds to this exact address. */
  flowTokenAddress: string;
  flowTokenCodeBytes: number;
  flowTokenTotalSupplyWei: bigint;
  treasuryFlowBalanceWei: bigint;
  artifact: {
    sourceSha256: string;
    creationSha256: string;
    runtimeSha256: string;
    normalizedAbiSha256: string;
    doubleBuildReproducible: boolean;
  };
  /** Unsigned deployment data (creation bytecode + encoded constructor args). */
  unsignedDataBytes: number;
  unsignedDataKeccak256: string;
}

/** Recorded live observation — BOT Mainnet 677, read-only JSON-RPC. */
export const STAGE_B_OBSERVATION: StageBObservation = {
  chainId: 677,
  blockNumber: 21_317_120,
  deployerCode: '0x',
  deployerBalanceWei: 2_481_145_100_000_000_000n,
  nonce: 1,
  gasPriceWei: 20_000_000_000n,
  gasEstimate: 1_522_268n,
  safesVerified: true,
  candidateDigest: V30_1E_CANDIDATE_DIGEST,
  decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
  flowTokenAddress: STAGE_A_SETTLEMENT.contractAddress,
  flowTokenCodeBytes: 3539,
  flowTokenTotalSupplyWei: 1_000_000_000_000_000_000_000_000_000n,
  treasuryFlowBalanceWei: 1_000_000_000_000_000_000_000_000_000n,
  artifact: {
    sourceSha256: STAGE_B_ARTIFACT.sourceSha256,
    creationSha256: STAGE_B_ARTIFACT.creationSha256,
    runtimeSha256: STAGE_B_ARTIFACT.runtimeSha256,
    normalizedAbiSha256: STAGE_B_ARTIFACT.normalizedAbiSha256,
    doubleBuildReproducible: true,
  },
  unsignedDataBytes: 7405,
  unsignedDataKeccak256: '0xddf141657b99ecdcbe0f21744d64df213efd2d81ba070453422e2ef4facc3e01',
};

export type StageBCheckId =
  | 'CHAIN_IS_BOT_MAINNET'
  | 'DEPLOYER_IS_EOA'
  | 'DEPLOYER_NONCE_EXPECTED'
  | 'CANDIDATE_DIGEST_UNCHANGED'
  | 'MANIFEST_HASH_UNCHANGED'
  | 'SAFES_VERIFIED'
  | 'ARTIFACT_HASHES_MATCH'
  | 'ARTIFACT_DOUBLE_BUILD_REPRODUCIBLE'
  | 'TOKEN_BINDING_LIVE'
  | 'TOKEN_ECONOMICS_UNCHANGED'
  | 'CONSTRUCTOR_ARGS_MATCH_MANIFEST'
  | 'PUBLISH_DELAY_IS_24H'
  | 'STAGE_FUNDING_COVERED';

export interface StageBCheck {
  id: StageBCheckId;
  ok: boolean;
  detail: string;
}

export interface StageBPreflightResult {
  verdict: 'STAGE_B_PREFLIGHT_PASS' | 'STAGE_B_PREFLIGHT_BLOCKED';
  deployerAddress: string;
  checks: readonly StageBCheck[];
  blockers: readonly string[];
  requiredStageFundingWei: string;
  balanceWei: string;
}

export function requiredStageBFundingWei(gasPriceWei: bigint, gasEstimate: bigint): bigint {
  const base = gasPriceWei * gasEstimate;
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

const lc = (v: string) => v.toLowerCase();

export function evaluateStageBPreflight(
  obs: StageBObservation = STAGE_B_OBSERVATION,
): StageBPreflightResult {
  const frozen = PRODUCTION_BYTECODE.FlowRewardsMerkleDistributor;
  const payload = payloadFor('FlowRewardsMerkleDistributor');
  const required = requiredStageBFundingWei(obs.gasPriceWei, obs.gasEstimate);
  const args = STAGE_B_CONSTRUCTOR_ARGS;

  const manifestArgsMatch =
    lc(args.token_) === lc(STAGE_A_SETTLEMENT.contractAddress) &&
    lc(args.admin_) === lc(APPROVED_AUTHORITIES.governanceSafe) &&
    lc(args.budgetManager_) === lc(APPROVED_AUTHORITIES.governanceSafe) &&
    lc(args.publisher_) === lc(APPROVED_AUTHORITIES.rootPublisher) &&
    lc(args.pauser_) === lc(APPROVED_AUTHORITIES.operationsSafe) &&
    lc(args.recoveryRecipient_) === lc(APPROVED_AUTHORITIES.treasurySafe) &&
    payload.contractId === 'FlowRewardsMerkleDistributor';

  const checks: StageBCheck[] = [
    {
      id: 'CHAIN_IS_BOT_MAINNET',
      ok: obs.chainId === BOT_MAINNET_CHAIN_ID,
      detail: `eth_chainId ${obs.chainId} must equal ${BOT_MAINNET_CHAIN_ID}`,
    },
    {
      id: 'DEPLOYER_IS_EOA',
      ok: obs.deployerCode === '0x',
      detail: 'eth_getCode(deployer) must be 0x (externally owned account)',
    },
    {
      id: 'DEPLOYER_NONCE_EXPECTED',
      ok: obs.nonce === 1,
      detail: 'nonce must be exactly 1 (Stage A consumed nonce 0, no other broadcast since)',
    },
    {
      id: 'CANDIDATE_DIGEST_UNCHANGED',
      ok: obs.candidateDigest === V30_1E_CANDIDATE_DIGEST,
      detail: `candidate ${obs.candidateDigest} vs frozen ${V30_1E_CANDIDATE_DIGEST}`,
    },
    {
      id: 'MANIFEST_HASH_UNCHANGED',
      ok: obs.decisionManifestHash === V30_1E_DECISION_MANIFEST_HASH,
      detail: `manifest ${obs.decisionManifestHash} vs frozen ${V30_1E_DECISION_MANIFEST_HASH}`,
    },
    {
      id: 'SAFES_VERIFIED',
      ok: obs.safesVerified,
      detail: 'Treasury, Governance and Operations Safes must all verify (3 owners, threshold 2)',
    },
    {
      id: 'ARTIFACT_HASHES_MATCH',
      ok:
        obs.artifact.sourceSha256 === frozen.sourceSha256 &&
        obs.artifact.creationSha256 === frozen.creationSha256 &&
        obs.artifact.runtimeSha256 === frozen.runtimeSha256 &&
        obs.artifact.normalizedAbiSha256 === frozen.normalizedAbiSha256,
      detail: 'rebuilt distributor source/creation/runtime/ABI hashes must equal V30.1E.1 evidence',
    },
    {
      id: 'ARTIFACT_DOUBLE_BUILD_REPRODUCIBLE',
      ok: obs.artifact.doubleBuildReproducible,
      detail: 'two clean builds must produce byte-identical creation and runtime bytecode',
    },
    {
      id: 'TOKEN_BINDING_LIVE',
      ok:
        lc(obs.flowTokenAddress) === lc(STAGE_A_SETTLEMENT.contractAddress) &&
        obs.flowTokenCodeBytes === STAGE_A_SETTLEMENT.runtimeBytes,
      detail: 'token_ must be the settled FlowToken address with its verified 3,539-byte runtime',
    },
    {
      id: 'TOKEN_ECONOMICS_UNCHANGED',
      ok:
        obs.flowTokenTotalSupplyWei === 1_000_000_000n * 10n ** 18n &&
        obs.treasuryFlowBalanceWei === obs.flowTokenTotalSupplyWei,
      detail: '1,000,000,000 FLOW total supply still fully held by the Treasury Safe',
    },
    {
      id: 'CONSTRUCTOR_ARGS_MATCH_MANIFEST',
      ok: manifestArgsMatch,
      detail: 'constructor roles must equal the frozen decision manifest authorities',
    },
    {
      id: 'PUBLISH_DELAY_IS_24H',
      ok: args.minPublishDelay_ === 86_400,
      detail: 'minPublishDelay_ must be exactly 86,400 seconds (24h root delay)',
    },
    {
      id: 'STAGE_FUNDING_COVERED',
      ok: obs.deployerBalanceWei >= required,
      detail: 'deployer balance must cover the live gas estimate +30% at the live gas price',
    },
  ];

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail);
  return {
    verdict: blockers.length === 0 ? 'STAGE_B_PREFLIGHT_PASS' : 'STAGE_B_PREFLIGHT_BLOCKED',
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    checks,
    blockers,
    requiredStageFundingWei: required.toString(),
    balanceWei: obs.deployerBalanceWei.toString(),
  };
}

/**
 * One-time Stage B approval, bound to the exact artifact, constructor args,
 * deployer and chain. Created only when the live preflight passes; it never
 * authorizes funding, a root publication or any later stage.
 */
export function buildStageBApproval(): StageApproval {
  const payload = payloadFor('FlowRewardsMerkleDistributor');
  return createStageApproval({
    stage: 'B_REWARDS_DISTRIBUTOR',
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    chainId: BOT_MAINNET_CHAIN_ID,
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    contractId: 'FlowRewardsMerkleDistributor',
    artifactCreationSha256: STAGE_B_ARTIFACT.creationSha256,
    constructorArgsHash: payload.constructorArgsHash,
    expectedEffect: payload.expectedEffect,
  });
}

/** Unsigned Stage B review returned to the owner before any signature. */
export const STAGE_B_UNSIGNED_REVIEW = {
  stage: 'B_REWARDS_DISTRIBUTOR',
  contractId: 'FlowRewardsMerkleDistributor',
  chainId: 677,
  from: APPROVED_DEPLOYER_ADDRESS,
  to: null,
  value: '0',
  nonce: 1,
  gasPriceWei: '20000000000',
  gasEstimate: '1522268',
  gasLimit: '1978948',
  creationBytes: 7181,
  unsignedDataBytes: 7405,
  unsignedDataKeccak256: STAGE_B_OBSERVATION.unsignedDataKeccak256,
  constructorArgs: STAGE_B_CONSTRUCTOR_ARGS,
  initialReservedObligations: '0',
  initialFunding: '0',
  ownerApproval: 'NOT_RECORDED',
  broadcast: 'NOT_BROADCAST',
} as const;
