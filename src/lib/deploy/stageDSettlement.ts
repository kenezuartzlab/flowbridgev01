/**
 * FlowBridge V30.1E Stage D — FlowBridgeActivityRegistry settlement record
 * (read-only evidence).
 *
 * The Registry is an append-only evidence anchor. It holds no FLOW, has no
 * reward or economic execution authority, and started life with zero
 * activities. Nothing here attests activity, funds anything, changes Router
 * registries or migrates Router v3 traffic.
 */
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';

export const STAGE_D_REGISTRY_ADDRESS = '0xa80d8740f378989F649ca14C54e4B4a42E68753c';

export const STAGE_D_TRANSACTION = {
  chainId: 677,
  hash: '0xd636a12677f0f68a47595501a792861ceb83b18fd1c3fc8d0b6d76e226bf3b76',
  blockNumber: 21_353_823,
  status: 1,
  nonce: 4,
  valueWei: '0',
  gasEstimate: '733319',
  gasLimit: '953314',
  gasUsed: '726387',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.01452774',
  unsignedDataKeccak256:
    '0xb802153f8ac61914fb7bf2fc78d45972e5f545051d7b180c8df75ada13fed443',
  expectedAddressMatched: true,
} as const;

/** Registry has no immutables, so runtime parity is byte-exact. */
export const STAGE_D_RUNTIME_PARITY = {
  frozenRuntimeSha256: PRODUCTION_BYTECODE.FlowBridgeActivityRegistry.runtimeSha256,
  onchainRuntimeSha256: '53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b',
  runtimeBytes: 2_713,
  verdict: 'EXACT_MATCH',
} as const;

export const STAGE_D_ROLE_MATRIX = {
  defaultAdmin: APPROVED_AUTHORITIES.governanceSafe,
  attester: APPROVED_AUTHORITIES.activityAttester,
  pauser: APPROVED_AUTHORITIES.operationsSafe,
  attesterRoleHash: '0xca77cd8f9856ef5fcd36f6b15bf469fe216c2f9114f60dd031f0a2b97b67aaa9',
  pauserRoleHash: '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
  governanceIsDefaultAdmin: true,
  attesterHasAttesterRole: true,
  operationsHasPauserRole: true,
  adminEqualsAttester: false,
  deployerHoldsAnyRole: false,
} as const;

export const STAGE_D_GENESIS_STATE = {
  recordedActivities: 0,
  activityRecordedEvents: 0,
  paused: false,
  attestationsPausable: true,
  activityIdDeterministic: true,
  activityIdMatchesCanonicalUint256Encoding: true,
  sourceLogIndexAffectsIdentity: true,
  duplicateProtectionError: 'DuplicateActivity',
  payableFunctions: [] as readonly string[],
  hasReceiveOrFallback: false,
  tokenOrRewardCustody: 'NONE',
  economicExecutionAuthority: 'NONE',
} as const;

/**
 * Router V4 and Router Lens verified publicly because they are single-file
 * sources with no imports. Contracts that import OpenZeppelin under `viaIR`
 * (FlowToken, Rewards Distributor, this Registry) were compiled through the
 * canonical import-callback build. Recompiling the identical sources and
 * identical settings as an explicit multi-source standard-JSON input produces
 * a functionally identical runtime with a different internal block layout, so
 * the explorer's verifier cannot reproduce the deployed bytes. This is a
 * compiler input-shape limitation, not a source, compiler or runtime mismatch:
 * the deployed runtime is byte-identical to the frozen manifest artifact.
 */
export const STAGE_D_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'blockscout-v2-standard-json-input',
  compiler: 'v0.8.20+commit.a1b79de6',
  optimizerRuns: 1,
  viaIR: true,
  evmVersion: 'shanghai',
  submissionAccepted: true,
  isVerified: false,
  bundlePreserved: 'contracts/production/stage-d-verification/',
  status: 'EXPLORER_TRANSPORT_BLOCKED',
  onchainRuntimeMatchesFrozenArtifact: true,
} as const;

export const STAGE_D_PROHIBITED_ACTIONS_OBSERVED = {
  attestationSubmitted: false,
  historicalActivityFabricated: false,
  assetTransferred: false,
  unrelatedRoleGranted: false,
  funding: false,
  routerRegistryModified: false,
  routerV3TrafficMigrated: false,
  safeTransactionExecuted: false,
} as const;

export const STAGE_D_VERDICT = 'STAGE_D_SETTLED_ONCHAIN_VERIFIED_SOURCE_PENDING' as const;
