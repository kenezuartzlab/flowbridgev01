/**
 * FlowBridge V30.1E.1 — DRY_RUN deployment state machine.
 *
 * Simulates the staged deployment lifecycle using the frozen artifacts and
 * deterministic payloads. DRY_RUN mode structurally forbids any write call:
 * `eth_sendRawTransaction`, `wallet_sendTransaction` and Safe execution are not
 * reachable from this module. Funding states and feature states are tracked
 * separately from deployment states and never advance each other.
 */
import { DEPLOYMENT_STAGE_ORDER, type DeploymentStageId } from './mainnetDeploymentGate';
import { payloadsForStage } from './deploymentPayloads';
import type { DeploymentPayload } from './deploymentPayloads';
import { PRODUCTION_BYTECODE, type ProductionContractId } from './productionBytecode';

export type ContractLifecycleState =
  | 'NOT_DEPLOYED'
  | 'BROADCASTED'
  | 'RECEIPT_CONFIRMED'
  | 'BYTECODE_MATCHED'
  | 'SOURCE_VERIFIED'
  | 'DEPLOYED_VERIFIED';

export type FundingState = 'UNFUNDED' | 'FUNDING_APPROVED' | 'FUNDED_READY';

export const READ_ONLY_RPC_METHODS = [
  'eth_chainId',
  'eth_blockNumber',
  'eth_getCode',
  'eth_gasPrice',
  'eth_estimateGas',
  'eth_call',
  'eth_getBalance',
] as const;

const WRITE_METHODS = ['eth_sendRawTransaction', 'wallet_sendTransaction', 'safe_execTransaction'];

export function isDryRunSafeMethod(method: string): boolean {
  return !WRITE_METHODS.includes(method);
}

export interface StageSimulationObservation {
  receiptStatus: 'SUCCESS' | 'REVERTED' | 'MISSING';
  observedRuntimeSha256: string | null;
  explorerSourceVerified: boolean;
  rolesMatchApproved: boolean;
  safeStateUnchanged: boolean;
}

export interface ContractSimulationResult {
  contractId: ProductionContractId;
  state: ContractLifecycleState;
  stopped: boolean;
  reason: string | null;
  gasEstimate: number;
}

/** Per-stage gas estimates (units) derived from creation bytecode size + init cost. */
export function estimateStageGas(payload: DeploymentPayload): number {
  const entry = PRODUCTION_BYTECODE[payload.contractId];
  // 21k base + 200/byte code deposit + 16/byte calldata + init overhead.
  return 21_000 + entry.runtimeBytes * 200 + entry.creationBytes * 16 + 120_000;
}

/** Advance one contract through the lifecycle; every failure stops progression. */
export function simulateContract(
  payload: DeploymentPayload,
  obs: StageSimulationObservation,
): ContractSimulationResult {
  const expectedRuntime = PRODUCTION_BYTECODE[payload.contractId].runtimeSha256;
  const gasEstimate = estimateStageGas(payload);
  const stop = (state: ContractLifecycleState, reason: string): ContractSimulationResult => ({
    contractId: payload.contractId,
    state,
    stopped: true,
    reason,
    gasEstimate,
  });

  if (!expectedRuntime) return stop('NOT_DEPLOYED', 'no proven runtime bytecode hash');
  if (!obs.safeStateUnchanged) return stop('NOT_DEPLOYED', 'Safe state changed since approval');
  if (obs.receiptStatus === 'MISSING') return stop('BROADCASTED', 'no receipt observed');
  if (obs.receiptStatus === 'REVERTED') return stop('BROADCASTED', 'deployment receipt reverted');
  if (obs.observedRuntimeSha256 === null) {
    return stop('RECEIPT_CONFIRMED', 'deployed runtime bytecode could not be read');
  }
  if (obs.observedRuntimeSha256.toLowerCase() !== expectedRuntime.toLowerCase()) {
    return stop('RECEIPT_CONFIRMED', 'deployed runtime bytecode hash does not match the frozen build');
  }
  if (!obs.explorerSourceVerified) {
    return stop('BYTECODE_MATCHED', 'public explorer source verification is not published');
  }
  if (!obs.rolesMatchApproved) {
    return stop('SOURCE_VERIFIED', 'on-chain roles do not match the approved authorities');
  }
  return {
    contractId: payload.contractId,
    state: 'DEPLOYED_VERIFIED',
    stopped: false,
    reason: null,
    gasEstimate,
  };
}

export interface DryRunInput {
  /** Observations keyed by contract; missing entries simulate the happy path. */
  observations?: Partial<Record<ProductionContractId, StageSimulationObservation>>;
  fundingState?: FundingState;
  /** Feature activation is separate and can never be advanced by deployment. */
  featureState?: 'PENDING_POOL' | 'ACTIVE';
}

export interface DryRunStageResult {
  stage: DeploymentStageId;
  contracts: readonly ContractSimulationResult[];
  gasEstimate: number;
  complete: boolean;
}

export interface DryRunResult {
  mode: 'DRY_RUN';
  broadcasts: 0;
  stages: readonly DryRunStageResult[];
  totalGasEstimate: number;
  allStagesVerified: boolean;
  fundingState: FundingState;
  featureState: 'PENDING_POOL' | 'ACTIVE';
  stoppedAt: DeploymentStageId | null;
}

const HAPPY: StageSimulationObservation = {
  receiptStatus: 'SUCCESS',
  observedRuntimeSha256: null,
  explorerSourceVerified: true,
  rolesMatchApproved: true,
  safeStateUnchanged: true,
};

export function runDeploymentDryRun(input: DryRunInput = {}): DryRunResult {
  const stages: DryRunStageResult[] = [];
  let stoppedAt: DeploymentStageId | null = null;

  for (const stage of DEPLOYMENT_STAGE_ORDER) {
    const contracts = payloadsForStage(stage).map((payload) => {
      const provided = input.observations?.[payload.contractId];
      const obs: StageSimulationObservation =
        provided ??
        ({
          ...HAPPY,
          observedRuntimeSha256: PRODUCTION_BYTECODE[payload.contractId].runtimeSha256,
        } as StageSimulationObservation);
      return simulateContract(payload, obs);
    });
    const complete = contracts.length > 0 && contracts.every((c) => c.state === 'DEPLOYED_VERIFIED');
    if (!complete && stoppedAt === null) stoppedAt = stage;
    stages.push({
      stage,
      contracts,
      gasEstimate: contracts.reduce((sum, c) => sum + c.gasEstimate, 0),
      complete,
    });
    if (!complete) break;
  }

  return {
    mode: 'DRY_RUN',
    broadcasts: 0,
    stages,
    totalGasEstimate: stages.reduce((sum, s) => sum + s.gasEstimate, 0),
    allStagesVerified: stages.length === DEPLOYMENT_STAGE_ORDER.length && stages.every((s) => s.complete),
    fundingState: input.fundingState ?? 'UNFUNDED',
    featureState: input.featureState ?? 'PENDING_POOL',
    stoppedAt,
  };
}

/** Rewards/staking funding stays unavailable until deployed AND source verified. */
export function fundingAvailable(args: {
  contractStates: readonly ContractLifecycleState[];
  ownerApproved: boolean;
}): boolean {
  return (
    args.contractStates.length > 0 &&
    args.contractStates.every((s) => s === 'DEPLOYED_VERIFIED') &&
    args.ownerApproved
  );
}

// ── Explorer verification package ───────────────────────────────────────────

export interface VerificationPackage {
  contractId: ProductionContractId;
  explorer: 'scan.botchain.ai';
  sourcePath: string;
  compilerVersion: string;
  optimizerEnabled: true;
  optimizerRuns: number;
  viaIR: boolean;
  evmVersion: string;
  constructorArgsHash: string;
  /** Standard-JSON fallback if the explorer API is unavailable. */
  fallback: 'STANDARD_JSON_MANUAL_PUBLICATION';
  command: string;
}

export function verificationPackages(): readonly VerificationPackage[] {
  return DEPLOYMENT_STAGE_ORDER.flatMap((stage) => payloadsForStage(stage)).map((payload) => {
    const entry = PRODUCTION_BYTECODE[payload.contractId];
    return {
      contractId: payload.contractId,
      explorer: 'scan.botchain.ai' as const,
      sourcePath: entry.source,
      compilerVersion: entry.compiler.version,
      optimizerEnabled: true as const,
      optimizerRuns: entry.compiler.optimizerRuns,
      viaIR: entry.compiler.viaIR,
      evmVersion: entry.compiler.evmVersion,
      constructorArgsHash: payload.constructorArgsHash,
      fallback: 'STANDARD_JSON_MANUAL_PUBLICATION' as const,
      command: `hardhat verify --network botMainnet677 <address> <constructor-args>  # ${entry.compiler.version}, runs ${entry.compiler.optimizerRuns}, viaIR ${entry.compiler.viaIR}, ${entry.compiler.evmVersion}`,
    };
  });
}
