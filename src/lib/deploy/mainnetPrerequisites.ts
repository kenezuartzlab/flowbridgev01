/**
 * FlowBridge V30.1D — mainnet economic + governance prerequisite closure.
 *
 * Pure, descriptive and fail-closed. This module freezes the SHAPE of every
 * external input required before the first BOT Mainnet 677 deployment and
 * evaluates whether each input is actually approved. It never deploys, signs,
 * broadcasts, funds, invents an address, or reads a secret: callers pass public
 * facts only.
 *
 * Nothing here authorises a broadcast. A PASS only means every prerequisite is
 * frozen and preflighted.
 */
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  UNVERIFIED_LEGACY_BOT_IDENTIFIER,
  classifyNetworkIdentifier,
} from '@/lib/network/canonicalNetworks';
import { CONTRACT_INVENTORY, testnetAddressSet, registryRecord } from './contractInventory';
import { STAKING_V2_CONSTANTS, STAKING_V2_PRODUCTS } from '@/lib/staking/stakingV2Matrix';

export type PrerequisiteStatus = 'VERIFIED' | 'NEEDS_APPROVAL' | 'BLOCKED';

export interface PrerequisiteResult {
  id: string;
  section: string;
  status: PrerequisiteStatus;
  detail: string;
  /** Mandatory prerequisites gate READY_FOR_DEPLOYMENT for their contracts. */
  mandatory: boolean;
  /** Contract ids that cannot become READY_FOR_DEPLOYMENT while unresolved. */
  gates: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Input shape                                                                */
/* -------------------------------------------------------------------------- */

export interface GovernanceRoleAssignment {
  system: string;
  role: string;
  /** Public address only. null = unassigned. */
  address: string | null;
  /** True when the address is a reviewed multisig/timelock, not a dev wallet. */
  reviewedMultisig: boolean;
  /** Human owner/team accountable for the role. */
  responsibleOwner: string | null;
  /** Timelock minimum delay in seconds, or null when not applicable/unknown. */
  timelockDelaySeconds: number | null;
}

export interface TokenFreezeInput {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupplyFlow: number | null;
  treasuryRecipient: string | null;
  treasuryIsReviewedMultisig: boolean;
  allocationPlanRef: string | null;
}

export interface OracleInput {
  /** Mechanism description, e.g. "BDEX FLOW/USDT 7-day TWAP". */
  mechanism: string | null;
  feedAddress: string | null;
  chainId: number | null;
  /** Proven on-chain bytecode at the feed address on BOT Mainnet 677. */
  bytecodeVerified: boolean;
  observationWindowSeconds: number | null;
  updateCadenceSeconds: number | null;
  minLiquidityUsd: number | null;
  maxFreshnessSeconds: number | null;
  maxDeviationBps: number | null;
  /** Fail-closed behaviour proven for unavailable/stale/thin/deviant states. */
  failClosedProven: boolean;
}

export interface RewardsFundingInput {
  initialFundingFlow: number | null;
  approvedTreasuryAllocationFlow: number | null;
  enabledCampaignBudgetsFlow: number | null;
  rootDelaySeconds: number | null;
  replenishmentPolicyRef: string | null;
}

export interface StakingFundingInput {
  launchFundingFlow: number | null;
  genesisFundingFlow: number | null;
  standardFundingFlow: number | null;
  maxFlowPerEpoch: number | null;
  /** Product keys enabled at launch (subset of the canonical five). */
  enabledProductKeys: readonly string[];
}

export interface DependencyInput {
  id: string;
  label: string;
  address: string | null;
  url: string | null;
  chainId: number | null;
  bytecodeVerified: boolean;
}

export interface MainnetPrerequisiteInputs {
  token: TokenFreezeInput;
  governance: readonly GovernanceRoleAssignment[];
  rewards: RewardsFundingInput;
  staking: StakingFundingInput;
  oracle: OracleInput;
  dependencies: readonly DependencyInput[];
  /** Gas budget signed off for the whole sequence, wei. */
  approvedGasBudgetWei: bigint | null;
  /** Direct official BOT Bridge gateway verification performed for 677. */
  directBridgeGatewayVerified: boolean;
}

/** Canonical role matrix that MUST be frozen (V30.1D §4). */
export const REQUIRED_GOVERNANCE_ROLES: readonly { system: string; role: string; gates: readonly string[] }[] = [
  { system: 'Router V4', role: 'owner', gates: ['FlowBridgeRouterV4'] },
  { system: 'Router V4', role: 'pauser', gates: ['FlowBridgeRouterV4'] },
  { system: 'Router V4', role: 'registryAdmin', gates: ['FlowBridgeRouterV4'] },
  { system: 'Router V4', role: 'feeTreasury', gates: ['FlowBridgeRouterV4'] },
  { system: 'Rewards', role: 'admin', gates: ['FlowRewardsMerkleDistributor'] },
  { system: 'Rewards', role: 'campaignManager', gates: ['FlowRewardsMerkleDistributor'] },
  { system: 'Rewards', role: 'rootPublisher', gates: ['FlowRewardsMerkleDistributor'] },
  { system: 'Rewards', role: 'pauser', gates: ['FlowRewardsMerkleDistributor'] },
  { system: 'Activity Registry', role: 'admin', gates: ['FlowBridgeActivityRegistry'] },
  { system: 'Activity Registry', role: 'attester', gates: ['FlowBridgeActivityRegistry'] },
  { system: 'Activity Registry', role: 'pauser', gates: ['FlowBridgeActivityRegistry'] },
  { system: 'Staking', role: 'vaultAdmin', gates: ['FlowStakingVaultV2'] },
  { system: 'Staking', role: 'controllerGovernor', gates: ['FlowStakingController'] },
  { system: 'Staking', role: 'controllerPublisher', gates: ['FlowStakingController'] },
  { system: 'Staking', role: 'treasuryAdmin', gates: ['FlowStakingRewardTreasury'] },
  { system: 'Staking', role: 'recoveryRecipient', gates: ['FlowStakingRewardTreasury'] },
  { system: 'Staking', role: 'pauser', gates: ['FlowStakingVaultV2'] },
  { system: 'FLOW treasury', role: 'tokenRecipient', gates: ['FlowToken'] },
] as const;

/** Dependencies that must be independently verified for 677 (V30.1D §9). */
export const REQUIRED_DEPENDENCY_IDS = [
  'botMainnetRpc',
  'botMainnetExplorer',
  'bdexSwapRouter',
  'wrappedNative',
  'directBridgeGateway',
] as const;

/**
 * Current reality: nothing is approved. This is the honest production baseline
 * used by the operator dashboard until an owner-signed freeze is recorded.
 */
export const UNAPPROVED_PREREQUISITE_INPUTS: MainnetPrerequisiteInputs = {
  token: {
    name: null,
    symbol: null,
    decimals: 18,
    totalSupplyFlow: null,
    treasuryRecipient: null,
    treasuryIsReviewedMultisig: false,
    allocationPlanRef: null,
  },
  governance: [],
  rewards: {
    initialFundingFlow: null,
    approvedTreasuryAllocationFlow: null,
    enabledCampaignBudgetsFlow: null,
    rootDelaySeconds: null,
    replenishmentPolicyRef: null,
  },
  staking: {
    launchFundingFlow: null,
    genesisFundingFlow: null,
    standardFundingFlow: null,
    maxFlowPerEpoch: null,
    enabledProductKeys: [],
  },
  oracle: {
    mechanism: null,
    feedAddress: null,
    chainId: null,
    bytecodeVerified: false,
    observationWindowSeconds: null,
    updateCadenceSeconds: null,
    minLiquidityUsd: null,
    maxFreshnessSeconds: null,
    maxDeviationBps: null,
    failClosedProven: false,
  },
  dependencies: [],
  approvedGasBudgetWei: null,
  directBridgeGatewayVerified: false,
};

const lower = (v: string | null | undefined) => (v ?? '').toLowerCase().trim();
const isAddress = (v: string | null | undefined) => /^0x[0-9a-f]{40}$/.test(lower(v));

function contaminated(value: string | null): boolean {
  const set = testnetAddressSet();
  return isAddress(value) && set.has(lower(value));
}

function legacyIdentifier(value: number | null | undefined): boolean {
  return classifyNetworkIdentifier(value) === 'UNVERIFIED_LEGACY';
}

/* -------------------------------------------------------------------------- */
/* Section evaluators                                                         */
/* -------------------------------------------------------------------------- */

export function evaluateTokenFreeze(token: TokenFreezeInput): PrerequisiteResult[] {
  const gates = ['FlowToken'];
  const section = 'FLOW token freeze';
  const out: PrerequisiteResult[] = [];
  const push = (id: string, ok: boolean, detail: string, blocked = false) =>
    out.push({
      id,
      section,
      status: ok ? 'VERIFIED' : blocked ? 'BLOCKED' : 'NEEDS_APPROVAL',
      detail,
      mandatory: true,
      gates,
    });

  push('TOKEN_IDENTITY_FROZEN', Boolean(token.name && token.symbol), 'name + symbol must match the reviewed canonical source');
  push('TOKEN_DECIMALS_18', token.decimals === 18, 'decimals must be 18');
  push(
    'TOKEN_SUPPLY_FROZEN',
    typeof token.totalSupplyFlow === 'number' && token.totalSupplyFlow > 0,
    'fixed genesis supply must be approved; no post-deploy mint authority exists',
  );
  push(
    'TOKEN_TREASURY_APPROVED',
    isAddress(token.treasuryRecipient) &&
      token.treasuryIsReviewedMultisig &&
      !contaminated(token.treasuryRecipient),
    contaminated(token.treasuryRecipient)
      ? 'treasury recipient reuses a BOT Testnet address — blocked'
      : 'treasury recipient must be a reviewed production multisig/treasury, never a developer wallet',
    contaminated(token.treasuryRecipient),
  );
  push(
    'TOKEN_ALLOCATION_PLAN',
    Boolean(token.allocationPlanRef),
    'treasury-controlled FLOW allocation plan must be documented before deployment',
  );
  return out;
}

export function evaluateGovernanceMatrix(
  assignments: readonly GovernanceRoleAssignment[],
): PrerequisiteResult[] {
  const section = 'Governance assignments';
  const find = (system: string, role: string) =>
    assignments.find((a) => a.system === system && a.role === role) ?? null;

  const out: PrerequisiteResult[] = REQUIRED_GOVERNANCE_ROLES.map((req) => {
    const a = find(req.system, req.role);
    const bad = a !== null && contaminated(a.address);
    const ok =
      a !== null &&
      isAddress(a.address) &&
      a.reviewedMultisig &&
      Boolean(a.responsibleOwner) &&
      !bad;
    return {
      id: `ROLE_${req.system.replace(/\s+/g, '_').toUpperCase()}_${req.role.toUpperCase()}`,
      section,
      status: (ok ? 'VERIFIED' : bad ? 'BLOCKED' : 'NEEDS_APPROVAL') as PrerequisiteStatus,
      detail: bad
        ? 'assignment reuses a BOT Testnet address — blocked'
        : a === null
          ? `${req.system} ${req.role} is unassigned`
          : 'must be a reviewed multisig/timelock with a named responsible owner',
      mandatory: true,
      gates: req.gates,
    };
  });

  // Activity Registry separation of duties: admin != attester.
  const admin = find('Activity Registry', 'admin');
  const attester = find('Activity Registry', 'attester');
  const separated =
    isAddress(admin?.address ?? null) &&
    isAddress(attester?.address ?? null) &&
    lower(admin?.address) !== lower(attester?.address);
  out.push({
    id: 'REGISTRY_ADMIN_NOT_ATTESTER',
    section,
    status: separated ? 'VERIFIED' : 'BLOCKED',
    detail: separated
      ? 'admin and attester are distinct addresses'
      : 'Activity Registry admin must not equal attester',
    mandatory: true,
    gates: ['FlowBridgeActivityRegistry'],
  });

  const delays = assignments.filter((a) => a.timelockDelaySeconds !== null);
  out.push({
    id: 'TIMELOCK_DELAY_DOCUMENTED',
    section,
    status: delays.length > 0 && delays.every((d) => (d.timelockDelaySeconds ?? 0) > 0) ? 'VERIFIED' : 'NEEDS_APPROVAL',
    detail: 'timelock minimum delay and emergency exemptions must be documented',
    mandatory: true,
    gates: ['FlowBridgeRouterV4', 'FlowStakingController'],
  });

  return out;
}

export function evaluateRewardsFunding(rewards: RewardsFundingInput): PrerequisiteResult[] {
  const section = 'Rewards funding + campaign budgets';
  const gates = ['FlowRewardsMerkleDistributor'];
  const out: PrerequisiteResult[] = [];
  const funding = rewards.initialFundingFlow;
  const allocation = rewards.approvedTreasuryAllocationFlow;
  const budgets = rewards.enabledCampaignBudgetsFlow;

  out.push({
    id: 'REWARDS_LAUNCH_FUNDING_FROZEN',
    section,
    status: typeof funding === 'number' && funding >= 0 && typeof allocation === 'number' && funding <= allocation
      ? 'VERIFIED'
      : typeof funding === 'number' && typeof allocation === 'number'
        ? 'BLOCKED'
        : 'NEEDS_APPROVAL',
    detail: 'initial distributor funding must be approved and within the treasury allocation',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'REWARDS_BUDGET_WITHIN_FUNDING',
    section,
    status:
      typeof budgets === 'number' && typeof funding === 'number'
        ? budgets <= funding
          ? 'VERIFIED'
          : 'BLOCKED'
        : 'NEEDS_APPROVAL',
    detail: 'enabled campaign budgets must never exceed pre-funded on-chain inventory',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'REWARDS_ROOT_DELAY_FROZEN',
    section,
    status: typeof rewards.rootDelaySeconds === 'number' && rewards.rootDelaySeconds > 0 ? 'VERIFIED' : 'NEEDS_APPROVAL',
    detail: 'root-publisher delay and operating process must be frozen',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'REWARDS_REPLENISHMENT_POLICY',
    section,
    status: rewards.replenishmentPolicyRef ? 'VERIFIED' : 'NEEDS_APPROVAL',
    detail: 'replenishment and bounded free-balance recovery policy must be documented',
    mandatory: true,
    gates,
  });
  return out;
}

export function evaluateStakingFunding(staking: StakingFundingInput): PrerequisiteResult[] {
  const section = 'Staking Year-1 funding';
  const gates = ['FlowStakingRewardTreasury', 'FlowStakingController', 'FlowStakingVaultV2'];
  const out: PrerequisiteResult[] = [];
  const { GENESIS_YEAR1_CAP_FLOW, STANDARD_YEAR1_CAP_FLOW, TOTAL_YEAR1_CAP_FLOW } = STAKING_V2_CONSTANTS;
  const total = staking.launchFundingFlow;
  const genesis = staking.genesisFundingFlow;
  const standard = staking.standardFundingFlow;

  const numbersPresent =
    typeof total === 'number' && typeof genesis === 'number' && typeof standard === 'number';
  const withinCaps =
    numbersPresent &&
    genesis <= GENESIS_YEAR1_CAP_FLOW &&
    standard <= STANDARD_YEAR1_CAP_FLOW &&
    total <= TOTAL_YEAR1_CAP_FLOW &&
    genesis + standard <= total;

  out.push({
    id: 'STAKING_LAUNCH_FUNDING_FROZEN',
    section,
    status: !numbersPresent ? 'NEEDS_APPROVAL' : withinCaps ? 'VERIFIED' : 'BLOCKED',
    detail: `launch funding must be frozen and within Year-1 ceilings (genesis <= ${GENESIS_YEAR1_CAP_FLOW}, standard <= ${STANDARD_YEAR1_CAP_FLOW}, total <= ${TOTAL_YEAR1_CAP_FLOW} FLOW)`,
    mandatory: true,
    gates,
  });
  out.push({
    id: 'STAKING_MAX_FLOW_PER_EPOCH_FROZEN',
    section,
    status:
      typeof staking.maxFlowPerEpoch === 'number' && staking.maxFlowPerEpoch > 0
        ? typeof total === 'number' && staking.maxFlowPerEpoch <= total
          ? 'VERIFIED'
          : 'BLOCKED'
        : 'NEEDS_APPROVAL',
    detail: 'initial maxFlowPerEpoch must be approved and never exceed funded inventory',
    mandatory: true,
    gates: ['FlowStakingController'],
  });

  const known = new Set(STAKING_V2_PRODUCTS.map((p) => p.key));
  const unknown = staking.enabledProductKeys.filter((k) => !known.has(k as never));
  out.push({
    id: 'STAKING_ENABLED_PRODUCTS_FROZEN',
    section,
    status:
      staking.enabledProductKeys.length === 0
        ? 'NEEDS_APPROVAL'
        : unknown.length > 0
          ? 'BLOCKED'
          : 'VERIFIED',
    detail: unknown.length
      ? `unknown product keys: ${unknown.join(', ')}`
      : 'launch product set must be explicitly approved; UI follows controller availability',
    mandatory: true,
    gates: ['FlowStakingController'],
  });

  // A product may only be offered when funded reserve capacity supports it.
  const capacityOk =
    typeof genesis === 'number' &&
    typeof standard === 'number' &&
    staking.enabledProductKeys.length > 0 &&
    genesis > 0 &&
    standard > 0;
  out.push({
    id: 'STAKING_PRODUCT_CAPACITY_BACKED',
    section,
    status: capacityOk ? 'VERIFIED' : staking.enabledProductKeys.length > 0 ? 'BLOCKED' : 'NEEDS_APPROVAL',
    detail: 'no product may be enabled without funded genesis + floor reserve capacity',
    mandatory: true,
    gates,
  });
  return out;
}

export function evaluateOracleGate(oracle: OracleInput): PrerequisiteResult[] {
  const section = 'FLOW/USD oracle production gate';
  const gates = ['FlowStakingController'];
  const out: PrerequisiteResult[] = [];
  const identified = Boolean(oracle.mechanism) && isAddress(oracle.feedAddress);
  const chainOk = oracle.chainId === BOT_MAINNET_CHAIN_ID && !legacyIdentifier(oracle.chainId);

  out.push({
    id: 'ORACLE_SOURCE_IDENTIFIED',
    section,
    status: identified ? 'VERIFIED' : 'BLOCKED',
    detail: 'a concrete production FLOW/USD reference mechanism + feed address is required',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'ORACLE_LIVE_ON_677',
    section,
    status: identified && chainOk && oracle.bytecodeVerified ? 'VERIFIED' : 'BLOCKED',
    detail: 'feed must exist with verified bytecode on BOT Mainnet 677',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'ORACLE_WINDOW_APPROVED',
    section,
    status:
      (oracle.observationWindowSeconds ?? 0) >= 7 * 86_400 && (oracle.updateCadenceSeconds ?? 0) > 0
        ? 'VERIFIED'
        : 'BLOCKED',
    detail: '7-day (or approved robust) averaging/TWAP window and update cadence must be provable',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'ORACLE_THRESHOLDS_SET',
    section,
    status:
      (oracle.maxFreshnessSeconds ?? 0) > 0 &&
      (oracle.minLiquidityUsd ?? 0) > 0 &&
      (oracle.maxDeviationBps ?? 0) > 0
        ? 'VERIFIED'
        : 'BLOCKED',
    detail: 'explicit freshness, minimum-liquidity and maximum-deviation thresholds are required',
    mandatory: true,
    gates,
  });
  out.push({
    id: 'ORACLE_FAILS_CLOSED',
    section,
    status: oracle.failClosedProven ? 'VERIFIED' : 'BLOCKED',
    detail:
      'unavailable / stale / low-liquidity / excessive-deviation states must fail closed; manual, browser or AI-generated prices are forbidden',
    mandatory: true,
    gates,
  });
  return out;
}

export function evaluateDependencyFreeze(
  dependencies: readonly DependencyInput[],
  directBridgeGatewayVerified: boolean,
): PrerequisiteResult[] {
  const section = 'Mainnet RPC + ecosystem dependencies';
  const out: PrerequisiteResult[] = REQUIRED_DEPENDENCY_IDS.map((id) => {
    const dep = dependencies.find((d) => d.id === id) ?? null;
    const bad =
      dep !== null &&
      (contaminated(dep.address) ||
        dep.chainId === BOT_TESTNET_CHAIN_ID ||
        legacyIdentifier(dep.chainId));
    const needsAddress = id !== 'botMainnetRpc' && id !== 'botMainnetExplorer';
    const ok =
      dep !== null &&
      !bad &&
      dep.chainId === BOT_MAINNET_CHAIN_ID &&
      (needsAddress ? isAddress(dep.address) && dep.bytecodeVerified : Boolean(dep.url));
    return {
      id: `DEP_${id.toUpperCase()}`,
      section,
      status: (ok ? 'VERIFIED' : bad ? 'BLOCKED' : 'NEEDS_APPROVAL') as PrerequisiteStatus,
      detail: bad
        ? 'testnet address / legacy 1024 identifier present — mainnet manifest blocked'
        : needsAddress
          ? 'address must be verified to hold bytecode on BOT Mainnet 677'
          : 'approved endpoint/URL and fallback strategy must be frozen',
      mandatory: true,
      gates: ['FlowBridgeRouterV4'],
    };
  });

  out.push({
    id: 'DIRECT_BRIDGE_GATEWAY_VERIFIED',
    section,
    status: directBridgeGatewayVerified ? 'VERIFIED' : 'BLOCKED',
    detail: 'direct official BOT Bridge gateway + token/resource config must be verified for 677',
    mandatory: true,
    gates: ['FlowBridgeRouterV4'],
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Deployment / funding simulation                                            */
/* -------------------------------------------------------------------------- */

export interface DeploymentStepSimulation {
  order: number;
  step: string;
  contractId: string | null;
  constructorArgs: Record<string, string | number | null>;
  /** Contract ids that must already be deployed for this step. */
  dependsOn: readonly string[];
  resolved: boolean;
  blockers: readonly string[];
}

/** Estimated deployment gas per contract (units), from frozen bytecode sizes. */
export const DEPLOYMENT_GAS_UNITS: Record<string, number> = {
  FlowToken: 1_500_000,
  FlowRewardsMerkleDistributor: 1_900_000,
  FlowBridgeRouterV4: 4_600_000,
  FlowBridgeRouterLens: 900_000,
  FlowBridgeActivityRegistry: 1_600_000,
  FlowStakingRewardTreasury: 1_200_000,
  FlowStakingController: 2_100_000,
  FlowStakingVaultV2: 2_800_000,
};

export const ROLE_TRANSFER_GAS_UNITS = 900_000;
export const GAS_SAFETY_BUFFER_BPS = 3_000; // +30%

export function estimatedDeploymentGasUnits(): number {
  const deploy = Object.values(DEPLOYMENT_GAS_UNITS).reduce((a, b) => a + b, 0);
  const raw = deploy + ROLE_TRANSFER_GAS_UNITS;
  return Math.ceil(raw * (1 + GAS_SAFETY_BUFFER_BPS / 10_000));
}

export function simulateDeploymentOrder(
  inputs: MainnetPrerequisiteInputs,
): readonly DeploymentStepSimulation[] {
  const role = (system: string, r: string): string | null => {
    const a = inputs.governance.find((g) => g.system === system && g.role === r);
    return a && isAddress(a.address) && a.reviewedMultisig ? (a.address as string) : null;
  };
  const tokenAddress = null as string | null; // unknown until FlowToken is deployed

  const steps: Omit<DeploymentStepSimulation, 'order' | 'resolved' | 'blockers'>[] = [
    {
      step: 'deploy production governance (multisig + timelock) and record addresses',
      contractId: null,
      constructorArgs: { timelockDelaySeconds: inputs.governance.find((g) => g.timelockDelaySeconds !== null)?.timelockDelaySeconds ?? null },
      dependsOn: [],
    },
    {
      step: 'deploy FlowToken (single constructor mint to approved treasury)',
      contractId: 'FlowToken',
      constructorArgs: {
        name: inputs.token.name,
        symbol: inputs.token.symbol,
        treasury: inputs.token.treasuryIsReviewedMultisig ? inputs.token.treasuryRecipient : null,
        totalSupply: inputs.token.totalSupplyFlow,
      },
      dependsOn: [],
    },
    {
      step: 'deploy FlowRewardsMerkleDistributor',
      contractId: 'FlowRewardsMerkleDistributor',
      constructorArgs: {
        token: tokenAddress,
        admin: role('Rewards', 'admin'),
        campaignManager: role('Rewards', 'campaignManager'),
        rootPublisher: role('Rewards', 'rootPublisher'),
        pauser: role('Rewards', 'pauser'),
        rootDelaySeconds: inputs.rewards.rootDelaySeconds,
      },
      dependsOn: ['FlowToken'],
    },
    {
      step: 'deploy FlowBridgeRouterV4 (Safe-only mainnet candidate)',
      contractId: 'FlowBridgeRouterV4',
      constructorArgs: {
        owner: role('Router V4', 'owner'),
        feeTreasury: role('Router V4', 'feeTreasury'),
        bdexSwapRouter: inputs.dependencies.find((d) => d.id === 'bdexSwapRouter')?.address ?? null,
        wrappedNative: inputs.dependencies.find((d) => d.id === 'wrappedNative')?.address ?? null,
      },
      dependsOn: [],
    },
    {
      step: 'deploy FlowBridgeRouterLens',
      contractId: 'FlowBridgeRouterLens',
      constructorArgs: { flowRouter: null },
      dependsOn: ['FlowBridgeRouterV4'],
    },
    {
      step: 'deploy FlowBridgeActivityRegistry',
      contractId: 'FlowBridgeActivityRegistry',
      constructorArgs: {
        admin: role('Activity Registry', 'admin'),
        attester: role('Activity Registry', 'attester'),
        pauser: role('Activity Registry', 'pauser'),
      },
      dependsOn: [],
    },
    {
      step: 'deploy FlowStakingRewardTreasury',
      contractId: 'FlowStakingRewardTreasury',
      constructorArgs: {
        token: tokenAddress,
        admin: role('Staking', 'treasuryAdmin'),
        recoveryRecipient: role('Staking', 'recoveryRecipient'),
      },
      dependsOn: ['FlowToken'],
    },
    {
      step: 'deploy FlowStakingController',
      contractId: 'FlowStakingController',
      constructorArgs: {
        admin: role('Staking', 'vaultAdmin'),
        governor: role('Staking', 'controllerGovernor'),
        publisher: role('Staking', 'controllerPublisher'),
      },
      dependsOn: [],
    },
    {
      step: 'deploy FlowStakingVaultV2',
      contractId: 'FlowStakingVaultV2',
      constructorArgs: {
        token: tokenAddress,
        controller: null,
        rewardTreasury: null,
        admin: role('Staking', 'vaultAdmin'),
      },
      dependsOn: ['FlowToken', 'FlowStakingController', 'FlowStakingRewardTreasury'],
    },
    {
      step: 'grant VAULT_ROLE/CONTROLLER_ROLE, transfer ownership/admin to governance, accept via timelock',
      contractId: null,
      constructorArgs: {},
      dependsOn: ['FlowStakingVaultV2', 'FlowRewardsMerkleDistributor', 'FlowBridgeRouterV4'],
    },
    {
      step: 'verify deployed runtime hashes, then activate the app registry records',
      contractId: null,
      constructorArgs: {},
      dependsOn: [],
    },
  ];

  return steps.map((s, i) => {
    const missing = Object.entries(s.constructorArgs)
      .filter(([, v]) => v === null || v === '')
      .map(([k]) => k);
    const dependencyBlockers = s.dependsOn
      .filter((id) => (registryRecord('mainnet', id)?.address ?? null) === null)
      .map((id) => `${id} not deployed on BOT Mainnet ${BOT_MAINNET_CHAIN_ID}`);
    return {
      order: i + 1,
      step: s.step,
      contractId: s.contractId,
      constructorArgs: s.constructorArgs,
      dependsOn: s.dependsOn,
      resolved: missing.length === 0 && dependencyBlockers.length === 0,
      blockers: [
        ...(missing.length ? [`unfrozen values: ${missing.join(', ')}`] : []),
        ...dependencyBlockers,
      ],
    };
  });
}

export interface FundingStep {
  order: number;
  action: string;
  precondition: string;
  executeInThisGate: false;
}

export function fundingOrderSimulation(): readonly FundingStep[] {
  return [
    { order: 1, action: 'FLOW genesis mint to approved treasury (constructor only)', precondition: 'FlowToken deployed with frozen treasury', executeInThisGate: false },
    { order: 2, action: 'treasury funds Rewards Distributor', precondition: 'deployed runtime hash + roles verified', executeInThisGate: false },
    { order: 3, action: 'treasury funds Staking Reward Treasury', precondition: 'deployed runtime hash + roles verified; never commingled with principal', executeInThisGate: false },
    { order: 4, action: 'activate rewards epochs', precondition: 'funding observed on-chain and budget within funded inventory', executeInThisGate: false },
    { order: 5, action: 'activate staking products', precondition: 'reserve funded, oracle healthy, controller config verified', executeInThisGate: false },
  ];
}

export interface LaunchFeature {
  feature: string;
  enabled: boolean;
  requirement: string;
}

export function launchFeatureMatrix(result: MainnetPrerequisiteEvaluation): readonly LaunchFeature[] {
  const ready = (contractId: string) =>
    result.contractReadiness.find((c) => c.contractId === contractId)?.readyForDeployment === true;
  return [
    { feature: 'Router V4 Safe swaps', enabled: ready('FlowBridgeRouterV4'), requirement: 'router/BDEX config + governance verified' },
    { feature: 'Direct official BOT Bridge', enabled: result.prerequisites.find((p) => p.id === 'DIRECT_BRIDGE_GATEWAY_VERIFIED')?.status === 'VERIFIED', requirement: 'gateway + token/resource config verified for 677' },
    { feature: 'Rewards claims', enabled: ready('FlowRewardsMerkleDistributor'), requirement: 'funding, roles, campaign budget and first valid epoch verified' },
    { feature: 'Staking', enabled: ready('FlowStakingVaultV2') && ready('FlowStakingController'), requirement: 'token, oracle, reserve funding, controller config, vault verification' },
    { feature: 'Activity Registry', enabled: ready('FlowBridgeActivityRegistry'), requirement: 'admin != attester, pauser assigned, runtime verified' },
    { feature: 'BridgeAdapter mainnet execution', enabled: false, requirement: 'permanently disabled in this release (refund-path blocker)' },
  ];
}

/* -------------------------------------------------------------------------- */
/* Aggregate evaluation                                                       */
/* -------------------------------------------------------------------------- */

export interface ContractReadiness {
  contractId: string;
  readyForDeployment: boolean;
  unresolved: readonly string[];
}

export interface MainnetPrerequisiteEvaluation {
  chainId: number;
  prerequisites: readonly PrerequisiteResult[];
  contractReadiness: readonly ContractReadiness[];
  deploymentPlan: readonly DeploymentStepSimulation[];
  fundingPlan: readonly FundingStep[];
  estimatedGasUnits: number;
  gasBudgetApproved: boolean;
  verdict: 'PASS' | 'BLOCKED';
  blockers: readonly string[];
  publicWrites: {
    mainnetDeployments: 0;
    testnetDeployments: 0;
    signatures: 0;
    transactions: 0;
    flowTransfers: 0;
    rewardsClaims: 0;
    stakingActions: 0;
  };
}

export function evaluateMainnetPrerequisites(
  inputs: MainnetPrerequisiteInputs,
): MainnetPrerequisiteEvaluation {
  const prerequisites: PrerequisiteResult[] = [
    ...evaluateTokenFreeze(inputs.token),
    ...evaluateGovernanceMatrix(inputs.governance),
    ...evaluateRewardsFunding(inputs.rewards),
    ...evaluateStakingFunding(inputs.staking),
    ...evaluateOracleGate(inputs.oracle),
    ...evaluateDependencyFreeze(inputs.dependencies, inputs.directBridgeGatewayVerified),
  ];

  const gasBudgetApproved =
    inputs.approvedGasBudgetWei !== null && inputs.approvedGasBudgetWei > 0n;
  prerequisites.push({
    id: 'DEPLOYMENT_GAS_BUDGET_APPROVED',
    section: 'Deployment simulation',
    status: gasBudgetApproved ? 'VERIFIED' : 'NEEDS_APPROVAL',
    detail: `estimated ${estimatedDeploymentGasUnits()} gas units incl. ${GAS_SAFETY_BUFFER_BPS / 100}% buffer`,
    mandatory: true,
    gates: [],
  });

  const candidateIds = CONTRACT_INVENTORY.map((c) => c.id).concat('FlowRewardsMerkleDistributor');
  const uniqueIds = Array.from(new Set(candidateIds));

  const contractReadiness: ContractReadiness[] = uniqueIds.map((contractId) => {
    const unresolved = prerequisites
      .filter((p) => p.mandatory && p.status !== 'VERIFIED' && p.gates.includes(contractId))
      .map((p) => `${p.id} (${p.status})`);
    const inventoryBlocked =
      CONTRACT_INVENTORY.find((c) => c.id === contractId)?.readiness === 'BLOCKED';
    return {
      contractId,
      readyForDeployment: unresolved.length === 0 && !inventoryBlocked && gasBudgetApproved,
      unresolved: inventoryBlocked ? [...unresolved, 'inventory readiness = BLOCKED'] : unresolved,
    };
  });

  const blockers = prerequisites
    .filter((p) => p.status !== 'VERIFIED')
    .map((p) => `${p.status}: ${p.id} — ${p.detail}`);

  const verdict: 'PASS' | 'BLOCKED' = blockers.length === 0 ? 'PASS' : 'BLOCKED';

  return {
    chainId: BOT_MAINNET_CHAIN_ID,
    prerequisites,
    contractReadiness,
    deploymentPlan: simulateDeploymentOrder(inputs),
    fundingPlan: fundingOrderSimulation(),
    estimatedGasUnits: estimatedDeploymentGasUnits(),
    gasBudgetApproved,
    verdict,
    blockers,
    publicWrites: {
      mainnetDeployments: 0,
      testnetDeployments: 0,
      signatures: 0,
      transactions: 0,
      flowTransfers: 0,
      rewardsClaims: 0,
      stakingActions: 0,
    },
  };
}

/** Guard: a deployment plan may never target anything but BOT Mainnet 677. */
export function assertMainnetTarget(chainId: number | null): void {
  if (chainId !== BOT_MAINNET_CHAIN_ID) {
    throw new Error(
      `V30.1D: deployment plan target must be BOT Mainnet ${BOT_MAINNET_CHAIN_ID}; got ${chainId ?? 'unknown'} (legacy ${UNVERIFIED_LEGACY_BOT_IDENTIFIER} is never accepted)`,
    );
  }
}
