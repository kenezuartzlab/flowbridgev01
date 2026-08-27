/**
 * FlowBridge V30.1E — BOT Mainnet 677 deployment + verification gate.
 *
 * Pure, fail-closed evaluation of whether a single deployment stage may be
 * broadcast, and of the post-deployment invariant snapshot. This module NEVER
 * signs, NEVER broadcasts, NEVER holds secret material and NEVER mutates the
 * production registry. It only answers: "given these public, observed facts,
 * is this stage authorized, and does the resulting chain state satisfy the
 * frozen invariants?".
 *
 * Release inputs are immutable:
 *   candidate digest  fnv1a64:19671fd13a81be19
 *   decision manifest fnv1a64:9972234982dbe76f
 * If either changes, every stage is BLOCKED and the operator returns to the
 * V30.1D.4 deployment-readiness approval.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

export const V30_1E_CANDIDATE_DIGEST = 'fnv1a64:19671fd13a81be19';
export const V30_1E_DECISION_MANIFEST_HASH = 'fnv1a64:9972234982dbe76f';

/** Frozen governance authorities (approved V30.1D.4). Lowercase comparison only. */
export const APPROVED_AUTHORITIES = {
  treasurySafe: '0xefc13d1a1dc30ba2da0bb005ba5a783c6b229ea4',
  governanceSafe: '0x88a4cc1f5771523baeb83daeea07d323a3ce9507',
  operationsSafe: '0x1ce0b1df5d2055f6e92122d8cb7669609c2359ef',
  rootPublisher: '0x971e7790fe6c8f77dc666bb05d4aeda362653f94',
  activityAttester: '0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47',
} as const;

/** Frozen economic constants that a deployment may never contradict. */
export const FLOW_TOTAL_SUPPLY_FLOW = 1_000_000_000;
export const FLOW_TOKEN_DECIMALS = 18;
export const REWARDS_INITIAL_FUNDING_FLOW = 1_000_000;
export const STAKING_REWARD_INVENTORY_FLOW = 10_000_000;
export const STAKING_YEAR1_GENESIS_CAP_FLOW = 1_000_000;
export const STAKING_YEAR1_STANDARD_CAP_FLOW = 2_000_000;
export const STAKING_YEAR1_TOTAL_CAP_FLOW = 3_000_000;
export const STAKING_WEEKLY_BUDGET_FLOW = 50_000;
export const GENESIS_MAX_REWARD_DAYS = 90;
export const STAKING_PRODUCTS = ['FLEXIBLE', 'D30', 'D90', 'D180', 'D365'] as const;

/** Approved release gas envelope (planning figure, not one transaction). */
export const GAS_PLAN_UNITS = 21_500_000;
export const GAS_SAFETY_BUFFER_BPS = 3_000; // +30%

export type DeploymentStageId =
  | 'A_FLOW_TOKEN'
  | 'B_REWARDS_DISTRIBUTOR'
  | 'C_ROUTER_V4_AND_LENS'
  | 'D_ACTIVITY_REGISTRY'
  | 'E_STAKING_V2';

export const DEPLOYMENT_STAGE_ORDER: readonly DeploymentStageId[] = [
  'A_FLOW_TOKEN',
  'B_REWARDS_DISTRIBUTOR',
  'C_ROUTER_V4_AND_LENS',
  'D_ACTIVITY_REGISTRY',
  'E_STAKING_V2',
] as const;

export type StageState = 'NOT_DEPLOYED' | 'DEPLOYED_UNVERIFIED' | 'DEPLOYED_VERIFIED';

export interface SafeObservation {
  address: string;
  /** Owner set read from chain, any casing. */
  owners: readonly string[];
  threshold: number | null;
  hasCode: boolean;
}

export interface DependencyObservation {
  name: string;
  address: string;
  hasCode: boolean;
  /** sha256 of runtime bytecode observed now. */
  runtimeSha256: string | null;
  /** sha256 recorded in the frozen dependency snapshot. */
  frozenRuntimeSha256: string | null;
}

export interface StageBroadcastInput {
  stage: DeploymentStageId;
  candidateDigest: string;
  decisionManifestHash: string;
  /** Chain id reported by the configured RPC endpoint. */
  rpcChainId: number | null;
  /** Stage states already proven on chain, keyed by stage. */
  completedStages: Partial<Record<DeploymentStageId, StageState>>;
  treasurySafe: SafeObservation | null;
  governanceSafe: SafeObservation | null;
  operationsSafe: SafeObservation | null;
  dependencies: readonly DependencyObservation[];
  /** True only when a reproducible runtime bytecode reference exists for the stage artifacts. */
  artifactBuildParityProven: boolean;
  /** True only when a deployment signing credential exists server-side (never its value). */
  deploymentSecretPresent: boolean;
  /** Live gas price in wei, read from the target chain. */
  gasPriceWei: bigint | null;
  /** Deployer native BOT balance in wei. */
  deployerBalanceWei: bigint | null;
  /** Explicit per-stage human approval recorded through the Lovable/Safe flow. */
  stageApprovedByOwner: boolean;
}

export type BroadcastCheckId =
  | 'CANDIDATE_DIGEST_UNCHANGED'
  | 'DECISION_MANIFEST_UNCHANGED'
  | 'CHAIN_IS_677'
  | 'STAGE_ORDER_RESPECTED'
  | 'SAFES_MATCH_APPROVED_STATE'
  | 'DEPENDENCIES_UNCHANGED'
  | 'ARTIFACT_BUILD_PARITY_PROVEN'
  | 'DEPLOY_CREDENTIAL_PRESENT'
  | 'GAS_BUDGET_COVERED'
  | 'STAGE_APPROVED_BY_OWNER';

export interface BroadcastCheck {
  id: BroadcastCheckId;
  ok: boolean;
  detail: string;
}

export interface StageBroadcastVerdict {
  stage: DeploymentStageId;
  authorized: boolean;
  checks: readonly BroadcastCheck[];
  blockers: readonly string[];
}

const lc = (v: string) => v.trim().toLowerCase();

function safeMatches(obs: SafeObservation | null, approved: string): boolean {
  if (!obs || !obs.hasCode) return false;
  if (lc(obs.address) !== approved) return false;
  if (obs.threshold !== 2) return false;
  const owners = obs.owners.map(lc);
  return owners.length === 3 && new Set(owners).size === 3;
}

/** Required gas in wei for the whole release envelope, including the 30% buffer. */
export function requiredGasWei(gasPriceWei: bigint): bigint {
  const base = gasPriceWei * BigInt(GAS_PLAN_UNITS);
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

export function evaluateStageBroadcast(input: StageBroadcastInput): StageBroadcastVerdict {
  const checks: BroadcastCheck[] = [];
  const add = (id: BroadcastCheckId, ok: boolean, detail: string) =>
    checks.push({ id, ok, detail });

  add(
    'CANDIDATE_DIGEST_UNCHANGED',
    input.candidateDigest === V30_1E_CANDIDATE_DIGEST,
    `candidate digest ${input.candidateDigest} vs frozen ${V30_1E_CANDIDATE_DIGEST}`,
  );
  add(
    'DECISION_MANIFEST_UNCHANGED',
    input.decisionManifestHash === V30_1E_DECISION_MANIFEST_HASH,
    `manifest ${input.decisionManifestHash} vs frozen ${V30_1E_DECISION_MANIFEST_HASH}`,
  );
  add(
    'CHAIN_IS_677',
    input.rpcChainId === BOT_MAINNET_CHAIN_ID,
    `rpc chain id ${String(input.rpcChainId)} must be exactly ${BOT_MAINNET_CHAIN_ID}`,
  );

  const index = DEPLOYMENT_STAGE_ORDER.indexOf(input.stage);
  const priorMissing = DEPLOYMENT_STAGE_ORDER.slice(0, Math.max(index, 0)).filter(
    (s) => input.completedStages[s] !== 'DEPLOYED_VERIFIED',
  );
  add(
    'STAGE_ORDER_RESPECTED',
    index >= 0 && priorMissing.length === 0,
    priorMissing.length
      ? `prior stages not DEPLOYED_VERIFIED: ${priorMissing.join(', ')}`
      : 'all prior stages are DEPLOYED_VERIFIED',
  );

  const safeResults = [
    ['treasury', safeMatches(input.treasurySafe, APPROVED_AUTHORITIES.treasurySafe)],
    ['governance', safeMatches(input.governanceSafe, APPROVED_AUTHORITIES.governanceSafe)],
    ['operations', safeMatches(input.operationsSafe, APPROVED_AUTHORITIES.operationsSafe)],
  ] as const;
  const failedSafes = safeResults.filter(([, ok]) => !ok).map(([name]) => name);
  add(
    'SAFES_MATCH_APPROVED_STATE',
    failedSafes.length === 0,
    failedSafes.length
      ? `Safe authority mismatch: ${failedSafes.join(', ')}`
      : 'all three Safes present with 3 owners and threshold 2',
  );

  const badDeps = input.dependencies.filter(
    (d) =>
      !d.hasCode ||
      !d.runtimeSha256 ||
      !d.frozenRuntimeSha256 ||
      lc(d.runtimeSha256) !== lc(d.frozenRuntimeSha256),
  );
  add(
    'DEPENDENCIES_UNCHANGED',
    input.dependencies.length > 0 && badDeps.length === 0,
    badDeps.length
      ? `dependency drift or unproven hash: ${badDeps.map((d) => d.name).join(', ')}`
      : `${input.dependencies.length} frozen dependencies match on-chain bytecode`,
  );

  add(
    'ARTIFACT_BUILD_PARITY_PROVEN',
    input.artifactBuildParityProven,
    input.artifactBuildParityProven
      ? 'stage artifacts reproduce the frozen runtime bytecode'
      : 'no reproducible runtime bytecode reference for this stage artifact set',
  );
  add(
    'DEPLOY_CREDENTIAL_PRESENT',
    input.deploymentSecretPresent,
    input.deploymentSecretPresent
      ? 'deployment credential is available server-side'
      : 'no mainnet deployment credential is configured',
  );

  const gasOk =
    input.gasPriceWei !== null &&
    input.deployerBalanceWei !== null &&
    input.deployerBalanceWei >= requiredGasWei(input.gasPriceWei);
  add(
    'GAS_BUDGET_COVERED',
    gasOk,
    gasOk
      ? 'deployer balance covers the 21.5M gas plan plus 30% buffer'
      : 'live gas price or deployer balance is unknown/insufficient for the plan + 30% buffer',
  );

  add(
    'STAGE_APPROVED_BY_OWNER',
    input.stageApprovedByOwner,
    input.stageApprovedByOwner ? 'stage explicitly approved' : 'stage has no explicit approval',
  );

  const blockers = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
  return { stage: input.stage, authorized: blockers.length === 0, checks, blockers };
}

// ── Post-deployment invariant snapshot ──────────────────────────────────────

export interface InvariantSnapshotInput {
  flowTotalSupplyFlow: number | null;
  treasurySafeFlowBalance: number | null;
  rewardsDistributorFlowBalance: number | null;
  rewardsTotalReserved: number | null;
  rewardsTokenAddress: string | null;
  flowTokenAddress: string | null;
  stakingTreasuryFlowBalance: number | null;
  stakingPrincipalLiabilities: number | null;
  stakingPositions: number | null;
  rewardEpochs: number | null;
  routerBridgeProxyEnabled: boolean | null;
  bridgeAdapterMainnetEnabled: boolean | null;
  activityRegistryRecords: number | null;
  activityAdmin: string | null;
  activityAttester: string | null;
  routerOwner: string | null;
  routerFeeTreasury: string | null;
  stakingProducts: readonly string[];
  stakingYear1GenesisCapFlow: number | null;
  stakingYear1StandardCapFlow: number | null;
  stakingYear1TotalCapFlow: number | null;
  stakingWeeklyBudgetFlow: number | null;
  genesisMaxRewardDays: number | null;
  oracleState: 'PENDING_POOL' | 'VERIFIED' | null;
  dynamicBonusActive: boolean | null;
  unexpectedAllowances: number | null;
}

export interface InvariantResult {
  id: string;
  ok: boolean;
  detail: string;
}

export interface InvariantSnapshotVerdict {
  ok: boolean;
  results: readonly InvariantResult[];
  violations: readonly string[];
}

export function evaluateInvariantSnapshot(
  input: InvariantSnapshotInput,
): InvariantSnapshotVerdict {
  const results: InvariantResult[] = [];
  const add = (id: string, ok: boolean, detail: string) => results.push({ id, ok, detail });
  const eqAddr = (a: string | null, b: string | null) =>
    !!a && !!b && lc(a) === lc(b);

  add(
    'FLOW_SUPPLY_EXACT_1B',
    input.flowTotalSupplyFlow === FLOW_TOTAL_SUPPLY_FLOW,
    `total supply ${String(input.flowTotalSupplyFlow)} must equal ${FLOW_TOTAL_SUPPLY_FLOW}`,
  );
  add(
    'GENESIS_MINT_TO_TREASURY',
    input.treasurySafeFlowBalance === FLOW_TOTAL_SUPPLY_FLOW,
    'Treasury Safe must hold the entire genesis mint before any funding',
  );
  add(
    'REWARDS_BALANCE_ZERO',
    input.rewardsDistributorFlowBalance === 0,
    'rewards distributor balance must be 0 until the funding checkpoint',
  );
  add('REWARDS_RESERVED_ZERO', input.rewardsTotalReserved === 0, 'totalReserved must be 0');
  add(
    'REWARDS_TOKEN_BINDING',
    eqAddr(input.rewardsTokenAddress, input.flowTokenAddress),
    'rewardToken must equal the deployed FLOW token',
  );
  add(
    'STAKING_TREASURY_BALANCE_ZERO',
    input.stakingTreasuryFlowBalance === 0,
    'staking reward treasury must be unfunded at deployment',
  );
  add(
    'STAKING_LIABILITIES_ZERO',
    input.stakingPrincipalLiabilities === 0 && input.stakingPositions === 0,
    'no principal liabilities and no staking positions may exist',
  );
  add('NO_REWARD_EPOCHS', input.rewardEpochs === 0, 'no reward epoch or claim may exist');
  add(
    'ROUTER_BRIDGE_PROXY_OFF',
    input.routerBridgeProxyEnabled === false,
    'Router bridge proxy execution must be OFF',
  );
  add(
    'BRIDGE_ADAPTER_INACTIVE',
    input.bridgeAdapterMainnetEnabled === false,
    'BridgeAdapter mainnet execution must remain disabled',
  );
  add(
    'ACTIVITY_REGISTRY_EMPTY',
    input.activityRegistryRecords === 0,
    'Activity Registry must contain no fabricated production activity',
  );
  add(
    'ACTIVITY_ADMIN_NOT_ATTESTER',
    !!input.activityAdmin &&
      !!input.activityAttester &&
      lc(input.activityAdmin) !== lc(input.activityAttester) &&
      lc(input.activityAttester) === APPROVED_AUTHORITIES.activityAttester,
    'attester must be the approved Activity Attester and must differ from admin',
  );
  add(
    'ROUTER_OWNER_IS_GOVERNANCE',
    !!input.routerOwner && lc(input.routerOwner) === APPROVED_AUTHORITIES.governanceSafe,
    'Router owner must resolve to the approved Governance Safe',
  );
  add(
    'ROUTER_FEE_TREASURY_IS_TREASURY',
    !!input.routerFeeTreasury &&
      lc(input.routerFeeTreasury) === APPROVED_AUTHORITIES.treasurySafe,
    'Router fee treasury must resolve to the approved Treasury Safe',
  );
  const products = input.stakingProducts.map((p) => p.toUpperCase());
  add(
    'STAKING_FIVE_PRODUCTS',
    STAKING_PRODUCTS.every((p) => products.includes(p)) &&
      products.length === STAKING_PRODUCTS.length,
    `controller must expose exactly ${STAKING_PRODUCTS.join(', ')}`,
  );
  add(
    'STAKING_YEAR1_CAPS',
    input.stakingYear1GenesisCapFlow === STAKING_YEAR1_GENESIS_CAP_FLOW &&
      input.stakingYear1StandardCapFlow === STAKING_YEAR1_STANDARD_CAP_FLOW &&
      input.stakingYear1TotalCapFlow === STAKING_YEAR1_TOTAL_CAP_FLOW,
    'Year-1 caps must be 1M genesis / 2M standard / 3M total',
  );
  add(
    'STAKING_WEEKLY_CAP',
    input.stakingWeeklyBudgetFlow === STAKING_WEEKLY_BUDGET_FLOW,
    'weekly reward budget must be 50,000 FLOW',
  );
  add(
    'GENESIS_REWARD_DAYS',
    input.genesisMaxRewardDays === GENESIS_MAX_REWARD_DAYS,
    'Genesis reward window must be at most 90 reward-days',
  );
  add(
    'DYNAMIC_BONUS_INACTIVE_WHILE_PENDING_POOL',
    input.oracleState !== 'PENDING_POOL' || input.dynamicBonusActive === false,
    'oracle-dependent bonus must stay unavailable while oracle state is PENDING_POOL',
  );
  add(
    'NO_UNEXPECTED_ALLOWANCES',
    input.unexpectedAllowances === 0,
    'no unexpected approvals/allowances may exist on treasury/reward contracts',
  );

  const violations = results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`);
  return { ok: violations.length === 0, results, violations };
}

// ── Funding checkpoints (explicitly separate from deployment) ───────────────

export type FundingCheckpointId = 'REWARDS_FUNDING' | 'STAKING_FUNDING';

export interface FundingCheckpointInput {
  checkpoint: FundingCheckpointId;
  /** Every required contract of the checkpoint is DEPLOYED_VERIFIED. */
  contractsDeployedVerified: boolean;
  /** Governance/role handoff proven on chain. */
  governanceHandoffProven: boolean;
  /** Funding transaction origin. Must be the approved Treasury Safe. */
  fundingSource: string | null;
  amountFlow: number | null;
  invariantSnapshotOk: boolean;
  ownerApproved: boolean;
}

export interface FundingCheckpointVerdict {
  checkpoint: FundingCheckpointId;
  authorized: boolean;
  blockers: readonly string[];
}

export function evaluateFundingCheckpoint(
  input: FundingCheckpointInput,
): FundingCheckpointVerdict {
  const blockers: string[] = [];
  const expected =
    input.checkpoint === 'REWARDS_FUNDING'
      ? REWARDS_INITIAL_FUNDING_FLOW
      : STAKING_REWARD_INVENTORY_FLOW;

  if (!input.contractsDeployedVerified) blockers.push('required contracts are not DEPLOYED_VERIFIED');
  if (!input.governanceHandoffProven) blockers.push('governance/role handoff is not proven');
  if (!input.invariantSnapshotOk) blockers.push('post-deployment invariant snapshot does not pass');
  if (!input.ownerApproved) blockers.push('funding transaction is not explicitly approved');
  if (!input.fundingSource || lc(input.fundingSource) !== APPROVED_AUTHORITIES.treasurySafe) {
    blockers.push('funding must originate from the approved Treasury Safe');
  }
  if (input.amountFlow !== expected) {
    blockers.push(`amount must equal the approved ${expected.toLocaleString('en-US')} FLOW plan`);
  }
  return { checkpoint: input.checkpoint, authorized: blockers.length === 0, blockers };
}

export type DeploymentVerdict =
  | 'FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION PASS'
  | 'FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION BLOCKED';

export function deploymentGateVerdict(args: {
  stages: readonly { stage: DeploymentStageId; state: StageState }[];
  invariants: InvariantSnapshotVerdict | null;
  governanceHandoffProven: boolean;
  explorerVerifiedForAllStages: boolean;
}): DeploymentVerdict {
  const allVerified =
    DEPLOYMENT_STAGE_ORDER.every((id) =>
      args.stages.some((s) => s.stage === id && s.state === 'DEPLOYED_VERIFIED'),
    ) && args.stages.length > 0;
  const ok =
    allVerified &&
    args.explorerVerifiedForAllStages &&
    args.governanceHandoffProven &&
    !!args.invariants?.ok;
  return ok
    ? 'FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION PASS'
    : 'FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION BLOCKED';
}
