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
    id: 'FlowRewardsDistributor',
    name: 'FlowRewardsDistributor',
    sourcePath: 'contracts/FlowRewardsDistributor.sol',
    artifactPath: 'contracts/artifacts/FlowRewardsDistributor.json',
    readiness: 'HARDENING_REQUIRED',
    compiler: SOLC_0_8_24_PARIS,
    privilegedRoles: ['owner (Ownable2Step)', 'rewardSigner', 'pauser (owner)'],
    constructorRequirements: ['token', 'owner', 'rewardSigner'],
    blockers: [
      'Outstanding signed cumulative authorizations are not reserved against the distributor balance; owner funding withdrawal can make already-authorized claims insolvent (V30.1B).',
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
      'Mainnet governance hardening is outstanding (registry activation-delay reset, owner/timelock, fee safety, final BDEX production configuration) — V30.1D.',
      'Creation/runtime bytecode identity is not reproducible in this workspace (no Solidity toolchain), so build parity against the reviewed candidate is unproven.',
      'Bridge proxy execution must remain disabled for mainnet.',
    ],
  },

  {
    id: 'FlowBridgeRouterLens',
    name: 'FlowBridgeRouterLens',
    sourcePath: null,
    artifactPath: null,
    readiness: 'BLOCKED',
    compiler: ROUTER_V4_BUILD_LINE,
    privilegedRoles: ['none (read-only lens)'],
    constructorRequirements: ['unavailable — source not present in this repository'],
    blockers: ['Source/artifact not present in this workspace.'],
  },
  {
    id: 'FlowBridgeActivityRegistry',
    name: 'FlowBridgeActivityRegistry',
    sourcePath: null,
    artifactPath: null,
    readiness: 'BLOCKED',
    compiler: ROUTER_V4_BUILD_LINE,
    privilegedRoles: ['admin', 'attester', 'pauser'],
    constructorRequirements: ['unavailable — source not present in this repository'],
    blockers: [
      'Source/artifact not present in this workspace; uint256 sourceLogIndex parity and duplicate-rejection cannot be proven from this repository.',
    ],
  },
  {
    id: 'FlowBridgeBridgeAdapterV1',
    name: 'FlowBridgeBridgeAdapterV1',
    sourcePath: null,
    artifactPath: null,
    readiness: 'BLOCKED',
    compiler: ROUTER_V4_BUILD_LINE,
    privilegedRoles: ['owner', 'pauser'],
    constructorRequirements: ['unavailable — source not present in this repository'],
    blockers: [
      'Mainnet execution remains disabled: the refund/recovery blocker is unresolved and the source is not present here.',
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
