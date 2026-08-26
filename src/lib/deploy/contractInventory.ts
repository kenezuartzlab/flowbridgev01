/**
 * FlowBridge V30.1A — smart-contract production inventory + environment-aware
 * mainnet contract registry.
 *
 * This module is descriptive and fail-closed. It never deploys, never signs and
 * never invents an address. BOT Mainnet 677 entries stay NOT_DEPLOYED /
 * PROMOTION_PENDING until independently verified mainnet evidence exists, and
 * testnet addresses are never promoted into the mainnet record.
 */
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  type NetworkEnvironment,
} from '@/lib/network/canonicalNetworks';

export type Hex = `0x${string}`;

export type ReadinessClass =
  | 'READY_FOR_MAINNET'
  | 'HARDENING_REQUIRED'
  | 'TESTNET_ONLY'
  | 'DEPRECATED'
  | 'BLOCKED';

export type DeploymentState = 'DEPLOYED_VERIFIED' | 'NOT_DEPLOYED' | 'PROMOTION_PENDING';

export interface CompilerProfile {
  version: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  evmVersion: string;
}

export interface ContractInventoryEntry {
  /** Stable contract identity used by the registry and release manifest. */
  id: string;
  name: string;
  /** Repository source path, or null when the source is not present here. */
  sourcePath: string | null;
  artifactPath: string | null;
  readiness: ReadinessClass;
  compiler: CompilerProfile | null;
  privilegedRoles: readonly string[];
  constructorRequirements: readonly string[];
  /** Why the contract is not READY_FOR_MAINNET, in plain language. */
  blockers: readonly string[];
}

const SOLC_0_8_24_PARIS: CompilerProfile = {
  version: '0.8.24',
  optimizer: { enabled: true, runs: 200 },
  viaIR: false,
  evmVersion: 'paris',
};

/** Reviewed Router V4 build line, preserved verbatim per V30.1A §4. */
export const ROUTER_V4_BUILD_LINE: CompilerProfile = {
  version: '0.8.20',
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'shanghai',
};

/**
 * Archived build line for the V30.1A.2 missing-contract package (Lens, Activity
 * Registry, BridgeAdapter). Optimizer runs is 1 — deliberately different from
 * Router V4; changing it would produce new bytecode and break parity.
 */
export const MISSING_CONTRACT_LINE: CompilerProfile = {
  version: '0.8.20',
  optimizer: { enabled: true, runs: 1 },
  viaIR: true,
  evmVersion: 'shanghai',
};

/**
 * V30.1C Staking v2 build line, frozen by contracts/production/staking-v2/BUILD_EVIDENCE.json.
 * Changing any field would produce new bytecode and break parity with the audited hashes.
 */
export const STAKING_V2_BUILD_LINE: CompilerProfile = {
  version: '0.8.24',
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'cancun',
};

export const CONTRACT_INVENTORY: readonly ContractInventoryEntry[] = [
  {
    id: 'FlowToken',
    name: 'FlowToken',
    sourcePath: 'contracts/FlowToken.sol',
    artifactPath: 'contracts/artifacts/FlowToken.json',
    readiness: 'BLOCKED',
    compiler: SOLC_0_8_24_PARIS,
    privilegedRoles: ['none post-deploy (fixed supply, single constructor mint)'],
    constructorRequirements: ['name', 'symbol', 'totalSupply', 'treasury'],
    blockers: [
      'Mainnet supply, treasury recipient, allocation policy and treasury governance are not formally frozen.',
    ],
  },
  {
    id: 'FlowRewardsMerkleDistributor',
    name: 'FlowRewardsMerkleDistributor (canonical mainnet rewards authority, V30.1B.2)',
    sourcePath: 'contracts/production/rewards-distributor/FlowRewardsMerkleDistributor.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: SOLC_0_8_24_PARIS,
    privilegedRoles: [
      'DEFAULT_ADMIN_ROLE (approved multisig/timelock required)',
      'BUDGET_MANAGER_ROLE (campaign budget, cancel/release)',
      'PUBLISHER_ROLE (server secret; epoch roots only)',
      'PAUSER_ROLE',
    ],
    constructorRequirements: ['token', 'admin', 'budgetManager', 'publisher', 'pauser', 'recoveryRecipient', 'minPublishDelay'],
    blockers: [
      'Solvency is enforced on chain: publishEpoch reserves the full allocation and reverts unless balance >= totalReserved + allocation and totalClaimed + totalReserved + allocation <= campaignBudget; recovery is bounded by freeBalance. No mint path exists.',
      'Approved production multisig/timelock for admin and budget manager is not assigned (V30.1B-G1).',
      'Approved campaign budget, epoch cadence and allocation economics are not signed off (V30.1B.2-E1).',
      'Publisher key custody and the epoch manifest/proof publication pipeline are not provisioned (V30.1B.2-P1 / M1).',
    ],
  },
  {
    id: 'FlowRewardsDistributor',
    name: 'FlowRewardsDistributor (historical cumulative EIP-712 — BOT Testnet only)',
    sourcePath: 'contracts/FlowRewardsDistributor.sol',
    artifactPath: 'contracts/artifacts/FlowRewardsDistributor.json',
    readiness: 'TESTNET_ONLY',
    compiler: SOLC_0_8_24_PARIS,
    privilegedRoles: ['owner (Ownable2Step)', 'rewardSigner', 'pauser (owner)'],
    constructorRequirements: ['token', 'owner', 'rewardSigner'],
    blockers: [
      'Superseded for mainnet by FlowRewardsMerkleDistributor (V30.1B.2): signed cumulative authorizations were never reserved against the distributor balance, so owner funding withdrawal could make authorized claims insolvent.',
      'Never promote to BOT Mainnet 677; signed-claim issuance is refused off BOT Testnet 968.',
    ],
  },

  {
    id: 'FlowStakingVault',
    name: 'FlowStakingVault (existing single-schedule vault)',
    sourcePath: 'contracts/FlowStakingVault.sol',
    artifactPath: 'contracts/artifacts/FlowStakingVault.json',
    readiness: 'TESTNET_ONLY',
    compiler: SOLC_0_8_24_PARIS,
    privilegedRoles: ['owner (schedule funding / controller)'],
    constructorRequirements: ['token', 'owner'],
    blockers: [
      'No fixed-duration 30D/90D/180D/365D position support in source; unearned scheduled reward inventory after epoch expiry is not reconcilable (Staking v2 required — V30.1C).',
      'V30.1C disposition: HISTORICAL / BOT Testnet 968 only. Stranded-emission limitation is permanent by design; never reclassify as production-ready and never count its reward inventory as v2 mainnet funding.',
    ],
  },
  {
    id: 'FlowStakingVaultV2',
    name: 'FlowStakingVaultV2 (Staking v2 principal custody, PRODUCTION_CANDIDATE v30.1c)',
    sourcePath: 'contracts/production/staking-v2/FlowStakingVaultV2.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: STAKING_V2_BUILD_LINE,
    privilegedRoles: ['DEFAULT_ADMIN_ROLE (unpause)', 'PAUSER_ROLE'],
    constructorRequirements: ['token', 'controller', 'rewardTreasury', 'admin'],
    blockers: [
      'Production FLOW token address on BOT Mainnet 677 does not exist (FlowToken is BLOCKED), so constructor token cannot be frozen.',
      'Approved multisig/timelock for admin/pauser is not assigned.',
      'Runtime 10,366 bytes (EIP-170 headroom 14,210); hashes frozen in staking-v2/BUILD_EVIDENCE.json. 27/27 Foundry tests + 2x256 fuzz runs pass; Slither 0.11.3 triaged, no High, Mediums fixed or justified.',
    ],
  },
  {
    id: 'FlowStakingController',
    name: 'FlowStakingController (Staking v2 bounded economic authority, PRODUCTION_CANDIDATE v30.1c)',
    sourcePath: 'contracts/production/staking-v2/FlowStakingController.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: STAKING_V2_BUILD_LINE,
    privilegedRoles: ['DEFAULT_ADMIN_ROLE', 'GOVERNOR_ROLE (products, budgets, oracle, emergency mode)', 'PUBLISHER_ROLE (weekly epochs)'],
    constructorRequirements: ['admin', 'governor', 'publisher'],
    blockers: [
      'No production FLOW/USD TWAP/reference oracle exists on BOT Mainnet 677; the dynamic-rate path is fail-closed by construction until one is configured and healthy.',
      'Governor/publisher key custody not assigned to approved multisig/timelock; weekly USD budget and maxFlowPerEpoch economics not signed off.',
    ],
  },
  {
    id: 'FlowStakingRewardTreasury',
    name: 'FlowStakingRewardTreasury (Staking v2 segregated reward reserve, PRODUCTION_CANDIDATE v30.1c)',
    sourcePath: 'contracts/production/staking-v2/FlowStakingRewardTreasury.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: STAKING_V2_BUILD_LINE,
    privilegedRoles: ['DEFAULT_ADMIN_ROLE (bounded free-balance recovery)', 'VAULT_ROLE (vault only)', 'CONTROLLER_ROLE (vault only)'],
    constructorRequirements: ['token', 'admin', 'recoveryRecipient'],
    blockers: [
      'Year-1 reward funding (3M FLOW ceiling: 1M Genesis + 2M standard) is not provisioned; the reserve must be fully pre-funded before any position opens.',
      'Recovery recipient must be an approved multisig/timelock; not assigned.',
    ],
  },
  {
    id: 'FlowBridgeRouterV4',
    name: 'FlowBridgeRouterV4',
    sourcePath: 'contracts/production/router-v4/FlowBridgeRouterV4.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: ROUTER_V4_BUILD_LINE,
    privilegedRoles: ['owner', 'fee configurator', 'integration registry admin', 'pauser'],
    constructorRequirements: ['unavailable — deployment constructor parameters not frozen'],
    blockers: [
      'Mainnet governance hardening is outstanding (approved multisig/timelock owner, registry activation-delay value, fee treasury, final BDEX production configuration) — V30.1D.',
      'V30.1B.1 closed the EIP-170 blocker: creation 20,020 bytes and deployed/runtime 19,720 bytes were reproduced in the isolated pinned workspace.',
      'Bridge proxy execution is removed from the mainnet candidate; bridging stays the direct official BOT Bridge architecture.',
    ],
  },

  {
    id: 'FlowBridgeRouterLens',
    name: 'FlowBridgeRouterLens',
    sourcePath: 'contracts/production/router-lens/FlowBridgeRouterLens.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: MISSING_CONTRACT_LINE,
    privilegedRoles: ['none (read-only lens)'],
    constructorRequirements: ['flowRouter (canonical FlowBridgeRouterV4 address)'],
    blockers: [
      'Constructor flowRouter can only be frozen once a verified mainnet Router V4 address exists; the mainnet registry slot is still empty.',
    ],
  },
  {
    id: 'FlowBridgeActivityRegistry',
    name: 'FlowBridgeActivityRegistry',
    sourcePath: 'contracts/production/activity-registry/FlowBridgeActivityRegistry.sol',
    artifactPath: null,
    readiness: 'HARDENING_REQUIRED',
    compiler: MISSING_CONTRACT_LINE,
    privilegedRoles: ['admin', 'attester', 'pauser'],
    constructorRequirements: ['admin', 'attester', 'pauser'],
    blockers: [
      'Production admin/attester/pauser holders are not yet assigned to an approved multisig/timelock, so no mainnet promotion is authorised.',
    ],
  },
  {
    id: 'FlowBridgeBridgeAdapterV1',
    name: 'FlowBridgeBridgeAdapterV1',
    sourcePath: 'contracts/production/bridge-adapter-v1/FlowBridgeBridgeAdapterV1.sol',
    artifactPath: null,
    readiness: 'BLOCKED',
    compiler: MISSING_CONTRACT_LINE,
    privilegedRoles: ['owner', 'pauser', 'guardian'],
    constructorRequirements: ['routeToken', 'officialGateway', 'owner', 'guardian'],
    blockers: [
      'Mainnet execution remains disabled: the refund/recovery governance blocker is unresolved even though source and build parity are now proven.',
    ],
  },
] as const;

export function inventoryEntry(id: string): ContractInventoryEntry | null {
  return CONTRACT_INVENTORY.find((c) => c.id === id) ?? null;
}

export function mainnetReadyContractIds(): string[] {
  return CONTRACT_INVENTORY.filter((c) => c.readiness === 'READY_FOR_MAINNET').map((c) => c.id);
}

/* -------------------------------------------------------------------------- */
/* Environment-aware contract registry                                        */
/* -------------------------------------------------------------------------- */

export interface RegistryRecord {
  contractId: string;
  version: string;
  chainId: number;
  address: Hex | null;
  deployTxHash: string | null;
  block: number | null;
  sourceHash: string | null;
  artifactHash: string | null;
  runtimeHash: string | null;
  compiler: CompilerProfile | null;
  ownerOrAdmin: string | null;
  state: DeploymentState;
  verified: boolean;
}

const notDeployedMainnet = (contractId: string): RegistryRecord => ({
  contractId,
  version: 'v30.1a',
  chainId: BOT_MAINNET_CHAIN_ID,
  address: null,
  deployTxHash: null,
  block: null,
  sourceHash: null,
  artifactHash: null,
  runtimeHash: null,
  compiler: inventoryEntry(contractId)?.compiler ?? null,
  ownerOrAdmin: null,
  state: 'PROMOTION_PENDING',
  verified: false,
});

/**
 * BOT Testnet records that are independently evidenced by source-controlled
 * deployment files under contracts/deployments/.
 */
const TESTNET_RECORDS: readonly RegistryRecord[] = [
  {
    contractId: 'FlowToken',
    version: 'v12.2b',
    chainId: BOT_TESTNET_CHAIN_ID,
    address: '0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac',
    deployTxHash: null,
    block: null,
    sourceHash: null,
    artifactHash: null,
    runtimeHash: null,
    compiler: SOLC_0_8_24_PARIS,
    ownerOrAdmin: null,
    state: 'DEPLOYED_VERIFIED',
    verified: true,
  },
  {
    contractId: 'FlowRewardsDistributor',
    version: 'v12.2c',
    chainId: BOT_TESTNET_CHAIN_ID,
    address: '0x559605fa3120cd472b86966FE4b5dC7e9e0b2b34',
    deployTxHash: null,
    block: null,
    sourceHash: null,
    artifactHash: null,
    runtimeHash: null,
    compiler: SOLC_0_8_24_PARIS,
    ownerOrAdmin: null,
    state: 'DEPLOYED_VERIFIED',
    verified: true,
  },
  {
    contractId: 'FlowStakingVault',
    version: 'v13.2',
    chainId: BOT_TESTNET_CHAIN_ID,
    address: '0x36f2318027edf79D083Aac98D66C9a1b3e2AAdD1',
    deployTxHash: null,
    block: null,
    sourceHash: null,
    artifactHash: null,
    runtimeHash: null,
    compiler: SOLC_0_8_24_PARIS,
    ownerOrAdmin: null,
    state: 'DEPLOYED_VERIFIED',
    verified: true,
  },
] as const;

const MAINNET_RECORDS: readonly RegistryRecord[] = CONTRACT_INVENTORY.map((c) =>
  notDeployedMainnet(c.id),
);

export function contractRegistry(env: NetworkEnvironment): readonly RegistryRecord[] {
  return env === 'mainnet' ? MAINNET_RECORDS : TESTNET_RECORDS;
}

export function registryRecord(
  env: NetworkEnvironment,
  contractId: string,
): RegistryRecord | null {
  return contractRegistry(env).find((r) => r.contractId === contractId) ?? null;
}

/** All known BOT Testnet addresses — used to block mainnet contamination. */
export function testnetAddressSet(): Set<string> {
  return new Set(
    TESTNET_RECORDS.filter((r) => r.address).map((r) => (r.address as string).toLowerCase()),
  );
}
