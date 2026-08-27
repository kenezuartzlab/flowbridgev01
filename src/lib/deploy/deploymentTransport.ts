/**
 * FlowBridge V30.1E.1 — secure deployment transport + per-stage approvals.
 *
 * Transport is external-wallet only: Lovable prepares an unsigned transaction
 * and the operator's own wallet signs it on BOT Mainnet 677. There is
 * deliberately NO field anywhere in this model for a private key, seed phrase,
 * keystore or raw signing secret — see `TRANSPORT_MODEL_FIELDS` and its test.
 *
 * Nothing in this module broadcasts, signs, or funds anything.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  APPROVED_AUTHORITIES,
  GAS_SAFETY_BUFFER_BPS,
  type DeploymentStageId,
} from './mainnetDeploymentGate';
import { V30_1E_CANDIDATE_DIGEST, V30_1E_DECISION_MANIFEST_HASH } from './mainnetDeploymentGate';
import { fnv1a64 } from './mainnetReleaseFreeze';
import type { DeploymentPayload } from './deploymentPayloads';
import { type ProductionContractId, PRODUCTION_BYTECODE } from './productionBytecode';

export type TransportState =
  | 'NO_SIGNER'
  | 'SIGNER_CONNECTED'
  | 'CHAIN_VERIFIED'
  | 'FUNDED'
  | 'STAGE_APPROVED';

/** The complete public field set of the transport model. No secret may appear. */
export const TRANSPORT_MODEL_FIELDS = [
  'signerMode',
  'connectedAddress',
  'approvedDeployerAddress',
  'connectedChainId',
  'deployerBalanceWei',
  'requiredBalanceWei',
  'stageApprovalId',
  'autoBroadcast',
] as const;

const FORBIDDEN_FIELD_PATTERN =
  /(privatekey|private_key|secret|seed|mnemonic|keystore|passphrase|signingkey)/i;

/** True when no field name in the transport/approval model looks like a secret. */
export function transportModelHasNoSecretFields(
  fields: readonly string[] = TRANSPORT_MODEL_FIELDS,
): boolean {
  return fields.every((f) => !FORBIDDEN_FIELD_PATTERN.test(f));
}

export interface TransportObservation {
  signerMode: 'EXTERNAL_WALLET' | 'ORG_SECRET_MANAGER' | 'NONE';
  /** Address reported by the connected external wallet, any casing. */
  connectedAddress: string | null;
  /** Public deployer address approved for V30.1E. */
  approvedDeployerAddress: string | null;
  connectedChainId: number | null;
  deployerBalanceWei: bigint | null;
  requiredBalanceWei: bigint | null;
  stageApproved: boolean;
  /** Must always be false: a wallet connection never auto-broadcasts. */
  autoBroadcast: boolean;
}

export interface TransportVerdict {
  state: TransportState;
  ready: boolean;
  blockers: readonly string[];
}

const lc = (v: string) => v.trim().toLowerCase();

export function evaluateTransport(obs: TransportObservation): TransportVerdict {
  const blockers: string[] = [];

  if (obs.autoBroadcast) blockers.push('auto-broadcast is not permitted for deployments');
  if (obs.signerMode === 'NONE' || !obs.connectedAddress) {
    return {
      state: 'NO_SIGNER',
      ready: false,
      blockers: [...blockers, 'no deployer signer is connected'],
    };
  }
  if (!obs.approvedDeployerAddress) {
    blockers.push('no approved public deployer address is recorded for V30.1E');
  } else if (lc(obs.connectedAddress) !== lc(obs.approvedDeployerAddress)) {
    blockers.push('connected signer differs from the approved deployer address');
  }

  const protocolRoles = Object.values(APPROVED_AUTHORITIES).map(lc);
  if (protocolRoles.includes(lc(obs.connectedAddress))) {
    blockers.push('the deployer must not be a Safe or protocol role address');
  }

  if (blockers.length) return { state: 'SIGNER_CONNECTED', ready: false, blockers };

  if (obs.connectedChainId !== BOT_MAINNET_CHAIN_ID) {
    return {
      state: 'SIGNER_CONNECTED',
      ready: false,
      blockers: [`wallet chain ${String(obs.connectedChainId)} must be ${BOT_MAINNET_CHAIN_ID}`],
    };
  }

  if (
    obs.deployerBalanceWei === null ||
    obs.requiredBalanceWei === null ||
    obs.deployerBalanceWei < obs.requiredBalanceWei
  ) {
    return {
      state: 'CHAIN_VERIFIED',
      ready: false,
      blockers: ['deployer BOT balance does not cover the approved gas envelope plus 30% buffer'],
    };
  }

  if (!obs.stageApproved) {
    return { state: 'FUNDED', ready: false, blockers: ['no stage approval is recorded'] };
  }
  return { state: 'STAGE_APPROVED', ready: true, blockers: [] };
}

/** Required native BOT for a stage: estimated gas x price + 30% buffer. */
export function requiredStageFundingWei(gasEstimate: bigint, gasPriceWei: bigint): bigint {
  const base = gasEstimate * gasPriceWei;
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

// ── Per-stage one-time approvals ────────────────────────────────────────────

export type StageApprovalStageId = DeploymentStageId | 'F_OWNERSHIP_HANDOFF' | 'G_FUNDING';

export interface StageApproval {
  stage: StageApprovalStageId;
  candidateDigest: string;
  decisionManifestHash: string;
  chainId: number;
  deployerAddress: string;
  contractId: ProductionContractId | null;
  artifactCreationSha256: string | null;
  constructorArgsHash: string | null;
  expectedEffect: string;
  status: 'ACTIVE' | 'CONSUMED' | 'CANCELLED';
  /** Binding fingerprint; recomputed on use and compared. */
  bindingHash: string;
}

export function approvalBindingHash(
  a: Omit<StageApproval, 'bindingHash' | 'status'>,
): string {
  return fnv1a64(
    [
      a.stage,
      a.candidateDigest,
      a.decisionManifestHash,
      String(a.chainId),
      lc(a.deployerAddress),
      a.contractId ?? '-',
      a.artifactCreationSha256 ?? '-',
      a.constructorArgsHash ?? '-',
      a.expectedEffect,
    ].join('|'),
  );
}

export function createStageApproval(
  input: Omit<StageApproval, 'bindingHash' | 'status'>,
): StageApproval {
  return { ...input, status: 'ACTIVE', bindingHash: approvalBindingHash(input) };
}

export interface ApprovalValidationInput {
  approval: StageApproval;
  candidateDigest: string;
  decisionManifestHash: string;
  chainId: number;
  deployerAddress: string | null;
  payload: DeploymentPayload | null;
}

export interface ApprovalValidationVerdict {
  valid: boolean;
  reasons: readonly string[];
}

export function validateStageApproval(
  input: ApprovalValidationInput,
): ApprovalValidationVerdict {
  const a = input.approval;
  const reasons: string[] = [];

  if (a.status !== 'ACTIVE') reasons.push(`approval is ${a.status}`);
  if (a.bindingHash !== approvalBindingHash(a)) reasons.push('approval binding hash mismatch');
  if (a.candidateDigest !== input.candidateDigest || a.candidateDigest !== V30_1E_CANDIDATE_DIGEST) {
    reasons.push('candidate digest changed since approval');
  }
  if (
    a.decisionManifestHash !== input.decisionManifestHash ||
    a.decisionManifestHash !== V30_1E_DECISION_MANIFEST_HASH
  ) {
    reasons.push('decision manifest hash changed since approval');
  }
  if (a.chainId !== BOT_MAINNET_CHAIN_ID || input.chainId !== BOT_MAINNET_CHAIN_ID) {
    reasons.push('approval is only valid for BOT Mainnet 677');
  }
  if (!input.deployerAddress || lc(a.deployerAddress) !== lc(input.deployerAddress)) {
    reasons.push('deployer address changed since approval');
  }
  if (a.contractId) {
    const payload = input.payload;
    if (!payload || payload.contractId !== a.contractId) {
      reasons.push('no matching frozen payload for the approved contract');
    } else {
      if (a.artifactCreationSha256 !== payload.creationSha256) {
        reasons.push('artifact bytecode changed since approval');
      }
      if (a.constructorArgsHash !== payload.constructorArgsHash) {
        reasons.push('constructor arguments changed since approval');
      }
      if (PRODUCTION_BYTECODE[a.contractId].runtimeSha256 === null) {
        reasons.push('contract has no proven runtime bytecode hash');
      }
    }
  }
  return { valid: reasons.length === 0, reasons };
}

/** Consuming an approval is one-time; a revert never re-authorizes altered calldata. */
export function consumeStageApproval(approval: StageApproval): StageApproval {
  return { ...approval, status: 'CONSUMED' };
}

/** A deployment approval never authorizes a later funding action. */
export function approvalAuthorizesFunding(approval: StageApproval): boolean {
  return approval.stage === 'G_FUNDING' && approval.status === 'ACTIVE';
}
