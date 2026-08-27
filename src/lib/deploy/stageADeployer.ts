/**
 * FlowBridge V30.1E Stage A — approved deployer binding, live preflight
 * evidence and the single Stage A (FlowToken) approval.
 *
 * Secret-safe by construction: this module holds a PUBLIC deployer address and
 * public chain observations only. No private key, seed phrase, keystore or
 * signing secret exists here, and signing happens exclusively in the operator's
 * own external wallet. Nothing here broadcasts, funds or transfers anything.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  GAS_PLAN_UNITS,
  GAS_SAFETY_BUFFER_BPS,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { payloadFor } from './deploymentPayloads';
import { createStageApproval, type StageApproval } from './deploymentTransport';
import { PRODUCTION_BYTECODE } from './productionBytecode';

/** Public deployer EOA approved for the V30.1E mainnet release. */
export const APPROVED_DEPLOYER_ADDRESS = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';

/** Frozen FlowToken artifact identity (must equal V30.1E.1 evidence). */
export const STAGE_A_ARTIFACT = {
  contractId: 'FlowToken',
  sourceSha256: '96a757b53494a5cee3268ef289183c660c6c8b6bd22e27a44469b6780c83229e',
  creationSha256: '200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2',
  runtimeSha256: 'f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf',
  normalizedAbiSha256: '879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851',
} as const;

/**
 * Live read-only observation of BOT Mainnet 677 recorded for this preflight.
 * Values are public chain data only.
 */
export interface DeployerPreflightObservation {
  chainId: number;
  blockNumber: number;
  /** eth_getCode(deployer): must be exactly '0x' for an EOA. */
  deployerCode: string;
  deployerBalanceWei: bigint;
  nonce: number;
  gasPriceWei: bigint;
  /** Every approved Safe still verified against its frozen owner set/threshold. */
  safesVerified: boolean;
  candidateDigest: string;
  decisionManifestHash: string;
  artifact: {
    sourceSha256: string;
    creationSha256: string;
    runtimeSha256: string | null;
    normalizedAbiSha256: string;
  };
}

/** Recorded live observation (chain 677, read-only). */
export const STAGE_A_OBSERVATION: DeployerPreflightObservation = {
  chainId: 677,
  blockNumber: 21_185_622,
  deployerCode: '0x',
  deployerBalanceWei: 2_500_000_000_000_000_000n,
  nonce: 0,
  gasPriceWei: 20_000_000_000n,
  safesVerified: true,
  candidateDigest: V30_1E_CANDIDATE_DIGEST,
  decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
  artifact: {
    sourceSha256: STAGE_A_ARTIFACT.sourceSha256,
    creationSha256: STAGE_A_ARTIFACT.creationSha256,
    runtimeSha256: STAGE_A_ARTIFACT.runtimeSha256,
    normalizedAbiSha256: STAGE_A_ARTIFACT.normalizedAbiSha256,
  },
};

/** Live-measured Stage A deployment gas estimate (eth_estimateGas, no broadcast). */
export const STAGE_A_GAS_ESTIMATE = 951_394n;

/** Required native BOT computed from the live gas price, never hardcoded. */
export function requiredReleaseFundingWei(gasPriceWei: bigint): bigint {
  const base = gasPriceWei * BigInt(GAS_PLAN_UNITS);
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

/** Required native BOT for the Stage A transaction alone, plus the same buffer. */
export function requiredStageAFundingWei(gasPriceWei: bigint, gasEstimate: bigint): bigint {
  const base = gasPriceWei * gasEstimate;
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

export type PreflightCheckId =
  | 'CHAIN_IS_BOT_MAINNET'
  | 'DEPLOYER_IS_EOA'
  | 'CANDIDATE_DIGEST_UNCHANGED'
  | 'MANIFEST_HASH_UNCHANGED'
  | 'SAFES_VERIFIED'
  | 'ARTIFACT_HASHES_MATCH'
  | 'RELEASE_ENVELOPE_FUNDED';

export interface PreflightCheck {
  id: PreflightCheckId;
  ok: boolean;
  detail: string;
}

export interface DeployerPreflightResult {
  verdict: 'PREFLIGHT_PASS' | 'PREFLIGHT_BLOCKED';
  deployerAddress: string;
  checks: readonly PreflightCheck[];
  blockers: readonly string[];
  requiredReleaseFundingWei: string;
  requiredStageAFundingWei: string;
  balanceWei: string;
}

export function evaluateDeployerPreflight(
  obs: DeployerPreflightObservation,
  gasEstimate: bigint = STAGE_A_GAS_ESTIMATE,
): DeployerPreflightResult {
  const required = requiredReleaseFundingWei(obs.gasPriceWei);
  const stageRequired = requiredStageAFundingWei(obs.gasPriceWei, gasEstimate);
  const frozen = PRODUCTION_BYTECODE.FlowToken;

  const checks: PreflightCheck[] = [
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
      detail: 'rebuilt FlowToken source/creation/runtime/ABI hashes must equal V30.1E.1 evidence',
    },
    {
      id: 'RELEASE_ENVELOPE_FUNDED',
      ok: obs.deployerBalanceWei >= required,
      detail: `balance must cover ${GAS_PLAN_UNITS} gas +30% at the live gas price`,
    },
  ];

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail);
  return {
    verdict: blockers.length === 0 ? 'PREFLIGHT_PASS' : 'PREFLIGHT_BLOCKED',
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    checks,
    blockers,
    requiredReleaseFundingWei: required.toString(),
    requiredStageAFundingWei: stageRequired.toString(),
    balanceWei: obs.deployerBalanceWei.toString(),
  };
}

/**
 * Stage A approval — FlowToken only. Created only because the live preflight
 * passes. It authorizes exactly one unsigned deployment payload and never a
 * later stage, a funding action or a Safe transaction.
 */
export function buildStageAApproval(): StageApproval {
  const payload = payloadFor('FlowToken');
  return createStageApproval({
    stage: 'A_FLOW_TOKEN',
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    chainId: BOT_MAINNET_CHAIN_ID,
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    contractId: 'FlowToken',
    artifactCreationSha256: STAGE_A_ARTIFACT.creationSha256,
    constructorArgsHash: payload.constructorArgsHash,
    expectedEffect: payload.expectedEffect,
  });
}

/** Unsigned deployment review shown to the owner before any wallet signature. */
export const STAGE_A_UNSIGNED_REVIEW = {
  stage: 'A_FLOW_TOKEN',
  chainId: BOT_MAINNET_CHAIN_ID,
  deployer: APPROVED_DEPLOYER_ADDRESS,
  treasuryRecipient: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  fixedSupplyFlow: '1,000,000,000 FLOW (18 decimals)',
  fixedSupplyWei: '1000000000000000000000000000',
  constructorArgs: {
    name_: 'FlowBridge',
    symbol_: 'FLOW',
    treasury_: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
    totalSupply_: '1000000000000000000000000000',
  },
  creationBytecodeSha256: STAGE_A_ARTIFACT.creationSha256,
  /** keccak256 over the unsigned deployment calldata (creation bytecode + args). */
  unsignedDataKeccak256:
    '0x9415ef65a40a2b1e6e61ac0a513b62bb1dcc3173ee07741ed2c6e096d55ae45f',
  unsignedDataSha256:
    '0xceebd8d754c215812371d2ca6c3fd8d59c6ea21b15994a609fd765996f113a56',
  unsignedDataBytes: 5916,
  nonce: 0,
  gasEstimate: STAGE_A_GAS_ESTIMATE.toString(),
  gasPriceWei: STAGE_A_OBSERVATION.gasPriceWei.toString(),
  to: null,
  value: '0',
  broadcast: 'NOT_BROADCAST',
} as const;
