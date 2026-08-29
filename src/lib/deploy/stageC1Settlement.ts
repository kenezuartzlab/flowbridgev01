/**
 * FlowBridge V30.1E Stage C.1 — Router V4 settlement record (read-only).
 *
 * Router V4 is deployed and publicly source-verified on BOT Mainnet 677. The
 * Router Lens remains approved-but-not-broadcast, and Router v3 remains the
 * live production router: nothing here promotes V4 or migrates traffic.
 */
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';
import { PRODUCTION_BYTECODE } from './productionBytecode';

export const STAGE_C1_ROUTER_ADDRESS = '0x3c6fdaf93F39c72be931AB80196292962ebe6B06';

export const STAGE_C1_TRANSACTION = {
  hash: '0x142b41ea8b5e1b13bf3439212dbf7a24a29edb17267be782cd1f311e6e0ba46c',
  blockNumber: 21_328_235,
  status: 1,
  nonce: 2,
  valueWei: '0',
  gasLimit: '5787876',
  gasUsed: '4415998',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.08831996',
  unsignedDataKeccak256:
    '0xfe972eb9bdd8377d8cd5331180d594f8307373d41f5f9a73de6c13d17fb27fb2',
} as const;

export const STAGE_C1_RUNTIME_PARITY = {
  onchainRuntimeSha256: PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeSha256,
  runtimeBytes: 19_720,
  byteDifferences: 0,
  verdict: 'EXACT_MATCH',
} as const;

export const STAGE_C1_OBSERVED_CONFIG = {
  owner: APPROVED_AUTHORITIES.governanceSafe,
  pendingOwner: '0x0000000000000000000000000000000000000000',
  feeTreasury: APPROVED_AUTHORITIES.treasurySafe,
  globalFeeBps: 0,
  maxFeeBps: 500,
  feeConfigNonce: 0,
  paused: false,
  routerCount: 0,
  bridgeCount: 0,
  registryActivationDelaySeconds: 0,
  maxRegistryActivationDelaySeconds: 604_800,
  bridgeExecutionEnabled: false,
} as const;

/**
 * A zero activation delay is only tolerable while the registry is empty. Any
 * registration or activation requires the approved non-zero delay first.
 */
export function activationDelayAcceptable(
  delaySeconds: number,
  routerCount: number,
  bridgeCount: number,
): boolean {
  if (routerCount === 0 && bridgeCount === 0) return true;
  return delaySeconds > 0 && delaySeconds <= STAGE_C1_OBSERVED_CONFIG.maxRegistryActivationDelaySeconds;
}

export const STAGE_C1_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'blockscout-v2-standard-json-input',
  compiler: 'v0.8.20+commit.a1b79de6',
  optimizerRuns: 200,
  viaIR: true,
  evmVersion: 'shanghai',
  isVerified: true,
  status: 'PUBLICLY_VERIFIED',
} as const;

export const STAGE_C2_LENS_STATE = {
  state: 'APPROVED_NOT_BROADCAST',
  target: STAGE_C1_ROUTER_ADDRESS,
  creationSha256: PRODUCTION_BYTECODE.FlowBridgeRouterLens.creationSha256,
  runtimeSha256: PRODUCTION_BYTECODE.FlowBridgeRouterLens.runtimeSha256,
  unsignedDataBytes: 8_101,
  unsignedDataKeccak256:
    '0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9',
  unsignedPayloadUnchanged: true,
  gasEstimate: '1764435',
  gasLimitBuffered: '2293765',
  nonce: 3,
  expectedAddress: '0x48338d23640b09acDf0e7246844a9d867DC8205c',
} as const;

export const STAGE_C1_TRAFFIC_POLICY = {
  liveProductionRouter: '0x986962de6f00d0ec571b1a34fa70aeeb445b5445',
  liveRouterHasCode: true,
  liveRouterVersion: 'v3-legacy',
  v4Promotion: 'NOT_APPROVED',
  migratesTraffic: false,
} as const;

export const STAGE_C1_VERDICT = 'STAGE_C1_SETTLED_VERIFIED' as const;
