/**
 * FlowBridge V30.1D.1 — Mainnet Decision Pack + Staged Product Activation.
 *
 * Pure and descriptive. This module (a) pre-fills every value that is already
 * canonical FlowBridge specification or publicly verifiable BOT Chain fact,
 * (b) keeps each such value as an explicit CANONICAL_PROPOSAL until the owner
 * approves it, and (c) separates DEPLOYMENT_READY from FEATURE_ACTIVE so a
 * post-deployment fact (FLOW/USD TWAP history) can never block the deployment
 * that must create it.
 *
 * It never deploys, signs, funds, or approves anything. Approval records are
 * inputs, never defaults.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { STAKING_V2_CONSTANTS } from '@/lib/staking/stakingV2Matrix';

export type ApprovalState =
  | 'CANONICAL_PROPOSAL_NEEDS_OWNER_APPROVAL'
  | 'OWNER_APPROVED'
  | 'OWNER_REJECTED';

export type DependencyState = 'DOCUMENTED_OFFICIAL' | 'VERIFIED' | 'REJECTED';

export type ReadinessStage =
  | 'SOURCE_READY'
  | 'DEPLOYMENT_READY'
  | 'DEPLOYED_VERIFIED'
  | 'FUNDED_READY'
  | 'FEATURE_ACTIVE';

export const READINESS_STAGES: readonly ReadinessStage[] = [
  'SOURCE_READY',
  'DEPLOYMENT_READY',
  'DEPLOYED_VERIFIED',
  'FUNDED_READY',
  'FEATURE_ACTIVE',
];

/* -------------------------------------------------------------------------- */
/* 2. Canonical FLOW economics — pre-filled proposal, never auto-approved      */
/* -------------------------------------------------------------------------- */

export interface AllocationSlice {
  bucket: string;
  percent: number;
  flow: number;
}

export const FLOW_GENESIS_SUPPLY = 1_000_000_000;
export const FLOW_DECIMALS = 18;

export const FLOW_GENESIS_ALLOCATION: readonly AllocationSlice[] = [
  { bucket: 'Community & Ecosystem', percent: 50, flow: 500_000_000 },
  { bucket: 'Team & Core Contributors', percent: 15, flow: 150_000_000 },
  { bucket: 'Protocol Treasury', percent: 15, flow: 150_000_000 },
  { bucket: 'Liquidity & Market Infrastructure', percent: 10, flow: 100_000_000 },
  { bucket: 'Strategic Ecosystem Partners', percent: 5, flow: 50_000_000 },
  { bucket: 'Security & Contingency Reserve', percent: 5, flow: 50_000_000 },
];

export const COMMUNITY_INTERNAL_RESERVES: readonly { bucket: string; flow: number }[] = [
  { bucket: 'User rewards', flow: 200_000_000 },
  { bucket: 'Partner campaign matching', flow: 100_000_000 },
  { bucket: 'Staking / long-term alignment', flow: 75_000_000 },
  { bucket: 'Referral / community / developer', flow: 50_000_000 },
  { bucket: 'Genesis / legacy recognition', flow: 30_000_000 },
  { bucket: 'Future ecosystem reserve', flow: 45_000_000 },
];

export const YEAR1_COMMUNITY_CEILING_FLOW = 20_000_000;
export const YEAR1_STAKING_COMPONENT_MAX_FLOW = 3_000_000;
export const ONE_TIME_GENESIS_LEGACY_CEILING_FLOW = 10_000_000;

export const VESTING_BASELINE = {
  team: { tgePercent: 0, cliffMonths: 12, linearMonths: 36 },
  strategicPartners: { tgePercent: 0, cliffMonths: 12, linearMonths: 24 },
} as const;

export interface CanonicalFlowProposal {
  supplyFlow: number;
  decimals: number;
  postDeploymentMintAuthority: false;
  allocation: readonly AllocationSlice[];
  communityReserves: readonly { bucket: string; flow: number }[];
  year1CommunityCeilingFlow: number;
  year1StakingComponentMaxFlow: number;
  oneTimeGenesisLegacyCeilingFlow: number;
  vesting: typeof VESTING_BASELINE;
  approval: ApprovalState;
  allocationSumFlow: number;
  allocationSumPercent: number;
  internallyConsistent: boolean;
}

/** Owner approval records supplied from outside; empty means nothing approved. */
export interface OwnerApprovalRecord {
  /** Decision sheet item id from OWNER_DECISION_SHEET. */
  id: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  note?: string | null;
}

function approvalFor(records: readonly OwnerApprovalRecord[], id: string): ApprovalState {
  const rec = records.find((r) => r.id === id);
  if (!rec || !rec.approvedBy || !rec.approvedAt) return 'CANONICAL_PROPOSAL_NEEDS_OWNER_APPROVAL';
  return rec.approved ? 'OWNER_APPROVED' : 'OWNER_REJECTED';
}

export function canonicalFlowProposal(
  approvals: readonly OwnerApprovalRecord[] = [],
): CanonicalFlowProposal {
  const allocationSumFlow = FLOW_GENESIS_ALLOCATION.reduce((a, s) => a + s.flow, 0);
  const allocationSumPercent = FLOW_GENESIS_ALLOCATION.reduce((a, s) => a + s.percent, 0);
  const reserves = COMMUNITY_INTERNAL_RESERVES.reduce((a, s) => a + s.flow, 0);
  const community = FLOW_GENESIS_ALLOCATION.find((s) => s.bucket.startsWith('Community'))!.flow;
  return {
    supplyFlow: FLOW_GENESIS_SUPPLY,
    decimals: FLOW_DECIMALS,
    postDeploymentMintAuthority: false,
    allocation: FLOW_GENESIS_ALLOCATION,
    communityReserves: COMMUNITY_INTERNAL_RESERVES,
    year1CommunityCeilingFlow: YEAR1_COMMUNITY_CEILING_FLOW,
    year1StakingComponentMaxFlow: YEAR1_STAKING_COMPONENT_MAX_FLOW,
    oneTimeGenesisLegacyCeilingFlow: ONE_TIME_GENESIS_LEGACY_CEILING_FLOW,
    vesting: VESTING_BASELINE,
    approval: approvalFor(approvals, 'FLOW_SUPPLY_AND_ALLOCATION'),
    allocationSumFlow,
    allocationSumPercent,
    internallyConsistent:
      allocationSumFlow === FLOW_GENESIS_SUPPLY &&
      allocationSumPercent === 100 &&
      reserves === community &&
      YEAR1_STAKING_COMPONENT_MAX_FLOW === STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Official BOT Mainnet dependency matrix                                   */
/* -------------------------------------------------------------------------- */

export interface OfficialDependency {
  id: string;
  label: string;
  /** Documented official value from BOT Chain developer docs. */
  value: string;
  kind: 'RPC' | 'EXPLORER' | 'CONTRACT' | 'RESOURCE_ID';
  /** Whether this gate requires on-chain bytecode before VERIFIED. */
  requiresBytecode: boolean;
  usedByCurrentDesign: boolean;
  note: string;
}

export const OFFICIAL_BOT_MAINNET_DEPENDENCIES: readonly OfficialDependency[] = [
  {
    id: 'botMainnetRpc',
    label: 'Chain / RPC',
    value: 'https://rpc.botchain.ai',
    kind: 'RPC',
    requiresBytecode: false,
    usedByCurrentDesign: true,
    note: 'eth_chainId must equal 677',
  },
  {
    id: 'botMainnetExplorer',
    label: 'Explorer',
    value: 'https://scan.botchain.ai',
    kind: 'EXPLORER',
    requiresBytecode: false,
    usedByCurrentDesign: true,
    note: 'navigation/status only',
  },
  {
    id: 'wrappedNative',
    label: 'WBOT',
    value: '0xD5452816194a3784dBa983426cCe7c122F4abd30',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: true,
    note: 'Router wrapped-native path',
  },
  {
    id: 'bdexV2Router02',
    label: 'BDEX V2 Router02',
    value: '0x1414eD29FdFD322c3c0a830330ed982E2D629e76',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: false,
    note: 'kept documented; Router V4 targets the V3 SwapRouter',
  },
  {
    id: 'bdexSwapRouter',
    label: 'BDEX V3 SwapRouter',
    value: '0x07032d47A1b9f8460cBeE9dC17c1d3E438693929',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: true,
    note: 'Router V4 swap counterparty; needs live integration canary before activation',
  },
  {
    id: 'bdexV3Factory',
    label: 'BDEX V3 Factory',
    value: '0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: true,
    note: 'future FLOW/USDT pool provenance for the TWAP candidate',
  },
  {
    id: 'bdexUniversalRouter',
    label: 'BDEX Universal Router',
    value: '0xaE6ae8630f7A888dEc0B9195C85F7515d5887655',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: false,
    note: 'not used by the current Router design; documented only',
  },
  {
    id: 'directBridgeGateway',
    label: 'BOT BridgeRouter',
    value: '0xef8DC669ECa13E612b67Ff09478352E85bD6CC53',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: true,
    note: 'direct official bridge canonical path',
  },
  {
    id: 'botUsdt',
    label: 'BOT USDT',
    value: '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C',
    kind: 'CONTRACT',
    requiresBytecode: true,
    usedByCurrentDesign: true,
    note: 'decimals must equal 6',
  },
  {
    id: 'bridgeUsdtResourceId',
    label: 'Bridge USDT resource ID',
    value: '0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d',
    kind: 'RESOURCE_ID',
    requiresBytecode: false,
    usedByCurrentDesign: true,
    note: 'bridge resource identifier — never a chain id or contract address',
  },
];

/** An observation recorded from a public read (eth_chainId / eth_getCode). */
export interface ChainObservation {
  id: string;
  chainId: number | null;
  /** Runtime bytecode length in bytes; 0 or null means no code. */
  codeBytes: number | null;
  /** Optional decimals read for token dependencies. */
  decimals?: number | null;
  observedAt: string;
}

export interface DependencyVerification {
  id: string;
  label: string;
  value: string;
  state: DependencyState;
  usedByCurrentDesign: boolean;
  detail: string;
}

export function verifyOfficialDependencies(
  observations: readonly ChainObservation[],
): readonly DependencyVerification[] {
  return OFFICIAL_BOT_MAINNET_DEPENDENCIES.map((dep) => {
    const obs = observations.find((o) => o.id === dep.id) ?? null;
    const chainOk = obs?.chainId === BOT_MAINNET_CHAIN_ID;
    let state: DependencyState = 'DOCUMENTED_OFFICIAL';
    let detail = 'documented official value; awaiting a chain 677 observation';

    if (obs && obs.chainId !== null && !chainOk) {
      return {
        ...dep,
        state: 'REJECTED',
        detail: `observation reports chain ${obs.chainId}, not BOT Mainnet ${BOT_MAINNET_CHAIN_ID}`,
      };
    }
    if (dep.requiresBytecode) {
      if (obs && chainOk && (obs.codeBytes ?? 0) > 0) {
        if (dep.id === 'botUsdt' && obs.decimals !== 6) {
          state = 'REJECTED';
          detail = `USDT decimals must be 6; observed ${obs.decimals ?? 'unknown'}`;
        } else {
          state = 'VERIFIED';
          detail = `${obs.codeBytes} bytes of runtime bytecode observed on chain ${BOT_MAINNET_CHAIN_ID}`;
        }
      } else if (obs && chainOk) {
        state = 'REJECTED';
        detail = 'no runtime bytecode at the documented address';
      }
    } else if (obs && chainOk) {
      state = 'VERIFIED';
      detail = dep.kind === 'RPC' ? 'eth_chainId returned 677' : 'endpoint reachable and pinned';
    } else if (dep.kind === 'RESOURCE_ID') {
      detail = 'resource id recorded; verified only against a live bridge deposit config';
    }
    return { ...dep, state, detail };
  });
}

/** Observations recorded for this gate from public read-only RPC calls. */
export const RECORDED_CHAIN_OBSERVATIONS: readonly ChainObservation[] = [
  { id: 'botMainnetRpc', chainId: 677, codeBytes: null, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'wrappedNative', chainId: 677, codeBytes: 2317, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'bdexV2Router02', chainId: 677, codeBytes: 21987, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'bdexSwapRouter', chainId: 677, codeBytes: 10088, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'bdexV3Factory', chainId: 677, codeBytes: 24535, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'bdexUniversalRouter', chainId: 677, codeBytes: 18242, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'directBridgeGateway', chainId: 677, codeBytes: 2227, observedAt: '2026-08-26T14:00:00.000Z' },
  { id: 'botUsdt', chainId: 677, codeBytes: 6188, decimals: 6, observedAt: '2026-08-26T14:00:00.000Z' },
];

/* -------------------------------------------------------------------------- */
/* 4. Governance authority consolidation                                       */
/* -------------------------------------------------------------------------- */

export type AuthorityId =
  | 'GOVERNANCE_SAFE'
  | 'TREASURY_SAFE'
  | 'OPERATIONS_SAFE'
  | 'ROOT_PUBLISHER'
  | 'ACTIVITY_ATTESTER';

export interface AuthorityDefinition {
  id: AuthorityId;
  label: string;
  purpose: string;
  roles: readonly string[];
  /** Authorities this one must never share an address with. */
  mustDifferFrom: readonly AuthorityId[];
  capabilityLimits: readonly string[];
}

export const GOVERNANCE_AUTHORITIES: readonly AuthorityDefinition[] = [
  {
    id: 'GOVERNANCE_SAFE',
    label: 'Governance Safe (via TimelockController)',
    purpose: 'owner/admin authority for Router, Rewards, Staking and Activity Registry',
    roles: [
      'Router V4 owner',
      'Router V4 registryAdmin',
      'Rewards admin',
      'Staking vaultAdmin',
      'Staking controllerGovernor',
      'Staking treasuryAdmin',
      'Activity Registry admin',
    ],
    mustDifferFrom: ['ROOT_PUBLISHER', 'ACTIVITY_ATTESTER'],
    capabilityLimits: ['material economic/registry changes pass through the timelock delay'],
  },
  {
    id: 'TREASURY_SAFE',
    label: 'Treasury Safe',
    purpose: 'receives FLOW genesis supply and performs approved funding actions',
    roles: ['FLOW treasury tokenRecipient', 'Router V4 feeTreasury', 'Staking recoveryRecipient'],
    mustDifferFrom: ['ROOT_PUBLISHER', 'ACTIVITY_ATTESTER'],
    capabilityLimits: [
      'may hold and move approved FLOW only',
      'sharing membership with Governance requires an explicit owner concentration approval',
    ],
  },
  {
    id: 'OPERATIONS_SAFE',
    label: 'Operations authority',
    purpose: 'narrowly scoped operational pausers and campaign management',
    roles: ['Router V4 pauser', 'Rewards campaignManager', 'Rewards pauser', 'Staking pauser', 'Activity Registry pauser'],
    mustDifferFrom: ['ACTIVITY_ATTESTER'],
    capabilityLimits: ['may pause immediately; unpause and configuration remain governed'],
  },
  {
    id: 'ROOT_PUBLISHER',
    label: 'Rewards root publisher',
    purpose: 'publishes finite Merkle epochs after the approved delay',
    roles: ['Rewards rootPublisher', 'Staking controllerPublisher'],
    mustDifferFrom: ['GOVERNANCE_SAFE', 'TREASURY_SAFE'],
    capabilityLimits: [
      'cannot change campaign budgets',
      'cannot recover or withdraw funds',
      'cannot grant roles',
    ],
  },
  {
    id: 'ACTIVITY_ATTESTER',
    label: 'Activity attester',
    purpose: 'appends verified activity evidence only',
    roles: ['Activity Registry attester'],
    mustDifferFrom: ['GOVERNANCE_SAFE', 'TREASURY_SAFE', 'OPERATIONS_SAFE'],
    capabilityLimits: ['append-only; never receives reward or funding authority'],
  },
];

export interface AuthorityAssignment {
  id: AuthorityId;
  address: string | null;
  safeOwners: readonly string[];
  threshold: number | null;
  timelockDelaySeconds: number | null;
  approvedBy: string | null;
  /** Explicit owner approval of Governance/Treasury address concentration. */
  concentrationApproved?: boolean;
}

export interface AuthorityEvaluation {
  id: AuthorityId;
  label: string;
  status: 'VERIFIED' | 'NEEDS_OWNER_INPUT' | 'BLOCKED';
  detail: string;
  roles: readonly string[];
}

export const RECOMMENDED_GOVERNANCE_DEFAULTS = {
  minThreshold: 2,
  minOwners: 3,
  preferredThreshold: 3,
  preferredOwners: 5,
  timelockDelaySeconds: 24 * 3600,
  platform: 'Safe (Smart Account) on BOT Chain Mainnet 677',
  emergency: 'immediate pause through a narrowly scoped pauser; unpause/config governed',
} as const;

const isAddr = (v: string | null | undefined) => /^0x[0-9a-fA-F]{40}$/.test(v ?? '');

export function evaluateAuthorities(
  assignments: readonly AuthorityAssignment[],
): readonly AuthorityEvaluation[] {
  const byId = (id: AuthorityId) => assignments.find((a) => a.id === id) ?? null;

  return GOVERNANCE_AUTHORITIES.map((def) => {
    const a = byId(def.id);
    if (!a || !isAddr(a.address)) {
      return {
        id: def.id,
        label: def.label,
        status: 'NEEDS_OWNER_INPUT' as const,
        detail: 'owner must provide Safe owners, threshold and the final address — no signer may be invented',
        roles: def.roles,
      };
    }
    const clash = def.mustDifferFrom
      .map(byId)
      .find((other) => other && isAddr(other.address) && other.address!.toLowerCase() === a.address!.toLowerCase());
    if (clash) {
      return {
        id: def.id,
        label: def.label,
        status: 'BLOCKED' as const,
        detail: `separation invariant violated: shares an address with ${clash.id}`,
        roles: def.roles,
      };
    }
    const isSafeLike = def.id !== 'ROOT_PUBLISHER' && def.id !== 'ACTIVITY_ATTESTER';
    const thresholdOk =
      !isSafeLike ||
      ((a.threshold ?? 0) >= RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold &&
        a.safeOwners.length >= RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners &&
        (a.threshold ?? 0) <= a.safeOwners.length &&
        new Set(a.safeOwners.map((o) => o.toLowerCase())).size === a.safeOwners.length);
    if (!thresholdOk) {
      return {
        id: def.id,
        label: def.label,
        status: 'BLOCKED' as const,
        detail: 'Safe owners/threshold do not meet the approved minimum (2-of-3) or contain duplicates',
        roles: def.roles,
      };
    }
    if (def.id === 'GOVERNANCE_SAFE' && (a.timelockDelaySeconds ?? 0) <= 0) {
      return {
        id: def.id,
        label: def.label,
        status: 'NEEDS_OWNER_INPUT' as const,
        detail: 'timelock delay policy must be approved (default proposal: 24h)',
        roles: def.roles,
      };
    }
    if (!a.approvedBy) {
      return {
        id: def.id,
        label: def.label,
        status: 'NEEDS_OWNER_INPUT' as const,
        detail: 'address proposed but not explicitly approved by the owner',
        roles: def.roles,
      };
    }
    const gov = byId('GOVERNANCE_SAFE');
    if (
      def.id === 'TREASURY_SAFE' &&
      gov &&
      isAddr(gov.address) &&
      gov.safeOwners.length > 0 &&
      gov.safeOwners.every((o) => a.safeOwners.some((x) => x.toLowerCase() === o.toLowerCase())) &&
      !a.concentrationApproved
    ) {
      return {
        id: def.id,
        label: def.label,
        status: 'BLOCKED' as const,
        detail: 'Treasury shares Governance membership without an explicit concentration approval',
        roles: def.roles,
      };
    }
    return {
      id: def.id,
      label: def.label,
      status: 'VERIFIED' as const,
      detail: 'approved authority with satisfied separation invariants',
      roles: def.roles,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 5. Oracle sequencing + BDEX V3 TWAP feasibility                             */
/* -------------------------------------------------------------------------- */

export interface OracleFeasibilityInput {
  /** FLOW/USDT pool address created by the official BDEX V3 factory, if any. */
  poolAddress: string | null;
  poolFromOfficialFactory: boolean;
  feeTier: number | null;
  observeSupported: boolean;
  observationCardinality: number | null;
  observedWindowSeconds: number | null;
  poolLiquidityUsd: number | null;
  minLiquidityUsd: number | null;
  maxFreshnessSeconds: number | null;
  maxDeviationBps: number | null;
}

export const EMPTY_ORACLE_FEASIBILITY: OracleFeasibilityInput = {
  poolAddress: null,
  poolFromOfficialFactory: false,
  feeTier: null,
  observeSupported: false,
  observationCardinality: null,
  observedWindowSeconds: null,
  poolLiquidityUsd: null,
  minLiquidityUsd: null,
  maxFreshnessSeconds: null,
  maxDeviationBps: null,
};

export const REQUIRED_TWAP_WINDOW_SECONDS = 7 * 86_400;

export interface OracleVerdict {
  /** No official Chainlink/Pyth deployment may be assumed for BOT Chain. */
  externalFeedAvailable: false;
  candidate: string;
  status: 'UNAVAILABLE' | 'PENDING_POOL' | 'WARMING_UP' | 'READY';
  dynamicStakingFeatureActive: boolean;
  /** Genesis/locked-floor obligations never read the oracle. */
  genesisAndFloorOracleIndependent: true;
  variableBonusBps: 0 | number;
  blockers: readonly string[];
  /** Deployment of any contract is explicitly NOT blocked by the oracle. */
  blocksDeployment: false;
}

export function evaluateOracleFeasibility(input: OracleFeasibilityInput): OracleVerdict {
  const blockers: string[] = [];
  if (!isAddr(input.poolAddress)) blockers.push('FLOW/USDT pool does not exist yet (FLOW is undeployed)');
  else {
    if (!input.poolFromOfficialFactory) blockers.push('pool provenance from the official BDEX V3 factory unproven');
    if (!input.observeSupported) blockers.push('pool does not expose the required observe()/TWAP mechanism');
    if ((input.observationCardinality ?? 0) < 2) blockers.push('observation cardinality history insufficient');
    if ((input.observedWindowSeconds ?? 0) < REQUIRED_TWAP_WINDOW_SECONDS)
      blockers.push('7-day observation window has not accumulated');
    if ((input.poolLiquidityUsd ?? 0) <= 0 || (input.minLiquidityUsd ?? 0) <= 0 || (input.poolLiquidityUsd ?? 0) < (input.minLiquidityUsd ?? Infinity))
      blockers.push('pool liquidity below the approved manipulation-resistance minimum');
    if ((input.maxFreshnessSeconds ?? 0) <= 0 || (input.maxDeviationBps ?? 0) <= 0)
      blockers.push('freshness and deviation thresholds unapproved');
  }

  const status: OracleVerdict['status'] = !isAddr(input.poolAddress)
    ? 'PENDING_POOL'
    : blockers.length === 0
      ? 'READY'
      : 'WARMING_UP';

  return {
    externalFeedAvailable: false,
    candidate: 'FLOW/USDT BDEX V3 pool TWAP (post-launch); no official Chainlink or Pyth feed exists on BOT Chain',
    status,
    dynamicStakingFeatureActive: blockers.length === 0 && status === 'READY',
    genesisAndFloorOracleIndependent: true,
    variableBonusBps: 0,
    blockers,
    blocksDeployment: false,
  };
}

/* -------------------------------------------------------------------------- */
/* 6. Staged readiness: deployment vs feature activation                       */
/* -------------------------------------------------------------------------- */

export interface StagedReadinessInput {
  /** Source/build/security gate result per contract id. */
  sourceReady: readonly string[];
  /** Owner approval records for the decision sheet. */
  approvals: readonly OwnerApprovalRecord[];
  authorities: readonly AuthorityAssignment[];
  dependencyObservations: readonly ChainObservation[];
  oracle: OracleFeasibilityInput;
  gasBudgetApproved: boolean;
  /** Deployed + verified contract ids on BOT Mainnet 677 (none in this gate). */
  deployedVerified: readonly string[];
  /** Contract ids whose required funding is observed and reconciled. */
  fundedVerified: readonly string[];
}

export const DEPLOYABLE_CONTRACTS = [
  'FlowToken',
  'FlowRewardsMerkleDistributor',
  'FlowBridgeRouterV4',
  'FlowBridgeRouterLens',
  'FlowBridgeActivityRegistry',
  'FlowStakingRewardTreasury',
  'FlowStakingController',
  'FlowStakingVaultV2',
] as const;

export interface ContractStage {
  contractId: string;
  stage: ReadinessStage;
  deploymentBlockers: readonly string[];
  activationBlockers: readonly string[];
}

export interface FeatureStage {
  feature: string;
  active: boolean;
  blockers: readonly string[];
  /** Blockers here never propagate to any contract's DEPLOYMENT_READY. */
  blocksDeployment: false;
}

export interface DecisionPackEvaluation {
  chainId: number;
  flow: CanonicalFlowProposal;
  dependencies: readonly DependencyVerification[];
  authorities: readonly AuthorityEvaluation[];
  oracle: OracleVerdict;
  contracts: readonly ContractStage[];
  features: readonly FeatureStage[];
  ownerDecisionSheet: readonly OwnerDecisionItem[];
  activationPlan: readonly ActivationStage[];
  missingOwnerInputs: readonly string[];
  verdict: 'READY' | 'BLOCKED';
  publicWrites: {
    mainnetDeployments: 0;
    safeCreations: 0;
    signatures: 0;
    flowTransfers: 0;
    liquidityProvisioning: 0;
    rewardsFundingOrClaims: 0;
    stakingFundingOrActions: 0;
  };
}

export interface OwnerDecisionItem {
  id: string;
  ask: string;
  proposal: string;
  state: ApprovalState;
  hiddenDefault: false;
}

export const OWNER_DECISION_SHEET: readonly Omit<OwnerDecisionItem, 'state'>[] = [
  {
    id: 'FLOW_SUPPLY_AND_ALLOCATION',
    ask: 'Approve or reject the canonical 1B FLOW supply and allocation matrix',
    proposal: '1,000,000,000 FLOW / 18 decimals / no mint authority; 50/15/15/10/5/5 allocation',
    hiddenDefault: false,
  },
  {
    id: 'GOVERNANCE_SAFE',
    ask: 'Provide Governance Safe owners + threshold + final address',
    proposal: 'Safe on BOT Mainnet 677, 2-of-3 minimum (3-of-5 preferred), behind a TimelockController',
    hiddenDefault: false,
  },
  {
    id: 'TREASURY_SAFE',
    ask: 'Provide Treasury Safe owners + threshold + final address',
    proposal: 'separate Safe from Governance; shared membership needs explicit concentration approval',
    hiddenDefault: false,
  },
  {
    id: 'TIMELOCK_POLICY',
    ask: 'Approve the timelock delay and emergency pauser model',
    proposal: '24h delay for material economic/registry changes; immediate narrowly scoped pause only',
    hiddenDefault: false,
  },
  {
    id: 'OPERATIONAL_AUTHORITIES',
    ask: 'Approve Root Publisher and Activity Attester authorities',
    proposal: 'dedicated operational signers; publisher cannot alter budgets or recover funds; attester append-only',
    hiddenDefault: false,
  },
  {
    id: 'REWARDS_LAUNCH',
    ask: 'Approve Rewards initial funding, launch campaign budget and root delay',
    proposal: 'no figure proposed — must come from the approved Year-1 community ceiling',
    hiddenDefault: false,
  },
  {
    id: 'STAKING_LAUNCH',
    ask: 'Approve Staking initial funding, maxFlowPerEpoch and day-one product set',
    proposal: `within Year-1 ceilings (genesis <= ${STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW}, standard <= ${STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW}, total <= ${STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW} FLOW)`,
    hiddenDefault: false,
  },
  {
    id: 'LIQUIDITY_PLAN',
    ask: 'Approve the initial liquidity plan and the maximum FLOW actually released at launch',
    proposal: 'the 100M liquidity reserve is a ceiling, not an instruction to deploy 100M',
    hiddenDefault: false,
  },
  {
    id: 'GAS_BUDGET',
    ask: 'Approve the BOT deployment-gas budget after a live gas-price preflight',
    proposal: 'store both gas units and a buffered BOT amount',
    hiddenDefault: false,
  },
  {
    id: 'LEGAL_SIGNOFF',
    ask: 'Record legal/compliance launch sign-off',
    proposal: 'external approval state only — code never self-certifies this',
    hiddenDefault: false,
  },
];

export interface ActivationStage {
  stage: number;
  action: string;
  precondition: string;
  executeInThisGate: false;
}

export const ACTIVATION_PLAN: readonly ActivationStage[] = [
  { stage: 1, action: 'deploy + verify governance, FlowToken, Router/Lens, Activity Registry, Rewards, Staking v2 with product writes disabled', precondition: 'DEPLOYMENT_READY for each contract', executeInThisGate: false },
  { stage: 2, action: 'transfer/administer all final roles; prove no deployer authority remains', precondition: 'DEPLOYED_VERIFIED', executeInThisGate: false },
  { stage: 3, action: 'fund only explicitly approved Rewards/Staking amounts', precondition: 'owner-approved funding figures; reserve ceilings never released automatically', executeInThisGate: false },
  { stage: 4, action: 'configure and seed approved FLOW market liquidity', precondition: 'approved liquidity plan; pool + observation support verified', executeInThisGate: false },
  { stage: 5, action: 'enable Router Safe swaps and the direct official Bridge independently', precondition: 'live canary per path', executeInThisGate: false },
  { stage: 6, action: 'activate Rewards', precondition: 'first finite Merkle epoch reproducible and funded', executeInThisGate: false },
  { stage: 7, action: 'activate staking products to the extent obligations are provably funded', precondition: 'dynamic bonus stays disabled until TWAP warm-up + liquidity gate pass', executeInThisGate: false },
];

const CONTRACT_DEPENDENCY_REQUIREMENTS: Record<string, readonly string[]> = {
  FlowToken: ['botMainnetRpc'],
  FlowRewardsMerkleDistributor: ['botMainnetRpc'],
  FlowBridgeRouterV4: ['botMainnetRpc', 'wrappedNative', 'bdexSwapRouter', 'directBridgeGateway', 'botUsdt'],
  FlowBridgeRouterLens: ['botMainnetRpc'],
  FlowBridgeActivityRegistry: ['botMainnetRpc'],
  FlowStakingRewardTreasury: ['botMainnetRpc'],
  FlowStakingController: ['botMainnetRpc'],
  FlowStakingVaultV2: ['botMainnetRpc'],
};

const CONTRACT_AUTHORITY_REQUIREMENTS: Record<string, readonly AuthorityId[]> = {
  FlowToken: ['TREASURY_SAFE'],
  FlowRewardsMerkleDistributor: ['GOVERNANCE_SAFE', 'OPERATIONS_SAFE', 'ROOT_PUBLISHER'],
  FlowBridgeRouterV4: ['GOVERNANCE_SAFE', 'TREASURY_SAFE', 'OPERATIONS_SAFE'],
  FlowBridgeRouterLens: ['GOVERNANCE_SAFE'],
  FlowBridgeActivityRegistry: ['GOVERNANCE_SAFE', 'ACTIVITY_ATTESTER', 'OPERATIONS_SAFE'],
  FlowStakingRewardTreasury: ['GOVERNANCE_SAFE', 'TREASURY_SAFE'],
  FlowStakingController: ['GOVERNANCE_SAFE', 'ROOT_PUBLISHER'],
  FlowStakingVaultV2: ['GOVERNANCE_SAFE', 'OPERATIONS_SAFE'],
};

export function evaluateDecisionPack(input: StagedReadinessInput): DecisionPackEvaluation {
  const flow = canonicalFlowProposal(input.approvals);
  const dependencies = verifyOfficialDependencies(input.dependencyObservations);
  const authorities = evaluateAuthorities(input.authorities);
  const oracle = evaluateOracleFeasibility(input.oracle);
  const approval = (id: string) => approvalFor(input.approvals, id);

  const depState = (id: string) => dependencies.find((d) => d.id === id)?.state ?? 'DOCUMENTED_OFFICIAL';
  const authState = (id: AuthorityId) => authorities.find((a) => a.id === id)?.status ?? 'NEEDS_OWNER_INPUT';

  const contracts: ContractStage[] = DEPLOYABLE_CONTRACTS.map((contractId) => {
    const deploymentBlockers: string[] = [];
    if (!input.sourceReady.includes(contractId)) deploymentBlockers.push('SOURCE_READY not proven');
    if (contractId === 'FlowToken' && flow.approval !== 'OWNER_APPROVED')
      deploymentBlockers.push('FLOW supply/allocation not owner-approved');
    for (const authorityId of CONTRACT_AUTHORITY_REQUIREMENTS[contractId] ?? []) {
      const s = authState(authorityId);
      if (s !== 'VERIFIED') deploymentBlockers.push(`${authorityId} ${s}`);
    }
    for (const depId of CONTRACT_DEPENDENCY_REQUIREMENTS[contractId] ?? []) {
      if (depState(depId) !== 'VERIFIED') deploymentBlockers.push(`dependency ${depId} not VERIFIED`);
    }
    if (approval('TIMELOCK_POLICY') !== 'OWNER_APPROVED') deploymentBlockers.push('timelock policy unapproved');
    if (!input.gasBudgetApproved) deploymentBlockers.push('deployment gas budget unapproved');

    const activationBlockers: string[] = [];
    if (contractId === 'FlowRewardsMerkleDistributor' && approval('REWARDS_LAUNCH') !== 'OWNER_APPROVED')
      activationBlockers.push('rewards funding/budget/root delay unapproved');
    if (contractId.startsWith('FlowStaking') && approval('STAKING_LAUNCH') !== 'OWNER_APPROVED')
      activationBlockers.push('staking funding/maxFlowPerEpoch/product set unapproved');

    let stage: ReadinessStage = input.sourceReady.includes(contractId) ? 'SOURCE_READY' : 'SOURCE_READY';
    if (deploymentBlockers.length === 0) stage = 'DEPLOYMENT_READY';
    if (input.deployedVerified.includes(contractId)) stage = 'DEPLOYED_VERIFIED';
    if (input.fundedVerified.includes(contractId)) stage = 'FUNDED_READY';
    if (
      stage === 'FUNDED_READY' &&
      activationBlockers.length === 0
    )
      stage = 'FEATURE_ACTIVE';

    return { contractId, stage, deploymentBlockers, activationBlockers };
  });

  const stageOf = (id: string) => contracts.find((c) => c.contractId === id)?.stage;
  const deployedAndFunded = (id: string) => stageOf(id) === 'FUNDED_READY' || stageOf(id) === 'FEATURE_ACTIVE';

  const features: FeatureStage[] = [
    {
      feature: 'ROUTER_SAFE_SWAPS',
      active: stageOf('FlowBridgeRouterV4') === 'FEATURE_ACTIVE',
      blockers: stageOf('FlowBridgeRouterV4') === 'FEATURE_ACTIVE' ? [] : ['router not deployed/verified with a live swap canary'],
      blocksDeployment: false,
    },
    {
      feature: 'DIRECT_OFFICIAL_BRIDGE',
      active: false,
      blockers: depState('directBridgeGateway') === 'VERIFIED' ? ['live bridge canary outstanding'] : ['bridge gateway not verified'],
      blocksDeployment: false,
    },
    {
      feature: 'REWARDS_CLAIMS',
      active: deployedAndFunded('FlowRewardsMerkleDistributor') && approval('REWARDS_LAUNCH') === 'OWNER_APPROVED',
      blockers: [
        ...(deployedAndFunded('FlowRewardsMerkleDistributor') ? [] : ['distributor deployed-but-unfunded']),
        ...(approval('REWARDS_LAUNCH') === 'OWNER_APPROVED' ? [] : ['rewards launch funding unapproved']),
      ],
      blocksDeployment: false,
    },
    {
      feature: 'STAKING_GENESIS_AND_FLOORS',
      active: deployedAndFunded('FlowStakingVaultV2') && approval('STAKING_LAUNCH') === 'OWNER_APPROVED',
      blockers: deployedAndFunded('FlowStakingVaultV2')
        ? approval('STAKING_LAUNCH') === 'OWNER_APPROVED'
          ? []
          : ['staking launch funding unapproved']
        : ['reserve funding for genesis/floor obligations not observed'],
      blocksDeployment: false,
    },
    {
      feature: 'STAKING_DYNAMIC',
      active: oracle.dynamicStakingFeatureActive && deployedAndFunded('FlowStakingController'),
      blockers: [...oracle.blockers, ...(deployedAndFunded('FlowStakingController') ? [] : ['controller not funded/verified'])],
      blocksDeployment: false,
    },
    {
      feature: 'ACTIVITY_REGISTRY',
      active: stageOf('FlowBridgeActivityRegistry') === 'FEATURE_ACTIVE',
      blockers: stageOf('FlowBridgeActivityRegistry') === 'FEATURE_ACTIVE' ? [] : ['registry not deployed/verified'],
      blocksDeployment: false,
    },
    {
      feature: 'BRIDGE_ADAPTER_MAINNET_EXECUTION',
      active: false,
      blockers: ['permanently disabled in this release'],
      blocksDeployment: false,
    },
  ];

  const ownerDecisionSheet: OwnerDecisionItem[] = OWNER_DECISION_SHEET.map((item) => ({
    ...item,
    state: approval(item.id),
  }));

  const missingOwnerInputs = ownerDecisionSheet
    .filter((i) => i.state !== 'OWNER_APPROVED')
    .map((i) => `${i.id}: ${i.ask}`);

  // READY means every derivable value is populated and only owner approvals /
  // post-deployment activation conditions remain.
  const derivablePopulated =
    flow.internallyConsistent &&
    dependencies
      .filter((d) => d.usedByCurrentDesign && d.kind !== 'EXPLORER' && d.kind !== 'RESOURCE_ID')
      .every((d) => d.state === 'VERIFIED') &&
    dependencies.every((d) => d.state !== 'REJECTED') &&
    oracle.blocksDeployment === false;

  return {
    chainId: BOT_MAINNET_CHAIN_ID,
    flow,
    dependencies,
    authorities,
    oracle,
    contracts,
    features,
    ownerDecisionSheet,
    activationPlan: ACTIVATION_PLAN,
    missingOwnerInputs,
    verdict: derivablePopulated ? 'READY' : 'BLOCKED',
    publicWrites: {
      mainnetDeployments: 0,
      safeCreations: 0,
      signatures: 0,
      flowTransfers: 0,
      liquidityProvisioning: 0,
      rewardsFundingOrClaims: 0,
      stakingFundingOrActions: 0,
    },
  };
}

/** The honest current state of this gate: nothing owner-approved, no deployments. */
export const CURRENT_DECISION_PACK_INPUT: StagedReadinessInput = {
  sourceReady: [...DEPLOYABLE_CONTRACTS],
  approvals: [],
  authorities: [],
  dependencyObservations: RECORDED_CHAIN_OBSERVATIONS,
  oracle: EMPTY_ORACLE_FEASIBILITY,
  gasBudgetApproved: false,
  deployedVerified: [],
  fundedVerified: [],
};
