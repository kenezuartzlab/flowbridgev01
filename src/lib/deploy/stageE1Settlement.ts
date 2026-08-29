/**
 * FlowBridge V30.1E Stage E.1 — FlowStakingRewardTreasury mainnet settlement.
 *
 * Records the single authorized nonce-5 deployment on BOT Mainnet 677 and the
 * post-settlement verification evidence. Nothing here signs, broadcasts, funds
 * the treasury, grants VAULT_ROLE / CONTROLLER_ROLE, activates products,
 * configures the oracle, or touches Stage A/B/C/D contracts.
 *
 * Stage E.2 (Controller) and Stage E.3 (Vault V2) remain unauthorized.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  APPROVED_AUTHORITIES,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';

export const STAGE_E1_BUILD_MATRIX = {
  buildLine: 'stakingV2',
  solc: '0.8.24+commit.e11b9ed9.Emscripten.clang',
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'cancun',
  openzeppelin: '5.6.1',
} as const;

export const STAGE_E1_ARTIFACT = {
  source: 'contracts/production/staking-v2/FlowStakingRewardTreasury.sol',
  sourceSha256: '963ce367246ebc673e1d915202759a5159604dd0a794484b68500f921155d8a8',
  creationSha256: 'd090c6ba3afb751a7251bf8585e1ed013e4ad7b8298dcb836945e1382deaa28f',
  runtimeSha256: '9dabd23c2e1330b450d0d5344d7a6ad65791ff3a5e9695f447618fb9e9a0cf3c',
  normalizedAbiSha256: '3cfeefcdd459ca697e3f6f1891e3ffe9a325896f544d9b32a7358fabb115065a',
  creationBytes: 4604,
  runtimeBytes: 4137,
  doubleBuildReproducible: true,
  manifestParity: 'EXACT_MATCH',
  standardJsonInput:
    'contracts/production/stage-e-verification/standard-input-FlowStakingRewardTreasury.json',
} as const;

export const STAGE_E1_CONSTRUCTOR_ARGS = {
  token: '0x535ddda826142ac42ce288154e9595f080940ae9',
  admin: APPROVED_AUTHORITIES.governanceSafe,
  recoveryRecipient: APPROVED_AUTHORITIES.treasurySafe,
} as const;

export const STAGE_E1_ABI_ENCODED_ARGS =
  '0x000000000000000000000000535ddda826142ac42ce288154e9595f080940ae9' +
  '00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507' +
  '000000000000000000000000efc13d1a1dc30ba2da0bb005ba5a783c6b229ea4';

/** Pre-sign revalidation, all values identical to the authorized preflight. */
export const STAGE_E1_PRESIGN_REVALIDATION = {
  chainId: BOT_MAINNET_CHAIN_ID,
  observedAtBlock: 21358806,
  deployer: APPROVED_DEPLOYER_ADDRESS,
  nonce: 5,
  balanceBOT: '2.31312724',
  gasPriceWei: '20000000000',
  candidateDigest: V30_1E_CANDIDATE_DIGEST,
  decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
  constructorArgsKeccak:
    '0x963745f5c44c7a582b20e7ec760c15381c1e5f9e813ff886ead442d22b7e4097',
  unsignedDataKeccak:
    '0x967f90fbf5e2d32762cc7b073245b59f38092e77c727e22c5b4bfaff115fdd7b',
  dataBytes: 4700,
  expectedAddress: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  expectedAddressCodeBefore: '0x',
  gasEstimate: '1010122',
  allAuthorizedValuesMatched: true,
} as const;

/** The single broadcast Stage E.1 transaction. */
export const STAGE_E1_TRANSACTION = {
  hash: '0x1928f133f95497edfa0549307e78f5ac93c30d47793273e2cd515851ed104350',
  blockNumber: 21358833,
  status: 1,
  nonce: 5,
  valueBOT: '0',
  gasLimit: 1313159,
  gasUsed: '1001010',
  gasPriceWei: '20000000000',
  feeBOT: '0.0200202',
  deployedAddress: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  addressMatchesPrediction: true,
} as const;

/**
 * Immutable-aware runtime parity. viaIR does not emit immutableReferences, so
 * the five 20-byte deltas are compared directly: every one is the canonical
 * FLOW token address written into the immutable `token` slots. No other byte
 * differs, so the deployed code is exactly the frozen artifact.
 */
export const STAGE_E1_RUNTIME_PARITY = {
  onchainRuntimeBytes: 4137,
  frozenRuntimeBytes: 4137,
  frozenRuntimeSha256: STAGE_E1_ARTIFACT.runtimeSha256,
  onchainRuntimeSha256:
    'f961c3b3f524fa6a81cc9c8a1f97a62f3eef6ab858ee51a1643589842be11ac6',
  immutableSlotRanges: [
    [393, 412],
    [1015, 1034],
    [1168, 1187],
    [2622, 2641],
    [2943, 2962],
  ],
  immutableSubstitutedValue: '0x535ddda826142ac42ce288154e9595f080940ae9',
  allDeltasAreImmutableTokenAddress: true,
  verdict: 'EXACT_IMMUTABLE_AWARE_MATCH',
} as const;

/** Live post-settlement configuration and authority checks. */
export const STAGE_E1_POST_SETTLEMENT = {
  token: '0x535dDDA826142AC42cE288154e9595f080940aE9',
  tokenIsCanonicalFlow: true,
  defaultAdminIsGovernanceSafe: true,
  recoveryRecipientIsTreasurySafe: true,
  deployerHasDefaultAdmin: false,
  deployerHasVaultRole: false,
  deployerHasControllerRole: false,
  vaultRoleGrantedToAnyKnownParty: false,
  controllerRoleGrantedToAnyKnownParty: false,
  flowBalanceWei: '0',
  reservedGenesisWei: '0',
  reservedFloorsWei: '0',
  committedEpochWei: '0',
  accruedUnclaimedWei: '0',
  totalObligationsWei: '0',
  freeBalanceWei: '0',
  recoveryBoundedToFreeBalance: true,
  deployerRecoverFreeReverts: true,
  mintPathPresent: false,
  fundedTenMillionInventory: false,
} as const;

export const STAGE_E1_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'BLOCKSCOUT_V2_STANDARD_JSON',
  submissionResponse: 'Smart-contract verification started',
  isVerified: true,
  verifiedName: 'FlowStakingRewardTreasury',
  verifiedCompilerVersion: 'v0.8.24+commit.e11b9ed9',
  status: 'PUBLICLY_VERIFIED',
  preservedInput: STAGE_E1_ARTIFACT.standardJsonInput,
} as const;

export const STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN = [
  'FLOW_FUNDING_OF_TREASURY',
  'TEN_MILLION_INVENTORY_TRANSFER',
  'VAULT_ROLE_GRANT',
  'CONTROLLER_ROLE_GRANT',
  'PRODUCT_ACTIVATION',
  'ORACLE_CONFIGURATION',
  'EPOCH_COMMIT_OR_ACCRUAL',
  'CONTROLLER_BROADCAST',
  'VAULT_V2_BROADCAST',
  'ROUTER_MIGRATION_OR_REGISTRY_CHANGE',
  'SAFE_TRANSACTION',
] as const;

export const STAGE_E1_VERDICT = 'STAGE_E1_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED' as const;

export const STAGE_E_NEXT_STAGE_LOCK = {
  stageE2Controller: 'UNAUTHORIZED_PENDING_EXPLICIT_APPROVAL',
  stageE3VaultV2: 'UNAUTHORIZED_PENDING_EXPLICIT_APPROVAL',
  routerTrafficPolicy: 'ROUTER_V3_REMAINS_LIVE_PRODUCTION',
  stageASourceStatus: 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING',
  stageBSourceStatus: 'DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING',
  stageDSourceStatus: 'EXPLORER_TRANSPORT_BLOCKED',
} as const;
