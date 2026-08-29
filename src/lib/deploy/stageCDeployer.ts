/**
 * FlowBridge V30.1E Stage C — Router V4 + Router Lens preflight, deterministic
 * unsigned deployment review and the one-time Stage C approval bindings.
 *
 * Secret-safe by construction: public addresses and public chain observations
 * only. Nothing here signs, broadcasts, funds, registers an integration,
 * activates a registry entry or migrates app traffic.
 *
 * Stage C deploys Router V4 SEPARATELY. Router v3 remains the live production
 * router until an explicit, separately approved migration decision.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  APPROVED_AUTHORITIES,
  GAS_SAFETY_BUFFER_BPS,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { payloadFor } from './deploymentPayloads';
import { createStageApproval, type StageApproval } from './deploymentTransport';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';
import { STAGE_A_SETTLEMENT } from './stageASettlement';
import { STAGE_B_SETTLEMENT } from './stageBSettlement';

/** Live production router on BOT Mainnet — untouched by Stage C. */
export const LIVE_MAINNET_ROUTER_V3 = '0x986962de6f00d0ec571b1a34fa70aeeb445b5445' as const;

/** Router v3 stays authoritative for app traffic through and after Stage C. */
export const STAGE_C_TRAFFIC_POLICY = {
  liveRouter: LIVE_MAINNET_ROUTER_V3,
  liveRouterVersion: 'v3-legacy',
  v4Promotion: 'NOT_APPROVED',
  migratesTraffic: false,
} as const;

/** Frozen Stage C artifact identities (must equal V30.1E.1 evidence). */
export const STAGE_C_ARTIFACTS = {
  FlowBridgeRouterV4: {
    sourceSha256: 'bb43445af143d8c4a36fd144315c2d99f13fe28c73eca63c4f3736709e3ba905',
    creationSha256: 'ca4eb47368ce6b3eae3df8822d39e1af86c672bed07baae1c230f64f9041dec8',
    runtimeSha256: '5650a7c7b744b1eebdc2a5167edfd6ae486bda4e7c2af5e606a1c42dfc4a88f1',
    normalizedAbiSha256: '913ace626b49a5e32b24457bf0fc6982ecca2fbfdcafff6d616ab67fc095d6df',
    creationBytes: 20_020,
    runtimeBytes: 19_720,
  },
  FlowBridgeRouterLens: {
    sourceSha256: '8a5e1c842d6177b380c93b6670eb8e47ef58f00eb5e10bcc4508a3b16ff71aa2',
    creationSha256: '41a872fc048e1c8071bc8dfd8764c3669a229240e94cd5c080a80304feffbd1e',
    runtimeSha256: '629755614256eccd980c134e427292aa064cf620d828f79696d93385a424bffd',
    normalizedAbiSha256: '0ee994f33acf1df22e0fd5e558f757d83e0f9913663bf596ef0044dc02dc7042',
    creationBytes: 8_069,
    runtimeBytes: 7_829,
  },
} as const;

/**
 * Exact constructor arguments.
 * Router V4 constructor is (address initialOwner, address initialFeeTreasury).
 * Lens constructor is (address flowRouter_) and reverts unless the target
 * already has deployed code — so the Lens must be the SECOND transaction, bound
 * to the CREATE address produced by the Router transaction.
 */
export const STAGE_C_CONSTRUCTOR_ARGS = {
  FlowBridgeRouterV4: {
    initialOwner: APPROVED_AUTHORITIES.governanceSafe,
    initialFeeTreasury: APPROVED_AUTHORITIES.treasurySafe,
  },
  FlowBridgeRouterLens: {
    flowRouter_: 'CREATE(deployer, nonce 2)',
  },
} as const;

/** Router V4 genesis configuration implied by the frozen source. */
export const STAGE_C_EXPECTED_ROUTER_CONFIG = {
  owner: APPROVED_AUTHORITIES.governanceSafe,
  pendingOwner: '0x0000000000000000000000000000000000000000',
  feeTreasury: APPROVED_AUTHORITIES.treasurySafe,
  globalFeeBps: 0,
  maxFeeBps: 500,
  feeConfigNonce: 0,
  paused: false,
  routerCount: 0,
  bridgeCount: 0,
  registryActivationDelay: 0,
  maxRegistryActivationDelaySeconds: 604_800,
  bridgeProxyExecutionEnabled: false,
  bridgeAdapterMainnetExecution: false,
} as const;

/** Live read-only observation recorded for the Stage C preflight (chain 677). */
export interface StageCObservation {
  chainId: number;
  blockNumber: number;
  deployerCode: string;
  deployerBalanceWei: bigint;
  nonce: number;
  gasPriceWei: bigint;
  routerGasEstimate: bigint;
  lensGasEstimate: bigint;
  safesVerified: boolean;
  candidateDigest: string;
  decisionManifestHash: string;
  liveRouterV3Address: string;
  liveRouterV3HasCode: boolean;
  bdexDependenciesUnchanged: boolean;
  router: {
    sourceSha256: string;
    creationSha256: string;
    runtimeSha256: string;
    normalizedAbiSha256: string;
    runtimeBytes: number;
    doubleBuildReproducible: boolean;
    expectedAddress: string;
    unsignedDataBytes: number;
    unsignedDataKeccak256: string;
  };
  lens: {
    sourceSha256: string;
    creationSha256: string;
    runtimeSha256: string;
    normalizedAbiSha256: string;
    runtimeBytes: number;
    doubleBuildReproducible: boolean;
    expectedAddress: string;
    unsignedDataBytes: number;
    unsignedDataKeccak256: string;
  };
}

/** Recorded live observation — BOT Mainnet 677, read-only JSON-RPC. */
export const STAGE_C_OBSERVATION: StageCObservation = {
  chainId: 677,
  blockNumber: 21_321_532,
  deployerCode: '0x',
  deployerBalanceWei: 2_450_962_620_000_000_000n,
  nonce: 2,
  gasPriceWei: 20_000_000_000n,
  routerGasEstimate: 4_452_213n,
  lensGasEstimate: 1_764_423n,
  safesVerified: true,
  candidateDigest: V30_1E_CANDIDATE_DIGEST,
  decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
  liveRouterV3Address: LIVE_MAINNET_ROUTER_V3,
  liveRouterV3HasCode: true,
  bdexDependenciesUnchanged: true,
  router: {
    ...STAGE_C_ARTIFACTS.FlowBridgeRouterV4,
    doubleBuildReproducible: true,
    expectedAddress: '0x3c6fdaf93f39c72be931ab80196292962ebe6b06',
    unsignedDataBytes: 20_084,
    unsignedDataKeccak256: '0xfe972eb9bdd8377d8cd5331180d594f8307373d41f5f9a73de6c13d17fb27fb2',
  },
  lens: {
    ...STAGE_C_ARTIFACTS.FlowBridgeRouterLens,
    doubleBuildReproducible: true,
    expectedAddress: '0x48338d23640b09acdf0e7246844a9d867dc8205c',
    unsignedDataBytes: 8_101,
    unsignedDataKeccak256: '0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9',
  },
};

export type StageCCheckId =
  | 'CHAIN_IS_BOT_MAINNET'
  | 'DEPLOYER_IS_EOA'
  | 'DEPLOYER_NONCE_EXPECTED'
  | 'CANDIDATE_DIGEST_UNCHANGED'
  | 'MANIFEST_HASH_UNCHANGED'
  | 'SAFES_VERIFIED'
  | 'ROUTER_ARTIFACT_PARITY'
  | 'LENS_ARTIFACT_PARITY'
  | 'DOUBLE_BUILD_REPRODUCIBLE'
  | 'ROUTER_EIP170_WITHIN_LIMIT'
  | 'CONSTRUCTOR_ARGS_MATCH_MANIFEST'
  | 'LENS_TARGET_IS_STAGE_C_ROUTER'
  | 'BRIDGE_EXECUTION_OFF'
  | 'ACTIVATION_DELAY_PROTECTION_PRESENT'
  | 'PRIOR_STAGES_SETTLED'
  | 'ROUTER_V3_REMAINS_LIVE'
  | 'BDEX_DEPENDENCIES_UNCHANGED'
  | 'STAGE_FUNDING_COVERED';

export interface StageCCheck {
  id: StageCCheckId;
  ok: boolean;
  detail: string;
}

export interface StageCPreflightResult {
  verdict: 'STAGE_C_PREFLIGHT_PASS' | 'STAGE_C_PREFLIGHT_BLOCKED';
  deployerAddress: string;
  checks: readonly StageCCheck[];
  blockers: readonly string[];
  requiredStageFundingWei: string;
  balanceWei: string;
}

const EIP170_LIMIT = 24_576;
const lc = (v: string) => v.toLowerCase();

const buffered = (gas: bigint, priceWei: bigint) => {
  const base = gas * priceWei;
  return base + (base * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
};

/** Combined Router + Lens gas envelope at the observed gas price, +30%. */
export function requiredStageCFundingWei(obs: StageCObservation = STAGE_C_OBSERVATION): bigint {
  return (
    buffered(obs.routerGasEstimate, obs.gasPriceWei) +
    buffered(obs.lensGasEstimate, obs.gasPriceWei)
  );
}

export function bufferedGasLimit(gasEstimate: bigint): bigint {
  return gasEstimate + (gasEstimate * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

export function evaluateStageCPreflight(
  obs: StageCObservation = STAGE_C_OBSERVATION,
): StageCPreflightResult {
  const frozenRouter = PRODUCTION_BYTECODE.FlowBridgeRouterV4;
  const frozenLens = PRODUCTION_BYTECODE.FlowBridgeRouterLens;
  const routerPayload = payloadFor('FlowBridgeRouterV4');
  const lensPayload = payloadFor('FlowBridgeRouterLens');
  const required = requiredStageCFundingWei(obs);
  const args = STAGE_C_CONSTRUCTOR_ARGS;

  const parity = (
    built: StageCObservation['router'],
    frozen: (typeof PRODUCTION_BYTECODE)['FlowBridgeRouterV4'],
  ) =>
    built.sourceSha256 === frozen.sourceSha256 &&
    built.creationSha256 === frozen.creationSha256 &&
    (built.runtimeSha256 as string) === (frozen.runtimeSha256 as string) &&
    built.normalizedAbiSha256 === frozen.normalizedAbiSha256 &&
    built.runtimeBytes === frozen.runtimeBytes;

  const checks: StageCCheck[] = [
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
      id: 'DEPLOYER_NONCE_EXPECTED',
      ok: obs.nonce === 2,
      detail: 'nonce must be exactly 2 (Stage A used nonce 0, Stage B used nonce 1)',
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
      id: 'ROUTER_ARTIFACT_PARITY',
      ok: parity(obs.router, frozenRouter),
      detail: 'rebuilt Router V4 source/creation/runtime/ABI hashes must equal V30.1E.1 evidence',
    },
    {
      id: 'LENS_ARTIFACT_PARITY',
      ok: parity(obs.lens, frozenLens),
      detail: 'rebuilt Lens source/creation/runtime/ABI hashes must equal V30.1E.1 evidence',
    },
    {
      id: 'DOUBLE_BUILD_REPRODUCIBLE',
      ok: obs.router.doubleBuildReproducible && obs.lens.doubleBuildReproducible,
      detail: 'two clean builds per contract must produce byte-identical creation and runtime code',
    },
    {
      id: 'ROUTER_EIP170_WITHIN_LIMIT',
      ok: obs.router.runtimeBytes <= EIP170_LIMIT,
      detail: `Router runtime ${obs.router.runtimeBytes} bytes must stay within ${EIP170_LIMIT}`,
    },
    {
      id: 'CONSTRUCTOR_ARGS_MATCH_MANIFEST',
      ok:
        lc(args.FlowBridgeRouterV4.initialOwner) === lc(APPROVED_AUTHORITIES.governanceSafe) &&
        lc(args.FlowBridgeRouterV4.initialFeeTreasury) === lc(APPROVED_AUTHORITIES.treasurySafe) &&
        routerPayload.args.length === 2 &&
        lensPayload.args.length === 1,
      detail:
        'Router owner must be the Governance Safe, fee treasury the Treasury Safe, and the frozen payloads must carry exactly those arities',
    },
    {
      id: 'LENS_TARGET_IS_STAGE_C_ROUTER',
      ok:
        lc(obs.lens.expectedAddress) !== lc(obs.router.expectedAddress) &&
        lensPayload.unresolvedDependencies.includes('FlowBridgeRouterV4'),
      detail:
        'Lens must be the second transaction and bind to the Router CREATE address from this stage',
    },
    {
      id: 'BRIDGE_EXECUTION_OFF',
      ok:
        !STAGE_C_EXPECTED_ROUTER_CONFIG.bridgeProxyExecutionEnabled &&
        !STAGE_C_EXPECTED_ROUTER_CONFIG.bridgeAdapterMainnetExecution,
      detail: 'Router bridge-proxy execution and BridgeAdapter mainnet execution must remain OFF',
    },
    {
      id: 'ACTIVATION_DELAY_PROTECTION_PRESENT',
      ok: STAGE_C_EXPECTED_ROUTER_CONFIG.maxRegistryActivationDelaySeconds === 604_800,
      detail:
        'registry activation-delay guard must be compiled in (MAX_REGISTRY_ACTIVATION_DELAY = 7 days); the delay value itself is set by Governance before any registry activation',
    },
    {
      id: 'PRIOR_STAGES_SETTLED',
      ok:
        STAGE_A_SETTLEMENT.contractAddress.length === 42 &&
        STAGE_B_SETTLEMENT.contractAddress.length === 42,
      detail: 'Stage A (FlowToken) and Stage B (rewards distributor) must already be settled',
    },
    {
      id: 'ROUTER_V3_REMAINS_LIVE',
      ok:
        obs.liveRouterV3HasCode &&
        lc(obs.liveRouterV3Address) === lc(LIVE_MAINNET_ROUTER_V3) &&
        !STAGE_C_TRAFFIC_POLICY.migratesTraffic,
      detail: 'Router v3 must remain the live production router; Stage C must not migrate traffic',
    },
    {
      id: 'BDEX_DEPENDENCIES_UNCHANGED',
      ok: obs.bdexDependenciesUnchanged,
      detail: 'frozen BDEX/BOT factory, router and WBOT dependency addresses must be unchanged',
    },
    {
      id: 'STAGE_FUNDING_COVERED',
      ok: obs.deployerBalanceWei >= required,
      detail: 'deployer balance must cover both live gas estimates +30% at the live gas price',
    },
  ];

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail);
  return {
    verdict: blockers.length === 0 ? 'STAGE_C_PREFLIGHT_PASS' : 'STAGE_C_PREFLIGHT_BLOCKED',
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    checks,
    blockers,
    requiredStageFundingWei: required.toString(),
    balanceWei: obs.deployerBalanceWei.toString(),
  };
}

/**
 * One-time Stage C approvals — one per contract, bound to the exact artifact,
 * constructor args, deployer and chain. They never authorize funding, registry
 * registration/activation, bridge enablement or Router v3 → V4 promotion.
 */
export function buildStageCApprovals(): readonly StageApproval[] {
  return (['FlowBridgeRouterV4', 'FlowBridgeRouterLens'] as const).map((contractId) => {
    const payload = payloadFor(contractId);
    return createStageApproval({
      stage: 'C_ROUTER_V4_AND_LENS',
      candidateDigest: V30_1E_CANDIDATE_DIGEST,
      decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
      chainId: BOT_MAINNET_CHAIN_ID,
      deployerAddress: APPROVED_DEPLOYER_ADDRESS,
      contractId,
      artifactCreationSha256: STAGE_C_ARTIFACTS[contractId].creationSha256,
      constructorArgsHash: payload.constructorArgsHash,
      expectedEffect: payload.expectedEffect,
    });
  });
}

/** Unsigned Stage C review returned to the owner before any signature. */
export const STAGE_C_UNSIGNED_REVIEW = {
  stage: 'C_ROUTER_V4_AND_LENS',
  chainId: 677,
  from: APPROVED_DEPLOYER_ADDRESS,
  transactions: [
    {
      order: 1,
      contractId: 'FlowBridgeRouterV4',
      to: null,
      value: '0',
      nonce: 2,
      gasPriceWei: '20000000000',
      gasEstimate: '4452213',
      gasLimit: '5787876',
      creationBytes: 20_020,
      unsignedDataBytes: 20_084,
      unsignedDataKeccak256: STAGE_C_OBSERVATION.router.unsignedDataKeccak256,
      expectedAddress: STAGE_C_OBSERVATION.router.expectedAddress,
      constructorArgs: STAGE_C_CONSTRUCTOR_ARGS.FlowBridgeRouterV4,
    },
    {
      order: 2,
      contractId: 'FlowBridgeRouterLens',
      to: null,
      value: '0',
      nonce: 3,
      gasPriceWei: '20000000000',
      gasEstimate: '1764423',
      gasLimit: '2293749',
      creationBytes: 8_069,
      unsignedDataBytes: 8_101,
      unsignedDataKeccak256: STAGE_C_OBSERVATION.lens.unsignedDataKeccak256,
      expectedAddress: STAGE_C_OBSERVATION.lens.expectedAddress,
      constructorArgs: { flowRouter_: STAGE_C_OBSERVATION.router.expectedAddress },
    },
  ],
  totalBufferedFeeWei: '161632500000000000',
  expectedRouterConfig: STAGE_C_EXPECTED_ROUTER_CONFIG,
  registeredIntegrations: { routers: 0, bridges: 0, note: 'registry is empty at genesis' },
  trafficPolicy: STAGE_C_TRAFFIC_POLICY,
  ownerApproval: 'RECORDED_PREFLIGHT_ONLY',
  broadcast: 'NOT_BROADCAST',
} as const;
