/**
 * FlowBridge V30.1E Stage C.2 — Router Lens settlement record (read-only).
 *
 * The Lens is a pure read/quote surface: it holds no funds, exposes no
 * state-mutating function, and points at Router V4 through an immutable
 * constructor binding. Router v3 remains the live production router — nothing
 * here registers, activates, funds or migrates anything.
 */
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { STAGE_C1_ROUTER_ADDRESS, STAGE_C1_TRAFFIC_POLICY } from './stageC1Settlement';

export const STAGE_C2_LENS_ADDRESS = '0x48338d23640b09acDf0e7246844a9d867DC8205c';

export const STAGE_C2_TRANSACTION = {
  hash: '0x421b2da4e1ce3738d0367d8a59c82f0b43ef1fcf099aa54befc699e5792859f6',
  blockNumber: 21_331_972,
  status: 1,
  nonce: 3,
  valueWei: '0',
  gasLimit: '2293765',
  gasUsed: '1749384',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.03498768',
  unsignedDataKeccak256:
    '0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9',
  expectedAddressMatched: true,
} as const;

/**
 * The only byte differences between the rebuilt frozen runtime and the on-chain
 * runtime are the ten immutable `flowRouter` slots the constructor writes, each
 * of which holds exactly the Stage C.1 Router V4 address.
 */
export const STAGE_C2_RUNTIME_PARITY = {
  frozenRuntimeSha256: PRODUCTION_BYTECODE.FlowBridgeRouterLens.runtimeSha256,
  onchainRuntimeSha256: '86206e7b75193e5ebfd0581af7a74c1cf2a4fe1ac7601892b9caaff9d22e33be',
  runtimeBytes: 7_829,
  sizesEqual: true,
  differingBytes: 200,
  differingRanges: 10,
  allDifferencesAreImmutableRouterSlots: true,
  immutableSlotStarts: [179, 1047, 1477, 2282, 2864, 3368, 3454, 5813, 6474, 6961],
  verdict: 'PROVEN_MODULO_IMMUTABLES',
} as const;

export const STAGE_C2_OBSERVED_READS = {
  flowRouter: STAGE_C1_ROUTER_ADDRESS,
  activeRoutersCount: 0,
  activeBridgesCount: 0,
  routersPageEmpty: true,
  bridgesPageEmpty: true,
  getRouterZeroReverts: 'RouterIdOutOfRange',
  getBridgeRouteConfigZeroReverts: 'BridgeIdOutOfRange',
  findBestV2RateFound: false,
} as const;

export const STAGE_C2_MUTATION_SURFACE = {
  mutatingFunctions: [] as readonly string[],
  payableEntries: [] as readonly string[],
  hasReceiveOrFallback: false,
  canMutateRouterState: false,
} as const;

export const STAGE_C2_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'blockscout-v2-standard-json-input',
  compiler: 'v0.8.20+commit.a1b79de6',
  optimizerRuns: 1,
  viaIR: true,
  evmVersion: 'shanghai',
  isVerified: true,
  reportedName: 'FlowBridgeRouterLens',
  status: 'PUBLICLY_VERIFIED',
} as const;

/**
 * Stage A/B verification retry using the exact same successful V4 route.
 * Blocked by the explorer edge, not by any artifact mismatch: bundles above
 * roughly 20 KB are answered with a Cloudflare HTML 403 on every transport
 * (curl, real browser session with cf cookies, v2 multipart and v1 form).
 */
export const EXPLORER_EDGE_RETRY = {
  route: 'blockscout-v2-standard-json-input',
  transportsTried: [
    'curl-multipart-http2',
    'curl-multipart-http1.1',
    'chromium-session-fetch',
    'blockscout-v1-verifysourcecode',
  ],
  observedAcceptedBodyBytes: 16_763,
  observedRejectedBodyBytes: 22_971,
  singleSourceProbesAccepted: true,
  sourcesAltered: false,
  recompiled: false,
  redeployed: false,
} as const;

export const STAGE_A_VERIFICATION_STATE = {
  contract: 'FlowToken',
  address: '0x535ddda826142ac42ce288154e9595f080940ae9',
  bundleBytes: 183_563,
  submissionHttpStatus: 403,
  status: 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING',
  blocker: 'EXPLORER_EDGE_BODY_SIZE_403',
} as const;

export const STAGE_B_VERIFICATION_STATE = {
  contract: 'FlowRewardsMerkleDistributor',
  address: '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
  bundleBytes: 88_005,
  submissionHttpStatus: 403,
  status: 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING',
  blocker: 'EXPLORER_EDGE_BODY_SIZE_403',
} as const;

export const STAGE_C2_TRAFFIC_POLICY = {
  liveProductionRouter: STAGE_C1_TRAFFIC_POLICY.liveProductionRouter,
  v4Promotion: 'NOT_APPROVED',
  migratesTraffic: false,
  registryRegistrations: 0,
  registryActivations: 0,
  fundingActions: 0,
} as const;

export const STAGE_C2_VERDICT = 'STAGE_C2_SETTLED_VERIFIED' as const;
