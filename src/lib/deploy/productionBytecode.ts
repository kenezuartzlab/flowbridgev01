/**
 * FlowBridge V30.1E.1 — reproducible production bytecode registry.
 *
 * Frozen evidence produced by `contracts/scripts/build.production.ts` (double
 * build from clean compiler state, per-family reviewed build matrix). This
 * module is pure data plus fail-closed predicates: it never deploys, never
 * signs and never contains signing material.
 *
 * Router identity is deliberately split: the live BOT Mainnet 677 Router v3
 * deployment stays LEGACY_EXISTING_V3 and can NEVER satisfy the Router V4
 * deployment requirement, which remains ROUTER_V4_PROMOTION_PENDING.
 */
export const EIP170_RUNTIME_LIMIT = 24_576;

export type ProductionContractId =
  | 'FlowToken'
  | 'FlowRewardsMerkleDistributor'
  | 'FlowBridgeRouterV4'
  | 'FlowBridgeRouterLens'
  | 'FlowBridgeActivityRegistry'
  | 'FlowStakingRewardTreasury'
  | 'FlowStakingController'
  | 'FlowStakingVaultV2';

export type BuildLineId = 'routerV4' | 'missingContractPackage' | 'tokenRewards' | 'stakingV2';

export interface CompilerMatrix {
  version: string;
  optimizerRuns: number;
  viaIR: boolean;
  evmVersion: string;
  openzeppelin: string;
}

export interface ProductionBytecodeEntry {
  contractId: ProductionContractId;
  source: string;
  sourceSha256: string;
  buildLine: BuildLineId;
  compiler: CompilerMatrix;
  creationSha256: string;
  runtimeSha256: string | null;
  normalizedAbiSha256: string;
  creationBytes: number;
  runtimeBytes: number;
  doubleBuild: 'REPRODUCIBLE' | 'NON_REPRODUCIBLE';
}

export const PRODUCTION_BYTECODE: Readonly<Record<ProductionContractId, ProductionBytecodeEntry>> =
  {
    FlowToken: {
      contractId: 'FlowToken',
      source: 'contracts/FlowToken.sol',
      sourceSha256: '96a757b53494a5cee3268ef289183c660c6c8b6bd22e27a44469b6780c83229e',
      buildLine: 'tokenRewards',
      compiler: {
        version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'cancun',
        openzeppelin: '5.6.1',
      },
      creationSha256: '200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2',
      runtimeSha256: 'f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf',
      normalizedAbiSha256: '879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851',
      creationBytes: 5660,
      runtimeBytes: 3539,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowRewardsMerkleDistributor: {
      contractId: 'FlowRewardsMerkleDistributor',
      source: 'contracts/production/rewards-distributor/FlowRewardsMerkleDistributor.sol',
      sourceSha256: 'cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43',
      buildLine: 'tokenRewards',
      compiler: {
        version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'cancun',
        openzeppelin: '5.6.1',
      },
      creationSha256: '21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581',
      runtimeSha256: 'a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367',
      normalizedAbiSha256: '821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79',
      creationBytes: 7181,
      runtimeBytes: 5861,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowBridgeRouterV4: {
      contractId: 'FlowBridgeRouterV4',
      source: 'contracts/production/router-v4/FlowBridgeRouterV4.sol',
      sourceSha256: 'bb43445af143d8c4a36fd144315c2d99f13fe28c73eca63c4f3736709e3ba905',
      buildLine: 'routerV4',
      compiler: {
        version: '0.8.20+commit.a1b79de6.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'shanghai',
        openzeppelin: '5.6.1',
      },
      creationSha256: 'ca4eb47368ce6b3eae3df8822d39e1af86c672bed07baae1c230f64f9041dec8',
      runtimeSha256: '5650a7c7b744b1eebdc2a5167edfd6ae486bda4e7c2af5e606a1c42dfc4a88f1',
      normalizedAbiSha256: '913ace626b49a5e32b24457bf0fc6982ecca2fbfdcafff6d616ab67fc095d6df',
      creationBytes: 20020,
      runtimeBytes: 19720,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowBridgeRouterLens: {
      contractId: 'FlowBridgeRouterLens',
      source: 'contracts/production/router-lens/FlowBridgeRouterLens.sol',
      sourceSha256: '8a5e1c842d6177b380c93b6670eb8e47ef58f00eb5e10bcc4508a3b16ff71aa2',
      buildLine: 'missingContractPackage',
      compiler: {
        version: '0.8.20+commit.a1b79de6.Emscripten.clang',
        optimizerRuns: 1,
        viaIR: true,
        evmVersion: 'shanghai',
        openzeppelin: '5.6.1',
      },
      creationSha256: '41a872fc048e1c8071bc8dfd8764c3669a229240e94cd5c080a80304feffbd1e',
      runtimeSha256: '629755614256eccd980c134e427292aa064cf620d828f79696d93385a424bffd',
      normalizedAbiSha256: '0ee994f33acf1df22e0fd5e558f757d83e0f9913663bf596ef0044dc02dc7042',
      creationBytes: 8069,
      runtimeBytes: 7829,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowBridgeActivityRegistry: {
      contractId: 'FlowBridgeActivityRegistry',
      source: 'contracts/production/activity-registry/FlowBridgeActivityRegistry.sol',
      sourceSha256: '2735de22c1f59a4c7ba7c4c66a2944b03db19aa3c76d670d0ef9a20ff5aeca6e',
      buildLine: 'missingContractPackage',
      compiler: {
        version: '0.8.20+commit.a1b79de6.Emscripten.clang',
        optimizerRuns: 1,
        viaIR: true,
        evmVersion: 'shanghai',
        openzeppelin: '5.6.1',
      },
      creationSha256: '25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d',
      runtimeSha256: '53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b',
      normalizedAbiSha256: 'e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d',
      creationBytes: 3490,
      runtimeBytes: 2713,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowStakingRewardTreasury: {
      contractId: 'FlowStakingRewardTreasury',
      source: 'contracts/production/staking-v2/FlowStakingRewardTreasury.sol',
      sourceSha256: '963ce367246ebc673e1d915202759a5159604dd0a794484b68500f921155d8a8',
      buildLine: 'stakingV2',
      compiler: {
        version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'cancun',
        openzeppelin: '5.6.1',
      },
      creationSha256: 'd090c6ba3afb751a7251bf8585e1ed013e4ad7b8298dcb836945e1382deaa28f',
      runtimeSha256: '9dabd23c2e1330b450d0d5344d7a6ad65791ff3a5e9695f447618fb9e9a0cf3c',
      normalizedAbiSha256: '3cfeefcdd459ca697e3f6f1891e3ffe9a325896f544d9b32a7358fabb115065a',
      creationBytes: 4604,
      runtimeBytes: 4137,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowStakingController: {
      contractId: 'FlowStakingController',
      source: 'contracts/production/staking-v2/FlowStakingController.sol',
      sourceSha256: 'b2a58b1128c0a9d42630b0026ce69cc377abbce6c9ea3ec42721c73d40afc0d4',
      buildLine: 'stakingV2',
      compiler: {
        version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'cancun',
        openzeppelin: '5.6.1',
      },
      creationSha256: 'c54baac0837b46791e6af688c3cf1cb13085ccf174597341ef57abf774777ef8',
      runtimeSha256: 'e534f7b8a606b4e12ef80aa77df2372c742cf085ca38a7d15e2d697c031f459b',
      normalizedAbiSha256: 'b61bcac1780e51fda835b9e57318a7198c09d4d6e7542a3dabb7640c3fe0e88f',
      creationBytes: 8876,
      runtimeBytes: 7108,
      doubleBuild: 'REPRODUCIBLE',
    },
    FlowStakingVaultV2: {
      contractId: 'FlowStakingVaultV2',
      source: 'contracts/production/staking-v2/FlowStakingVaultV2.sol',
      sourceSha256: '4a82e4f0f9c07e2a24bc7150d80675c6c3d1b8359ce11589aac55fb7c75b2531',
      buildLine: 'stakingV2',
      compiler: {
        version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
        optimizerRuns: 200,
        viaIR: true,
        evmVersion: 'cancun',
        openzeppelin: '5.6.1',
      },
      creationSha256: '159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6',
      runtimeSha256: 'af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce',
      normalizedAbiSha256: 'a22dacc20032a9a188034b1fd1ea4c66eaa8ae3827259ac790a6897fd52369e0',
      creationBytes: 11254,
      runtimeBytes: 10366,
      doubleBuild: 'REPRODUCIBLE',
    },
  } as const;

export type BytecodeStatus = 'BYTECODE_READY' | 'PARITY_PROVEN' | 'BUILD_PARITY_BLOCKED';

/** Fail-closed status for a single contract. */
export function bytecodeStatus(entry: ProductionBytecodeEntry): BytecodeStatus {
  const complete =
    !!entry.sourceSha256 &&
    !!entry.creationSha256 &&
    !!entry.runtimeSha256 &&
    !!entry.normalizedAbiSha256;
  if (!complete) return 'BUILD_PARITY_BLOCKED';
  if (entry.doubleBuild !== 'REPRODUCIBLE') return 'BUILD_PARITY_BLOCKED';
  if (entry.runtimeBytes > EIP170_RUNTIME_LIMIT) return 'BUILD_PARITY_BLOCKED';
  return entry.contractId === 'FlowBridgeRouterV4' ? 'PARITY_PROVEN' : 'BYTECODE_READY';
}

export function isBytecodeReady(contractId: ProductionContractId): boolean {
  return bytecodeStatus(PRODUCTION_BYTECODE[contractId]) !== 'BUILD_PARITY_BLOCKED';
}

export function routerV4BuildParity(): 'PROVEN' | 'UNPROVEN' {
  const entry = PRODUCTION_BYTECODE.FlowBridgeRouterV4;
  return bytecodeStatus(entry) === 'PARITY_PROVEN' && entry.runtimeSha256 !== null
    ? 'PROVEN'
    : 'UNPROVEN';
}

/** Reviewed build matrix a contract MUST be compiled with; anything else fails parity. */
export function compilerMatrixMatches(
  contractId: ProductionContractId,
  observed: CompilerMatrix,
): boolean {
  const expected = PRODUCTION_BYTECODE[contractId].compiler;
  return (
    expected.version === observed.version &&
    expected.optimizerRuns === observed.optimizerRuns &&
    expected.viaIR === observed.viaIR &&
    expected.evmVersion === observed.evmVersion &&
    expected.openzeppelin === observed.openzeppelin
  );
}

// ── Router identity split ───────────────────────────────────────────────────

export type RouterReleaseIdentity = 'LEGACY_EXISTING_V3' | 'ROUTER_V4_PROMOTION_PENDING';

export interface RouterInventoryRecord {
  identity: RouterReleaseIdentity;
  chainId: number;
  /** Address is only known for the already-live legacy deployment. */
  address: string | null;
  contractId: ProductionContractId | null;
  runtimeSha256: string | null;
  appUsage: 'PRODUCTION_TRAFFIC' | 'NOT_WIRED';
  satisfiesRouterV4Requirement: false;
  note: string;
}

export const ROUTER_INVENTORY: readonly RouterInventoryRecord[] = [
  {
    identity: 'LEGACY_EXISTING_V3',
    chainId: 677,
    address: '0x986962de6f00d0ec571b1a34fa70aeeb445b5445',
    contractId: null,
    runtimeSha256: null,
    appUsage: 'PRODUCTION_TRAFFIC',
    satisfiesRouterV4Requirement: false,
    note: 'Live pre-V4 production router. Untouched in this gate; it can never be relabelled as Router V4.',
  },
  {
    identity: 'ROUTER_V4_PROMOTION_PENDING',
    chainId: 677,
    address: null,
    contractId: 'FlowBridgeRouterV4',
    runtimeSha256: PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeSha256,
    appUsage: 'NOT_WIRED',
    satisfiesRouterV4Requirement: false,
    note: 'Build parity proven, not deployed. Promotion requires deployment, explorer source verification and configuration verification.',
  },
] as const;

/** Only a deployed + source-verified V4 record may ever satisfy the V4 requirement. */
export function routerV4RequirementSatisfied(
  records: readonly RouterInventoryRecord[] = ROUTER_INVENTORY,
): boolean {
  return records.some((r) => r.identity !== 'LEGACY_EXISTING_V3' && r.satisfiesRouterV4Requirement);
}
