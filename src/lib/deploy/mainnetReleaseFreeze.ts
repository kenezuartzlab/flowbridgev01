/**
 * FlowBridge V30.1D.2 — Owner Approval + Mainnet Release Freeze.
 *
 * Pure decision-capture logic. It turns the V30.1D.1 canonical proposals into a
 * single explicit owner approval sheet and freezes the approved public values
 * into a release manifest that the later (separately authorized) deployment
 * gate consumes.
 *
 * Invariants:
 *  - Nothing is pre-approved. A decision without an explicit owner submission
 *    stays NEEDS_APPROVAL and the gate stays BLOCKED.
 *  - Approvals are FlowBridge release records, never blockchain signatures.
 *  - No Safe is created, nothing is deployed, funded, signed or transferred.
 *  - If the frozen production candidate hashes change, every approval that was
 *    recorded against the old digest is invalidated back to NEEDS_APPROVAL.
 *  - Only public values are ever stored or returned. No key material.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { STAKING_V2_CONSTANTS } from '@/lib/staking/stakingV2Matrix';
import { PRODUCTION_CONTRACT_PACKAGE } from '@/lib/deploy/productionContractPackage';
import {
  ACTIVATION_PLAN,
  FLOW_DECIMALS,
  FLOW_GENESIS_ALLOCATION,
  FLOW_GENESIS_SUPPLY,
  COMMUNITY_INTERNAL_RESERVES,
  ONE_TIME_GENESIS_LEGACY_CEILING_FLOW,
  RECOMMENDED_GOVERNANCE_DEFAULTS,
  RECORDED_CHAIN_OBSERVATIONS,
  VESTING_BASELINE,
  YEAR1_COMMUNITY_CEILING_FLOW,
  YEAR1_STAKING_COMPONENT_MAX_FLOW,
  verifyOfficialDependencies,
} from '@/lib/deploy/mainnetDecisionPack';
import { BOT_TESTNET_CHAIN_ID, FLOW_REWARDS_CHAINS } from '@/lib/rewards/flowRewardsRegistry';
import {
  APPROVED_PRODUCTION_SAFES,
  RECORDED_SAFE_OBSERVATIONS,
  verifySafes,
  type SafeAuthorityId,
  type SafeChainObservation,
  type SafeVerificationResult,
} from '@/lib/deploy/safeVerification';

export const RELEASE_DECISION_VERSION = 'V30.1D.4' as const;

/* -------------------------------------------------------------------------- */
/* Deterministic public-value hashing                                          */
/* -------------------------------------------------------------------------- */

/** Stable, key-sorted JSON so the same decision object always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a 64-bit digest — an integrity fingerprint, never a security claim. */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function digestOf(value: unknown): string {
  return fnv1a64(stableStringify(value));
}

/** Digest of the frozen production candidate source/runtime hashes. */
export function currentCandidateDigest(): string {
  return digestOf(
    PRODUCTION_CONTRACT_PACKAGE.filter((p) => p.selection === 'PRODUCTION_CANDIDATE').map((p) => ({
      contractId: p.contractId,
      source: p.identity.sourceSha256,
      artifact: p.identity.artifactSha256,
      runtime: p.identity.runtimeSha256,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Decision sheet definition                                                   */
/* -------------------------------------------------------------------------- */

export type ReleaseDecisionId =
  | 'FLOW_ECONOMICS'
  | 'GOVERNANCE_SAFE_PLAN'
  | 'TREASURY_SAFE_PLAN'
  | 'OPERATIONS_SAFE_PLAN'
  | 'ROOT_PUBLISHER_ASSIGNMENT'
  | 'ACTIVITY_ATTESTER_ASSIGNMENT'
  | 'TIMELOCK_POLICY'
  | 'REWARDS_LAUNCH_PLAN'
  | 'STAKING_LAUNCH_PLAN'
  | 'LIQUIDITY_AND_ORACLE_PLAN'
  | 'GAS_BUDGET_PLAN'
  | 'DEPENDENCY_SNAPSHOT'
  | 'LEGAL_SIGNOFF';

export type DecisionAction = 'APPROVE' | 'REJECT' | 'REPLACE';

export type DecisionStatus = 'NEEDS_APPROVAL' | 'APPROVED' | 'REPLACED' | 'REJECTED' | 'BLOCKED';

export interface ReleaseDecisionDefinition {
  id: ReleaseDecisionId;
  section: string;
  ask: string;
  reason: string;
  impact: string;
  /** Whether the owner may submit a replacement value instead of the proposal. */
  editable: boolean;
  /** Canonical pre-filled proposal. Presented, never applied without approval. */
  proposal: Record<string, unknown>;
}

export const REWARDS_ROOT_DELAY_FLOOR_SECONDS = 3_600;
export const REWARDS_ROOT_DELAY_CEILING_SECONDS = 7 * 86_400;
export const STAKING_EPOCHS_PER_YEAR = 52;
export const ESTIMATED_DEPLOYMENT_GAS_UNITS = 21_500_000;

/**
 * V30.1D.4 §5 — reward-treasury INVENTORY and Year-1 DISTRIBUTION authority are
 * separate. Funded inventory may exceed the annual release ceiling; it is
 * reserve inventory only and cannot raise APR or bypass any cap.
 */
export const APPROVED_STAKING_TREASURY_INVENTORY_FLOW = 10_000_000;
export const APPROVED_MAX_WEEKLY_REWARD_BUDGET_FLOW = 50_000;

export const STAKING_PRODUCT_KEYS = ['flexible', 'lock30', 'lock90', 'lock180', 'lock365'] as const;
export type StakingProductKey = (typeof STAKING_PRODUCT_KEYS)[number];

export const DEPENDENCY_SNAPSHOT = verifyOfficialDependencies(RECORDED_CHAIN_OBSERVATIONS);

/**
 * V30.1D.4 §7/§8 — which staged gate a decision may block.
 *  DEPLOYMENT      — required for DEPLOYMENT_READY.
 *  FEATURE_ONLY    — required only for feature activation (liquidity/oracle).
 *  NON_TECHNICAL   — informational; never blocks any engineering state.
 */
export type DecisionGating = 'DEPLOYMENT' | 'FEATURE_ONLY' | 'NON_TECHNICAL';

export const DECISION_GATING: Record<ReleaseDecisionId, DecisionGating> = {
  FLOW_ECONOMICS: 'DEPLOYMENT',
  GOVERNANCE_SAFE_PLAN: 'DEPLOYMENT',
  TREASURY_SAFE_PLAN: 'DEPLOYMENT',
  OPERATIONS_SAFE_PLAN: 'DEPLOYMENT',
  ROOT_PUBLISHER_ASSIGNMENT: 'DEPLOYMENT',
  ACTIVITY_ATTESTER_ASSIGNMENT: 'DEPLOYMENT',
  TIMELOCK_POLICY: 'DEPLOYMENT',
  REWARDS_LAUNCH_PLAN: 'DEPLOYMENT',
  STAKING_LAUNCH_PLAN: 'DEPLOYMENT',
  LIQUIDITY_AND_ORACLE_PLAN: 'FEATURE_ONLY',
  GAS_BUDGET_PLAN: 'DEPLOYMENT',
  DEPENDENCY_SNAPSHOT: 'DEPLOYMENT',
  LEGAL_SIGNOFF: 'NON_TECHNICAL',
};

export function decisionGating(id: ReleaseDecisionId): DecisionGating {
  return DECISION_GATING[id];
}

export const RELEASE_DECISION_SHEET: readonly ReleaseDecisionDefinition[] = [
  {
    id: 'FLOW_ECONOMICS',
    section: '3. FLOW economics',
    ask: 'Approve or replace the canonical FLOW supply, allocation and vesting baseline.',
    reason: 'Genesis supply is immutable after deployment; there is no post-deployment mint authority.',
    impact: 'Fixes FlowToken constructor arguments and every downstream reserve ceiling.',
    editable: true,
    proposal: {
      supplyFlow: FLOW_GENESIS_SUPPLY,
      decimals: FLOW_DECIMALS,
      standard: 'ERC-20 + ERC-2612 Permit',
      postDeploymentMintAuthority: false,
      allocation: FLOW_GENESIS_ALLOCATION.map((a) => ({ bucket: a.bucket, percent: a.percent, flow: a.flow })),
      communityReserves: COMMUNITY_INTERNAL_RESERVES.map((r) => ({ bucket: r.bucket, flow: r.flow })),
      year1CommunityCeilingFlow: YEAR1_COMMUNITY_CEILING_FLOW,
      year1StakingComponentMaxFlow: YEAR1_STAKING_COMPONENT_MAX_FLOW,
      oneTimeGenesisLegacyCeilingFlow: ONE_TIME_GENESIS_LEGACY_CEILING_FLOW,
      vesting: VESTING_BASELINE,
    },
  },
  {
    id: 'GOVERNANCE_SAFE_PLAN',
    section: '4. Treasury and Safe governance',
    ask: 'Provide the Governance Safe owner set, threshold and intended address.',
    reason: 'Governance holds Router/Rewards/Staking/Registry admin authority behind the timelock.',
    impact: 'No contract can reach DEPLOYMENT_READY without an approved governance authority.',
    editable: true,
    proposal: {
      platform: RECOMMENDED_GOVERNANCE_DEFAULTS.platform,
      minOwners: RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners,
      recommendedThreshold: RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold,
      preferred: `${RECOMMENDED_GOVERNANCE_DEFAULTS.preferredThreshold}-of-${RECOMMENDED_GOVERNANCE_DEFAULTS.preferredOwners}`,
      owners: null,
      threshold: null,
      address: null,
    },
  },
  {
    id: 'TREASURY_SAFE_PLAN',
    section: '4. Treasury and Safe governance',
    ask: 'Provide the Treasury Safe owner set, threshold and intended address.',
    reason: 'Treasury receives the FLOW genesis supply and performs approved funding actions.',
    impact: 'FlowToken cannot be deployed without an approved multisig treasury recipient.',
    editable: true,
    proposal: {
      platform: RECOMMENDED_GOVERNANCE_DEFAULTS.platform,
      minOwners: RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners,
      recommendedThreshold: RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold,
      owners: null,
      threshold: null,
      address: null,
      concentrationApproved: false,
    },
  },
  {
    id: 'OPERATIONS_SAFE_PLAN',
    section: '4. Treasury and Safe governance',
    ask: 'Provide the Operations Safe owner set, threshold and intended address.',
    reason: 'Operations may pause and manage campaigns only; it is never protocol owner or treasury.',
    impact: 'Bounds the fast operational path used for pausing.',
    editable: true,
    proposal: {
      platform: RECOMMENDED_GOVERNANCE_DEFAULTS.platform,
      minOwners: RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners,
      recommendedThreshold: RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold,
      owners: null,
      threshold: null,
      address: null,
      capabilityLimits: ['pause only', 'campaign management only', 'no treasury custody', 'no unrestricted ownership'],
    },
  },
  {
    id: 'ROOT_PUBLISHER_ASSIGNMENT',
    section: '4. Treasury and Safe governance',
    ask: 'Assign the dedicated Rewards/Staking root publisher address.',
    reason: 'Epoch publication must be separable from budget authority and fund recovery.',
    impact: 'Publisher may publish finite epochs only; it must not equal Governance or Treasury.',
    editable: true,
    proposal: { address: null, mustDifferFrom: ['GOVERNANCE_SAFE_PLAN', 'TREASURY_SAFE_PLAN'] },
  },
  {
    id: 'ACTIVITY_ATTESTER_ASSIGNMENT',
    section: '4. Treasury and Safe governance',
    ask: 'Assign the dedicated Activity Registry attester address.',
    reason: 'Append-only attestation must never share identity with the registry admin.',
    impact: 'Attester may append evidence only; never reward or funding authority.',
    editable: true,
    proposal: { address: null, mustDifferFrom: ['GOVERNANCE_SAFE_PLAN', 'TREASURY_SAFE_PLAN', 'OPERATIONS_SAFE_PLAN'] },
  },
  {
    id: 'TIMELOCK_POLICY',
    section: '5. Timelock',
    ask: 'Approve the 24h production timelock delay or enter a replacement with rationale.',
    reason: 'Material protocol changes must be observable before they take effect.',
    impact: 'Applies to Router registry, fee/governance, staking economics and oracle changes.',
    editable: true,
    proposal: {
      delaySeconds: RECOMMENDED_GOVERNANCE_DEFAULTS.timelockDelaySeconds,
      delayedActions: [
        'Router registry changes',
        'fee and governance changes',
        'staking economic configuration',
        'oracle configuration changes',
      ],
      emergencyPause: RECOMMENDED_GOVERNANCE_DEFAULTS.emergency,
      emergencyPauseCanMoveTreasury: false,
      emergencyPauseCanRewriteObligations: false,
      rationale: null,
    },
  },
  {
    id: 'REWARDS_LAUNCH_PLAN',
    section: '6. Rewards launch',
    ask: 'Approve initial Rewards funding, launch campaign budget and Merkle root delay.',
    reason: 'A published epoch reserves its full allocation on-chain, so budget may never exceed funding.',
    impact: 'Rewards stay below FUNDED_READY until real post-deployment funding is observed.',
    editable: true,
    proposal: {
      initialFundingFlow: 0,
      launchCampaignBudgetFlow: 0,
      rootPublishDelaySeconds: 86_400,
      supportedDelayRangeSeconds: [REWARDS_ROOT_DELAY_FLOOR_SECONDS, REWARDS_ROOT_DELAY_CEILING_SECONDS],
      roles: {
        admin: 'GOVERNANCE_SAFE_PLAN',
        campaignManager: 'OPERATIONS_SAFE_PLAN',
        pauser: 'OPERATIONS_SAFE_PLAN',
        rootPublisher: 'ROOT_PUBLISHER_ASSIGNMENT',
      },
    },
  },
  {
    id: 'STAKING_LAUNCH_PLAN',
    section: '7. Staking launch',
    ask: 'Approve the Reward Treasury funding inventory, the Year-1 maximum distribution, the maximum weekly reward budget and the day-one product set.',
    reason:
      'Treasury inventory and annual distribution authority are separate: funded inventory may exceed the Year-1 release ceiling, which stays capped independently.',
    impact:
      'Deployment readiness never implies activation. Dynamic standard bonus stays 0 while the FLOW/USDT TWAP source is PENDING_POOL.',
    editable: true,
    proposal: {
      /** Reward Treasury funding (inventory). Not capped by the Year-1 ceiling. */
      initialTreasuryFundingFlow: 0,
      /** Year-1 maximum distribution — hard capped. */
      year1TotalReleaseCeilingFlow: STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW,
      genesisYear1ReleaseCeilingFlow: STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW,
      standardYear1ReleaseCeilingFlow: STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW,
      /** Maximum weekly reward budget (per 7-day epoch). */
      maxWeeklyRewardBudgetFlow: 0,
      enabledProducts: [] as StakingProductKey[],
      genesisYear1CapFlow: STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW,
      standardYear1CapFlow: STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW,
      totalYear1CapFlow: STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW,
      activateDynamicBonus: false,
      activateGenesisAndFloors: false,
    },
  },
  {
    id: 'LIQUIDITY_AND_ORACLE_PLAN',
    section: '8. Liquidity + oracle activation',
    ask: 'Approve the launch liquidity venue/pair plan and the oracle acceptance thresholds.',
    reason: 'The FLOW/USDT BDEX V3 TWAP candidate cannot exist before FLOW and a real pool exist.',
    impact:
      'Feature-only (V30.1D.4 §7): unapproved thresholds keep dynamic staking inactive but never block deployment readiness. The 100M reserve is a ceiling only.',
    editable: true,
    proposal: {
      venues: ['BDEX V3 (BOT Mainnet 677)'],
      pair: 'FLOW/USDT',
      maxFlowReleasedAtLaunch: null,
      liquidityReserveCeilingFlow: 100_000_000,
      oracleThresholds: {
        observationWindowSeconds: 7 * 86_400,
        maxFreshnessSeconds: 1_800,
        minLiquidityUsd: null,
        maxDeviationBps: 500,
      },
      oracleStatus: 'PENDING_POOL',
    },
  },
  {
    id: 'GAS_BUDGET_PLAN',
    section: '9. BOT deployment gas budget',
    ask: 'Approve the deployment gas-unit plan and the safety-buffer percentage.',
    reason: 'Mainnet gas price changes, so BOT cost is computed at preflight, never hardcoded now.',
    impact: 'BOT required = live gas price x approved gas units x (1 + buffer).',
    editable: true,
    proposal: {
      estimatedGasUnits: ESTIMATED_DEPLOYMENT_GAS_UNITS,
      safetyBufferPercent: 30,
      hardcodedBotAmount: null,
      computeAtPreflight: true,
    },
  },
  {
    id: 'DEPENDENCY_SNAPSHOT',
    section: '10. Dependency snapshot freeze',
    ask: 'Freeze the verified BOT Mainnet 677 dependency snapshot and its bytecode evidence.',
    reason: 'A changed dependency must trigger review, never silent acceptance.',
    impact: 'All dependency bytecode is re-checked immediately before actual deployment.',
    editable: false,
    proposal: {
      chainId: BOT_MAINNET_CHAIN_ID,
      dependencies: DEPENDENCY_SNAPSHOT.map((d) => ({
        id: d.id,
        label: d.label,
        value: d.value,
        kind: d.kind,
        state: d.state,
        detail: d.detail,
      })),
      recheckBeforeDeployment: true,
      mainnetSlots: 'PROMOTION_PENDING',
    },
  },
  {
    id: 'LEGAL_SIGNOFF',
    section: '15. Release record (DEFERRED_NON_TECHNICAL)',
    ask: 'Optionally record an external legal/compliance launch reference.',
    reason: 'Code never self-certifies compliance, and it never determines external legal obligations either.',
    impact:
      'Informational only (V30.1D.4 §8): it does not gate DEPLOYMENT_READY, DEPLOYED_VERIFIED, FUNDED_READY or FEATURE_ACTIVE.',
    editable: true,
    proposal: { signedOff: false, reference: null, classification: 'DEFERRED_NON_TECHNICAL' },
  },
];

export function releaseDecision(id: string): ReleaseDecisionDefinition | null {
  return RELEASE_DECISION_SHEET.find((d) => d.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Owner submissions                                                           */
/* -------------------------------------------------------------------------- */

export interface DecisionSubmission {
  decisionId: string;
  action: DecisionAction;
  /** Required for REPLACE; ignored for APPROVE (the canonical proposal is used). */
  value?: Record<string, unknown> | null;
  approvedByEmail: string;
  approvedAt: string;
  note?: string | null;
  /** Candidate hash digest observed when the owner approved. */
  candidateDigest: string;
}

export interface ResolvedDecision {
  id: ReleaseDecisionId;
  section: string;
  ask: string;
  reason: string;
  impact: string;
  editable: boolean;
  proposal: Record<string, unknown>;
  status: DecisionStatus;
  /** Public approved value; null unless APPROVED or REPLACED. */
  value: Record<string, unknown> | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  note: string | null;
  decisionVersion: string;
  decisionHash: string | null;
  blockers: readonly string[];
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
const isAddr = (v: unknown): v is string => typeof v === 'string' && ADDR.test(v) && v.toLowerCase() !== ZERO;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const TESTNET_ADDRESSES = FLOW_REWARDS_CHAINS.filter((c) => !c.isMainnet).flatMap((c) =>
  [c.token, c.distributor].filter((a): a is `0x${string}` => typeof a === 'string').map((a) => a.toLowerCase()),
);

/** §12 — testnet 968 / legacy 1024 contamination scan over any public value. */
export function contaminationFindings(value: unknown, path = '$'): string[] {
  const out: string[] = [];
  if (typeof value === 'number') {
    if (value === BOT_TESTNET_CHAIN_ID || value === 1024) out.push(`${path}: non-mainnet chain value ${value}`);
  } else if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (TESTNET_ADDRESSES.includes(lower)) out.push(`${path}: BOT Testnet ${BOT_TESTNET_CHAIN_ID} address`);
    if (/\b(968|1024)\b/.test(lower) && /chain|network/.test(path.toLowerCase()))
      out.push(`${path}: non-mainnet network value "${value}"`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...contaminationFindings(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/chainid/i.test(k) && typeof v === 'number' && v !== BOT_MAINNET_CHAIN_ID)
        out.push(`${path}.${k}: chain ${v} is not BOT Mainnet ${BOT_MAINNET_CHAIN_ID}`);
      out.push(...contaminationFindings(v, `${path}.${k}`));
    }
  }
  return out;
}

function safePlanBlockers(value: Record<string, unknown>, label: string): string[] {
  const blockers: string[] = [];
  const owners = Array.isArray(value['owners']) ? (value['owners'] as unknown[]) : null;
  const threshold = num(value['threshold']);
  if (!isAddr(value['address'])) blockers.push(`${label}: a valid non-zero Safe address is required`);
  if (!owners || owners.length < RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners) {
    blockers.push(`${label}: at least ${RECOMMENDED_GOVERNANCE_DEFAULTS.minOwners} distinct owners are required`);
  } else {
    if (!owners.every(isAddr)) blockers.push(`${label}: owner list contains malformed or zero addresses`);
    const uniq = new Set(owners.map((o) => String(o).toLowerCase()));
    if (uniq.size !== owners.length) blockers.push(`${label}: duplicate owner addresses`);
  }
  if (threshold === null || threshold < RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold) {
    blockers.push(`${label}: threshold must be at least ${RECOMMENDED_GOVERNANCE_DEFAULTS.minThreshold}`);
  } else if (owners && threshold > owners.length) {
    blockers.push(`${label}: threshold exceeds the owner count`);
  }
  return blockers;
}

/** Per-decision structural validation of the effective public value. */
export function decisionBlockers(id: ReleaseDecisionId, value: Record<string, unknown>): string[] {
  const blockers: string[] = [];
  switch (id) {
    case 'FLOW_ECONOMICS': {
      const supply = num(value['supplyFlow']);
      const allocation = Array.isArray(value['allocation']) ? (value['allocation'] as Record<string, unknown>[]) : [];
      const reserves = Array.isArray(value['communityReserves'])
        ? (value['communityReserves'] as Record<string, unknown>[])
        : [];
      const sumFlow = allocation.reduce((a, s) => a + (num(s['flow']) ?? 0), 0);
      const sumPct = allocation.reduce((a, s) => a + (num(s['percent']) ?? 0), 0);
      const community = allocation.find((s) => String(s['bucket'] ?? '').startsWith('Community'));
      const reserveSum = reserves.reduce((a, s) => a + (num(s['flow']) ?? 0), 0);
      if (!supply || supply <= 0) blockers.push('FLOW supply must be a positive fixed genesis amount');
      if (num(value['decimals']) !== FLOW_DECIMALS) blockers.push('FLOW must use 18 decimals');
      if (value['postDeploymentMintAuthority'] !== false)
        blockers.push('post-deployment mint authority must be false');
      if (supply !== null && sumFlow !== supply) blockers.push('allocation FLOW total does not reconcile with supply');
      if (sumPct !== 100) blockers.push('allocation percentages do not sum to exactly 100');
      if (community && reserveSum !== (num(community['flow']) ?? -1))
        blockers.push('community internal reserves do not reconcile with the community bucket');
      if ((num(value['year1StakingComponentMaxFlow']) ?? 0) > STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW)
        blockers.push('Year-1 staking component exceeds the staking contract Year-1 cap');
      break;
    }
    case 'GOVERNANCE_SAFE_PLAN':
      blockers.push(...safePlanBlockers(value, 'Governance Safe'));
      break;
    case 'TREASURY_SAFE_PLAN':
      blockers.push(...safePlanBlockers(value, 'Treasury Safe'));
      break;
    case 'OPERATIONS_SAFE_PLAN':
      blockers.push(...safePlanBlockers(value, 'Operations Safe'));
      break;
    case 'ROOT_PUBLISHER_ASSIGNMENT':
      if (!isAddr(value['address'])) blockers.push('Root Publisher requires a valid non-zero address');
      break;
    case 'ACTIVITY_ATTESTER_ASSIGNMENT':
      if (!isAddr(value['address'])) blockers.push('Activity Attester requires a valid non-zero address');
      break;
    case 'TIMELOCK_POLICY': {
      const delay = num(value['delaySeconds']);
      if (delay === null || delay <= 0) blockers.push('timelock delay must be a positive number of seconds');
      if (value['emergencyPauseCanMoveTreasury'] === true)
        blockers.push('emergency path may not move treasury assets');
      if (value['emergencyPauseCanRewriteObligations'] === true)
        blockers.push('emergency path may not rewrite existing user obligations');
      if (delay !== null && delay !== RECOMMENDED_GOVERNANCE_DEFAULTS.timelockDelaySeconds && !value['rationale'])
        blockers.push('a replacement timelock delay requires an explicit rationale');
      break;
    }
    case 'REWARDS_LAUNCH_PLAN': {
      const funding = num(value['initialFundingFlow']);
      const budget = num(value['launchCampaignBudgetFlow']);
      const delay = num(value['rootPublishDelaySeconds']);
      if (funding === null || funding < 0) blockers.push('rewards initial funding must be 0 or a positive amount');
      if (budget === null || budget < 0) blockers.push('rewards campaign budget must be 0 or a positive amount');
      if (funding !== null && budget !== null && budget > funding)
        blockers.push('rewards campaign budget exceeds the approved funded inventory');
      if (funding !== null && funding > YEAR1_COMMUNITY_CEILING_FLOW)
        blockers.push('rewards funding exceeds the Year-1 community ceiling');
      if (
        delay === null ||
        delay < REWARDS_ROOT_DELAY_FLOOR_SECONDS ||
        delay > REWARDS_ROOT_DELAY_CEILING_SECONDS
      )
        blockers.push('Merkle root publish delay is outside the contract-supported range (1h–7d)');
      break;
    }
    case 'STAKING_LAUNCH_PLAN': {
      // V30.1D.4 §5 — inventory is NOT capped by the Year-1 release ceiling.
      const funding = num(value['initialTreasuryFundingFlow']);
      const weekly =
        num(value['maxWeeklyRewardBudgetFlow']) ?? num(value['maxFlowPerEpoch']);
      const year1 =
        num(value['year1TotalReleaseCeilingFlow']) ?? STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW;
      const genesis =
        num(value['genesisYear1ReleaseCeilingFlow']) ?? STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW;
      const standard =
        num(value['standardYear1ReleaseCeilingFlow']) ?? STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW;
      const products = Array.isArray(value['enabledProducts']) ? (value['enabledProducts'] as unknown[]) : [];

      if (funding === null || funding < 0)
        blockers.push('Reward Treasury funding must be 0 or a positive amount');
      if (year1 > STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW)
        blockers.push('Year-1 maximum distribution exceeds the 3,000,000 FLOW Year-1 ceiling');
      if (genesis > STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW)
        blockers.push('Genesis Year-1 release exceeds the 1,000,000 FLOW Genesis ceiling');
      if (standard > STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW)
        blockers.push('Standard Year-1 release exceeds the 2,000,000 FLOW standard ceiling');
      if (genesis + standard > year1)
        blockers.push('Genesis + standard Year-1 releases exceed the approved Year-1 maximum distribution');
      if (weekly === null || weekly < 0)
        blockers.push('maximum weekly reward budget must be 0 or a positive amount');
      if (weekly !== null && weekly > APPROVED_MAX_WEEKLY_REWARD_BUDGET_FLOW)
        blockers.push('maximum weekly reward budget exceeds the approved 50,000 FLOW per 7-day epoch bound');
      if (weekly !== null && weekly * STAKING_EPOCHS_PER_YEAR > year1)
        blockers.push('weekly reward budget annualises above the approved Year-1 maximum distribution');
      if (!products.every((p) => STAKING_PRODUCT_KEYS.includes(p as StakingProductKey)))
        blockers.push('enabled product set contains an unknown staking product');
      if (products.length > 0 && (funding ?? 0) <= 0)
        blockers.push('products cannot be enabled at launch without approved reserve funding');
      if (products.length > 0 && value['productSetApprovedByOwner'] !== true)
        blockers.push('a launch product set requires an explicit owner activation approval');
      break;
    }
    case 'LIQUIDITY_AND_ORACLE_PLAN': {
      const venues = Array.isArray(value['venues']) ? (value['venues'] as unknown[]) : [];
      const t = (value['oracleThresholds'] ?? {}) as Record<string, unknown>;
      const released = num(value['maxFlowReleasedAtLaunch']);
      if (venues.length === 0) blockers.push('at least one launch liquidity venue must be recorded');
      if (released === null || released < 0) blockers.push('maximum FLOW released at launch must be recorded');
      if (released !== null && released > (num(value['liquidityReserveCeilingFlow']) ?? 0))
        blockers.push('planned liquidity release exceeds the approved liquidity reserve ceiling');
      if ((num(t['observationWindowSeconds']) ?? 0) <= 0) blockers.push('oracle observation window unapproved');
      if ((num(t['maxFreshnessSeconds']) ?? 0) <= 0) blockers.push('oracle freshness threshold unapproved');
      if ((num(t['minLiquidityUsd']) ?? 0) <= 0) blockers.push('oracle minimum liquidity unapproved');
      if ((num(t['maxDeviationBps']) ?? 0) <= 0) blockers.push('oracle maximum deviation unapproved');
      break;
    }
    case 'GAS_BUDGET_PLAN': {
      const units = num(value['estimatedGasUnits']);
      const buffer = num(value['safetyBufferPercent']);
      if (units === null || units <= 0) blockers.push('deployment gas-unit plan must be a positive estimate');
      if (buffer === null || buffer <= 0) blockers.push('a positive safety-buffer percentage must be approved');
      if (value['hardcodedBotAmount'] != null) blockers.push('a fixed BOT amount may not be frozen at this gate');
      break;
    }
    case 'DEPENDENCY_SNAPSHOT': {
      const deps = Array.isArray(value['dependencies']) ? (value['dependencies'] as Record<string, unknown>[]) : [];
      if (num(value['chainId']) !== BOT_MAINNET_CHAIN_ID) blockers.push('dependency snapshot must pin chain 677');
      if (deps.some((d) => d['state'] === 'REJECTED')) blockers.push('a snapshotted dependency is REJECTED');
      const needsCode = deps.filter((d) => d['kind'] === 'CONTRACT');
      if (needsCode.length === 0 || !needsCode.every((d) => d['state'] === 'VERIFIED'))
        blockers.push('all contract dependencies must carry VERIFIED bytecode evidence');
      if (deps.some((d) => d['kind'] === 'RESOURCE_ID' && num(d['value']) !== null))
        blockers.push('a resource id must stay a typed resource id, never a numeric chain id');
      break;
    }
    case 'LEGAL_SIGNOFF':
      // V30.1D.4 §8 — DEFERRED_NON_TECHNICAL. No engineering blocker is raised
      // here: the software never determines external legal obligations and a
      // sign-off reference is never fabricated to make a gate green.
      break;
  }
  blockers.push(...contaminationFindings(value, id));
  return blockers;
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReleaseFreezeInput {
  submissions: readonly DecisionSubmission[];
  /** Digest of the frozen production candidates observed right now. */
  candidateDigest: string;
  /** Oracle status observed for the FLOW/USDT TWAP candidate. */
  oracleStatus: 'PENDING_POOL' | 'WARMING_UP' | 'READY';
  /** V30.1D.4 §3 — recorded READ-ONLY Safe observations on BOT Mainnet 677. */
  safeObservations?: readonly SafeChainObservation[];
}

export interface ReleaseManifest {
  schema: 'flowbridge.mainnet-release-decisions';
  decisionVersion: string;
  chainId: number;
  candidateDigest: string;
  contractCandidates: readonly { contractId: string; sourceSha256: string | null; runtimeSha256: string | null }[];
  decisions: readonly {
    id: ReleaseDecisionId;
    status: DecisionStatus;
    gating: DecisionGating;
    value: Record<string, unknown> | null;
    approvedByEmail: string | null;
    approvedAt: string | null;
    decisionHash: string | null;
  }[];
  /** Read-only live Safe evidence (public values only). */
  safeAuthorities: readonly {
    authority: SafeAuthorityId;
    address: string;
    state: 'VERIFIED' | 'BLOCKED';
    liveThreshold: number | null;
    liveOwners: readonly string[];
    codeHash: string | null;
  }[];
  dependencySnapshot: Record<string, unknown>;
  activationPlan: typeof ACTIVATION_PLAN;
  publicWrites: PublicWriteLedger;
}

export interface PublicWriteLedger {
  safeCreations: 0;
  mainnetDeployments: 0;
  testnetDeployments: 0;
  walletSignatures: 0;
  blockchainTransactions: 0;
  flowTransfers: 0;
  liquidityActions: 0;
  rewardsClaims: 0;
  stakingActions: 0;
}

export const ZERO_PUBLIC_WRITES: PublicWriteLedger = {
  safeCreations: 0,
  mainnetDeployments: 0,
  testnetDeployments: 0,
  walletSignatures: 0,
  blockchainTransactions: 0,
  flowTransfers: 0,
  liquidityActions: 0,
  rewardsClaims: 0,
  stakingActions: 0,
};

export type StagedReadinessState =
  | 'SOURCE_READY'
  | 'DEPLOYMENT_READY'
  | 'DEPLOYED_VERIFIED'
  | 'FUNDED_READY'
  | 'FEATURE_ACTIVE';

export interface StagedFeatureReadiness {
  feature: string;
  state: 'INACTIVE' | 'PENDING_FUNDING' | 'PENDING_ORACLE' | 'PENDING_OWNER_ACTIVATION';
  detail: string;
}

export interface ReleaseFreezeEvaluation {
  decisionVersion: string;
  chainId: number;
  candidateDigest: string;
  decisions: readonly ResolvedDecision[];
  failClosedFindings: readonly string[];
  outstanding: readonly string[];
  /** Feature-activation-only outstanding items; never deployment blockers. */
  featureOutstanding: readonly string[];
  /** Informational, non-technical items (legal/compliance). */
  deferredNonTechnical: readonly string[];
  safeVerification: readonly SafeVerificationResult[];
  stagedReadiness: StagedReadinessState;
  featureReadiness: readonly StagedFeatureReadiness[];
  verdict: 'PASS' | 'BLOCKED';
  manifest: ReleaseManifest;
  manifestHash: string;
  publicWrites: PublicWriteLedger;
}

function resolveOne(
  def: ReleaseDecisionDefinition,
  submission: DecisionSubmission | undefined,
  candidateDigest: string,
): ResolvedDecision {
  const base = {
    id: def.id,
    section: def.section,
    ask: def.ask,
    reason: def.reason,
    impact: def.impact,
    editable: def.editable,
    proposal: def.proposal,
    decisionVersion: RELEASE_DECISION_VERSION,
  };
  if (!submission) {
    return {
      ...base,
      status: 'NEEDS_APPROVAL',
      value: null,
      approvedByEmail: null,
      approvedAt: null,
      note: null,
      decisionHash: null,
      blockers: ['no explicit owner decision recorded'],
    };
  }
  if (submission.candidateDigest !== candidateDigest) {
    return {
      ...base,
      status: 'NEEDS_APPROVAL',
      value: null,
      approvedByEmail: null,
      approvedAt: null,
      note: submission.note ?? null,
      decisionHash: null,
      blockers: ['production candidate hashes changed since approval — decision invalidated'],
    };
  }
  if (!submission.approvedByEmail || !submission.approvedAt) {
    return {
      ...base,
      status: 'NEEDS_APPROVAL',
      value: null,
      approvedByEmail: null,
      approvedAt: null,
      note: submission.note ?? null,
      decisionHash: null,
      blockers: ['decision record lacks an approving admin identity and timestamp'],
    };
  }
  if (submission.action === 'REJECT') {
    return {
      ...base,
      status: 'REJECTED',
      value: null,
      approvedByEmail: submission.approvedByEmail,
      approvedAt: submission.approvedAt,
      note: submission.note ?? null,
      decisionHash: null,
      blockers: ['owner rejected this decision; a replacement value is required'],
    };
  }
  if (submission.action === 'REPLACE' && !def.editable) {
    return {
      ...base,
      status: 'BLOCKED',
      value: null,
      approvedByEmail: submission.approvedByEmail,
      approvedAt: submission.approvedAt,
      note: submission.note ?? null,
      decisionHash: null,
      blockers: ['this decision is not owner-editable; it may only be approved as evidenced'],
    };
  }

  const value =
    submission.action === 'REPLACE'
      ? { ...def.proposal, ...(submission.value ?? {}) }
      : { ...def.proposal, ...(submission.value ?? {}) };
  const blockers = decisionBlockers(def.id, value);
  const status: DecisionStatus =
    blockers.length > 0 ? 'BLOCKED' : submission.action === 'REPLACE' ? 'REPLACED' : 'APPROVED';

  return {
    ...base,
    status,
    value: blockers.length > 0 ? null : value,
    approvedByEmail: submission.approvedByEmail,
    approvedAt: submission.approvedAt,
    note: submission.note ?? null,
    decisionHash:
      blockers.length > 0
        ? null
        : digestOf({ id: def.id, version: RELEASE_DECISION_VERSION, candidateDigest, value }),
    blockers,
  };
}

export function evaluateReleaseFreeze(input: ReleaseFreezeInput): ReleaseFreezeEvaluation {
  // Latest submission per decision wins; history stays append-only upstream.
  const latest = new Map<string, DecisionSubmission>();
  for (const s of input.submissions) {
    const prev = latest.get(s.decisionId);
    if (!prev || String(s.approvedAt) >= String(prev.approvedAt)) latest.set(s.decisionId, s);
  }

  const decisions = RELEASE_DECISION_SHEET.map((def) =>
    resolveOne(def, latest.get(def.id), input.candidateDigest),
  );
  const byId = (id: ReleaseDecisionId) => decisions.find((d) => d.id === id)!;
  const valueOf = (id: ReleaseDecisionId) => byId(id).value;
  const addrOf = (id: ReleaseDecisionId) => {
    const v = valueOf(id);
    const a = v?.['address'];
    return isAddr(a) ? a.toLowerCase() : null;
  };

  const findings: string[] = [];

  // §12 — cross-decision separation and reconciliation rules.
  const gov = valueOf('GOVERNANCE_SAFE_PLAN');
  const tre = valueOf('TREASURY_SAFE_PLAN');
  const ops = valueOf('OPERATIONS_SAFE_PLAN');
  const publisher = addrOf('ROOT_PUBLISHER_ASSIGNMENT');
  const attester = addrOf('ACTIVITY_ATTESTER_ASSIGNMENT');
  const govAddr = addrOf('GOVERNANCE_SAFE_PLAN');
  const treAddr = addrOf('TREASURY_SAFE_PLAN');
  const opsAddr = addrOf('OPERATIONS_SAFE_PLAN');

  if (publisher && (publisher === govAddr || publisher === treAddr))
    findings.push('Root Publisher equals a Governance/Treasury authority where separation is required');
  if (attester && (attester === govAddr || attester === treAddr || attester === opsAddr))
    findings.push('Activity Attester equals the Activity Registry admin/governance authority');
  if (attester && publisher && attester === publisher)
    findings.push('Activity Attester and Root Publisher must be distinct authorities');
  if (govAddr && treAddr && govAddr === treAddr)
    findings.push('Governance and Treasury Safes must not be the same address');
  if (govAddr && opsAddr && govAddr === opsAddr)
    findings.push('Operations authority must not equal the Governance Safe');

  if (gov && tre) {
    const govOwners = (gov['owners'] as string[] | null) ?? [];
    const treOwners = (tre['owners'] as string[] | null) ?? [];
    const identical =
      govOwners.length > 0 &&
      govOwners.length === treOwners.length &&
      govOwners.every((o) => treOwners.some((t) => t.toLowerCase() === o.toLowerCase()));
    if (identical && tre['concentrationApproved'] !== true)
      findings.push('Treasury Safe duplicates Governance membership without an explicit concentration approval');
    else if (identical)
      findings.push(
        'FLAGGED (owner-approved): Treasury and Governance Safes share an identical owner set — concentration accepted',
      );
  }

  // FLOW treasury must be an approved multisig plan.
  if (byId('FLOW_ECONOMICS').status === 'APPROVED' || byId('FLOW_ECONOMICS').status === 'REPLACED') {
    if (!tre) findings.push('FLOW genesis treasury recipient is not an approved multisig plan');
  }

  // Rewards budget vs planned funding (cross-checked against Year-1 community ceiling).
  const rewards = valueOf('REWARDS_LAUNCH_PLAN');
  const flow = valueOf('FLOW_ECONOMICS');
  if (rewards && flow) {
    const ceiling = (flow['year1CommunityCeilingFlow'] as number) ?? YEAR1_COMMUNITY_CEILING_FLOW;
    if (((rewards['launchCampaignBudgetFlow'] as number) ?? 0) > ceiling)
      findings.push('rewards launch budget exceeds the approved Year-1 community ceiling');
  }

  // V30.1D.4 §5 — compare the Year-1 RELEASE authority, never funded inventory.
  const staking = valueOf('STAKING_LAUNCH_PLAN');
  if (staking && flow) {
    const component = (flow['year1StakingComponentMaxFlow'] as number) ?? YEAR1_STAKING_COMPONENT_MAX_FLOW;
    const year1Release =
      (staking['year1TotalReleaseCeilingFlow'] as number) ?? STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW;
    if (year1Release > component)
      findings.push('Year-1 staking release exceeds the approved Year-1 staking component ceiling');
  }

  // Dynamic staking may never be requested while the TWAP source is not READY.
  if (staking?.['activateDynamicBonus'] === true) {
    if (input.oracleStatus !== 'READY')
      findings.push(`dynamic staking requested while the FLOW/USDT TWAP source is ${input.oracleStatus}`);
    const liq = valueOf('LIQUIDITY_AND_ORACLE_PLAN');
    if (!liq) findings.push('dynamic staking requested while oracle acceptance thresholds are unapproved');
  }

  // Candidate hash freeze.
  if (input.candidateDigest !== currentCandidateDigest())
    findings.push('production source/artifact hashes differ from the frozen candidates');

  // §3 — read-only live Safe verification against recorded chain evidence.
  // Runs only when observations are supplied; a mismatch blocks ONLY that
  // authority (and, through it, DEPLOYMENT_READY).
  const observations = input.safeObservations ?? [];
  const safeVerification: readonly SafeVerificationResult[] =
    observations.length > 0 ? verifySafes(observations) : [];
  const safeDecisionOf: Record<SafeAuthorityId, ReleaseDecisionId> = {
    GOVERNANCE: 'GOVERNANCE_SAFE_PLAN',
    TREASURY: 'TREASURY_SAFE_PLAN',
    OPERATIONS: 'OPERATIONS_SAFE_PLAN',
  };
  for (const result of safeVerification) {
    const decision = byId(safeDecisionOf[result.authority]);
    const approvedAddr = ((decision.value?.['address'] as string | undefined) ?? '').toLowerCase();
    if (approvedAddr && approvedAddr !== result.address.toLowerCase()) {
      findings.push(
        `${result.label}: approved decision address ${approvedAddr} differs from the frozen production Safe`,
      );
    }
    if (result.state === 'BLOCKED') {
      findings.push(`${result.label}: live verification BLOCKED — ${result.mismatches[0]}`);
    }
  }

  const gatingOf = (id: ReleaseDecisionId) => decisionGating(id);
  const unresolved = decisions.filter((d) => d.status !== 'APPROVED' && d.status !== 'REPLACED');
  const outstanding = unresolved
    .filter((d) => gatingOf(d.id) === 'DEPLOYMENT')
    .map((d) => `${d.id}: ${d.status} — ${d.blockers[0] ?? 'owner decision required'}`);
  const featureOutstanding = unresolved
    .filter((d) => gatingOf(d.id) === 'FEATURE_ONLY')
    .map((d) => `${d.id}: ${d.status} — feature activation only (no deployment impact)`);
  const deferredNonTechnical = decisions
    .filter((d) => gatingOf(d.id) === 'NON_TECHNICAL')
    .map((d) => `${d.id}: DEFERRED_NON_TECHNICAL — informational, never a technical gate`);

  const hardFindings = findings.filter((f) => !f.startsWith('FLAGGED'));
  const verdict: 'PASS' | 'BLOCKED' =
    outstanding.length === 0 && hardFindings.length === 0 ? 'PASS' : 'BLOCKED';

  const stagedReadiness: StagedReadinessState = verdict === 'PASS' ? 'DEPLOYMENT_READY' : 'SOURCE_READY';

  const enabledProducts = Array.isArray(staking?.['enabledProducts'])
    ? (staking!['enabledProducts'] as unknown[])
    : [];
  const featureReadiness: readonly StagedFeatureReadiness[] = [
    {
      feature: 'Rewards claims',
      state: 'PENDING_FUNDING',
      detail: 'Requires observed on-chain Distributor funding after deployment.',
    },
    {
      feature: 'Staking products',
      state: enabledProducts.length === 0 ? 'PENDING_OWNER_ACTIVATION' : 'PENDING_FUNDING',
      detail:
        enabledProducts.length === 0
          ? 'No launch product set approved — enablement stays None; deployment readiness is unaffected.'
          : 'Approved product set requires observed reserve funding before activation.',
    },
    {
      feature: 'Genesis and floor bonuses',
      state: 'PENDING_OWNER_ACTIVATION',
      detail: 'Requires funded-capacity plus explicit owner activation; never inferred from treasury inventory.',
    },
    {
      feature: 'Dynamic standard staking bonus',
      state: 'PENDING_ORACLE',
      detail: `FLOW/USDT TWAP source is ${input.oracleStatus}; production price reference required.`,
    },
    {
      feature: 'BridgeAdapter mainnet execution',
      state: 'PENDING_OWNER_ACTIVATION',
      detail: 'Stays disabled until a separately authorized activation gate.',
    },
  ];

  const manifest: ReleaseManifest = {
    schema: 'flowbridge.mainnet-release-decisions',
    decisionVersion: RELEASE_DECISION_VERSION,
    chainId: BOT_MAINNET_CHAIN_ID,
    candidateDigest: input.candidateDigest,
    contractCandidates: PRODUCTION_CONTRACT_PACKAGE.filter((p) => p.selection === 'PRODUCTION_CANDIDATE').map(
      (p) => ({
        contractId: p.contractId,
        sourceSha256: p.identity.sourceSha256,
        runtimeSha256: p.identity.runtimeSha256,
      }),
    ),
    decisions: decisions.map((d) => ({
      id: d.id,
      status: d.status,
      gating: decisionGating(d.id),
      value: d.value,
      approvedByEmail: d.approvedByEmail,
      approvedAt: d.approvedAt,
      decisionHash: d.decisionHash,
    })),
    safeAuthorities: safeVerification.map((s) => ({
      authority: s.authority,
      address: s.address,
      state: s.state,
      liveThreshold: s.liveThreshold,
      liveOwners: s.liveOwners,
      codeHash: s.codeHash,
    })),
    dependencySnapshot: releaseDecision('DEPENDENCY_SNAPSHOT')!.proposal,
    activationPlan: ACTIVATION_PLAN,
    publicWrites: ZERO_PUBLIC_WRITES,
  };

  return {
    decisionVersion: RELEASE_DECISION_VERSION,
    chainId: BOT_MAINNET_CHAIN_ID,
    candidateDigest: input.candidateDigest,
    decisions,
    failClosedFindings: findings,
    outstanding,
    featureOutstanding,
    deferredNonTechnical,
    safeVerification,
    stagedReadiness,
    featureReadiness,
    verdict,
    manifest,
    manifestHash: digestOf(manifest),
    publicWrites: ZERO_PUBLIC_WRITES,
  };
}

/**
 * Baseline input: submissions still come from the append-only decision store,
 * while the recorded read-only Safe observations are frozen evidence.
 */
export const CURRENT_RELEASE_FREEZE_INPUT: ReleaseFreezeInput = {
  submissions: [],
  candidateDigest: currentCandidateDigest(),
  oracleStatus: 'PENDING_POOL',
  safeObservations: RECORDED_SAFE_OBSERVATIONS,
};

/**
 * The frozen production Safe values in decision-record shape, so an owner
 * submission and the live verification always describe the same configuration.
 */
export const APPROVED_SAFE_DECISION_VALUES: Record<
  'GOVERNANCE_SAFE_PLAN' | 'TREASURY_SAFE_PLAN' | 'OPERATIONS_SAFE_PLAN',
  Record<string, unknown>
> = {
  GOVERNANCE_SAFE_PLAN: safeDecisionValue('GOVERNANCE'),
  TREASURY_SAFE_PLAN: safeDecisionValue('TREASURY'),
  OPERATIONS_SAFE_PLAN: safeDecisionValue('OPERATIONS'),
};

function safeDecisionValue(authority: SafeAuthorityId): Record<string, unknown> {
  const safe = APPROVED_PRODUCTION_SAFES.find((s) => s.authority === authority)!;
  return {
    address: safe.address,
    owners: [...safe.owners],
    threshold: safe.threshold,
    capabilities: [...safe.capabilities],
  };
}

