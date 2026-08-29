/**
 * FlowBridge V30.1E.13 — Stage E staking-v2 preflight record.
 *
 * Frozen, read-only evidence for the three staking production candidates
 * (FlowStakingRewardTreasury, FlowStakingController, FlowStakingVaultV2) on BOT
 * Mainnet 677. Nothing here signs, broadcasts, funds the reward treasury,
 * configures an oracle, grants a role or enables a product.
 *
 * Staking has its OWN frozen build line (`stakingV2`: solc 0.8.24, optimizer
 * runs 200, viaIR, EVM cancun). Router (0.8.20 / shanghai) and Registry
 * (runs 1) settings must never be inherited.
 *
 * Stage D lesson applied: each artifact additionally retains the exact
 * Standard-JSON compiler input — with source unit names exactly as resolved by
 * the frozen import callback — that reproduces its bytecode byte-for-byte. The
 * explorer verification payload is generated from that preserved input, never
 * from a reconstructed source tree.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';

export const STAGE_E_BUILD_MATRIX = {
  buildLine: 'stakingV2',
  solc: '0.8.24+commit.e11b9ed9.Emscripten.clang',
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'cancun',
  openzeppelin: '5.6.1',
} as const;

export const CANONICAL_FLOW_TOKEN = '0x535ddda826142ac42ce288154e9595f080940ae9';
export const GOVERNANCE_SAFE = '0x88a4cc1f5771523baeb83daeea07d323a3ce9507';
export const TREASURY_SAFE = '0xefc13d1a1dc30ba2da0bb005ba5a783c6b229ea4';
export const OPERATIONS_SAFE = '0x1ce0b1df5d2055f6e92122d8cb7669609c2359ef';

/** 1B FLOW, verified still fully held by the Treasury Safe at preflight time. */
export const FLOW_TOTAL_SUPPLY_WEI = '1000000000000000000000000000';

export interface StageEContractRecord {
  contract: 'FlowStakingRewardTreasury' | 'FlowStakingController' | 'FlowStakingVaultV2';
  source: string;
  sourceSha256: string;
  creationSha256: string;
  runtimeSha256: string;
  normalizedAbiSha256: string;
  creationBytes: number;
  runtimeBytes: number;
  doubleBuildReproducible: true;
  manifestParity: 'EXACT_MATCH';
  standardJsonInputPath: string;
  standardJsonInputSha256: string;
  standardJsonReproducesArtifact: true;
  /** CREATE nonce this contract is authorized for. */
  nonce: number;
  expectedAddress: string;
  constructorArgs: readonly string[];
  constructorArgsKeccak: string;
  unsignedDataBytes: number;
  unsignedDataKeccak: string;
  gasEstimate: number;
  gasLimitBuffered30: number;
  expectedFeeBOT: string;
}

/**
 * Deployment order derived from the frozen constructors, not assumed:
 * Reward Treasury and Controller are independent; Vault V2 consumes both, so it
 * must be last. There are no cyclic constructor dependencies.
 */
export const STAGE_E_CONTRACTS: readonly StageEContractRecord[] = [
  {
    contract: 'FlowStakingRewardTreasury',
    source: 'contracts/production/staking-v2/FlowStakingRewardTreasury.sol',
    sourceSha256: '963ce367246ebc673e1d915202759a5159604dd0a794484b68500f921155d8a8',
    creationSha256: 'd090c6ba3afb751a7251bf8585e1ed013e4ad7b8298dcb836945e1382deaa28f',
    runtimeSha256: '9dabd23c2e1330b450d0d5344d7a6ad65791ff3a5e9695f447618fb9e9a0cf3c',
    normalizedAbiSha256: '3cfeefcdd459ca697e3f6f1891e3ffe9a325896f544d9b32a7358fabb115065a',
    creationBytes: 4604,
    runtimeBytes: 4137,
    doubleBuildReproducible: true,
    manifestParity: 'EXACT_MATCH',
    standardJsonInputPath:
      'contracts/production/stage-e-verification/standard-input-FlowStakingRewardTreasury.json',
    standardJsonInputSha256: '9d5417ab7722455497ccf8147aa9246829daf824e062752a1174554e38ba5ed8',
    standardJsonReproducesArtifact: true,
    nonce: 5,
    expectedAddress: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    constructorArgs: [
      `token_ = FlowToken ${CANONICAL_FLOW_TOKEN}`,
      `admin = Governance Safe ${GOVERNANCE_SAFE}`,
      `recoveryRecipient_ = Treasury Safe ${TREASURY_SAFE}`,
    ],
    constructorArgsKeccak: '0x963745f5c44c7a582b20e7ec760c15381c1e5f9e813ff886ead442d22b7e4097',
    unsignedDataBytes: 4700,
    unsignedDataKeccak: '0x967f90fbf5e2d32762cc7b073245b59f38092e77c727e22c5b4bfaff115fdd7b',
    gasEstimate: 1_010_122,
    gasLimitBuffered30: 1_313_159,
    expectedFeeBOT: '0.02626318',
  },
  {
    contract: 'FlowStakingController',
    source: 'contracts/production/staking-v2/FlowStakingController.sol',
    sourceSha256: 'b2a58b1128c0a9d42630b0026ce69cc377abbce6c9ea3ec42721c73d40afc0d4',
    creationSha256: 'c54baac0837b46791e6af688c3cf1cb13085ccf174597341ef57abf774777ef8',
    runtimeSha256: 'e534f7b8a606b4e12ef80aa77df2372c742cf085ca38a7d15e2d697c031f459b',
    normalizedAbiSha256: 'b61bcac1780e51fda835b9e57318a7198c09d4d6e7542a3dabb7640c3fe0e88f',
    creationBytes: 8876,
    runtimeBytes: 7108,
    doubleBuildReproducible: true,
    manifestParity: 'EXACT_MATCH',
    standardJsonInputPath:
      'contracts/production/stage-e-verification/standard-input-FlowStakingController.json',
    standardJsonInputSha256: 'eb28fb7cc46f74324c15210665d36d4485aa1a13392aa4e12fe8d89e930209ca',
    standardJsonReproducesArtifact: true,
    nonce: 6,
    expectedAddress: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    constructorArgs: [
      `admin = Governance Safe ${GOVERNANCE_SAFE}`,
      `governor = Governance Safe ${GOVERNANCE_SAFE}`,
      'publisher = address(0) — no genesis epoch publisher; PUBLISHER_ROLE stays ungranted until governance grants it',
    ],
    constructorArgsKeccak: '0xf03d5b653f96d9a93b75aceb736e3596e106e4db698b3d0667234dd76f24c856',
    unsignedDataBytes: 8972,
    unsignedDataKeccak: '0xb3bdd9c923df5210b67be451b36a079edaafda2f682717d659e1901f6d844893',
    gasEstimate: 1_965_793,
    gasLimitBuffered30: 2_555_531,
    expectedFeeBOT: '0.05111062',
  },
  {
    contract: 'FlowStakingVaultV2',
    source: 'contracts/production/staking-v2/FlowStakingVaultV2.sol',
    sourceSha256: '4a82e4f0f9c07e2a24bc7150d80675c6c3d1b8359ce11589aac55fb7c75b2531',
    creationSha256: '159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6',
    runtimeSha256: 'af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce',
    normalizedAbiSha256: 'a22dacc20032a9a188034b1fd1ea4c66eaa8ae3827259ac790a6897fd52369e0',
    creationBytes: 11254,
    runtimeBytes: 10366,
    doubleBuildReproducible: true,
    manifestParity: 'EXACT_MATCH',
    standardJsonInputPath:
      'contracts/production/stage-e-verification/standard-input-FlowStakingVaultV2.json',
    standardJsonInputSha256: 'cea8ef2f131aee8fc7b05f918fa97daa41240c3ee88f08ca991a3acfb4af9636',
    standardJsonReproducesArtifact: true,
    nonce: 7,
    expectedAddress: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
    constructorArgs: [
      `token_ = FlowToken ${CANONICAL_FLOW_TOKEN}`,
      'controller_ = predicted Controller CREATE 0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf (deployer nonce 6)',
      'treasury_ = predicted Reward Treasury CREATE 0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e (deployer nonce 5)',
      `admin = Governance Safe ${GOVERNANCE_SAFE}`,
    ],
    constructorArgsKeccak: '0xc19ac2409811e9b37f32175a7869863cc7673216514e19ee5db98241e39b3c54',
    unsignedDataBytes: 11382,
    unsignedDataKeccak: '0x654e7597031841556f69bdfdaa6522d708a0a1d78b31de05e31ff6ae9c613440',
    gasEstimate: 2_390_840,
    gasLimitBuffered30: 3_108_092,
    expectedFeeBOT: '0.06216184',
  },
];

/** Genesis product matrix expected to read back from the Controller. */
export const STAGE_E_PRODUCT_MATRIX = [
  { id: 0, label: 'Flexible', lockSeconds: 0, genesisAprBps: 1800, floorBps: 0, targetBps: 1000, hardCapBps: 1200 },
  { id: 1, label: 'Lock 30D', lockSeconds: 2_592_000, genesisAprBps: 2700, floorBps: 800, targetBps: 1400, hardCapBps: 1800 },
  { id: 2, label: 'Lock 90D', lockSeconds: 7_776_000, genesisAprBps: 3600, floorBps: 1000, targetBps: 1800, hardCapBps: 2400 },
  { id: 3, label: 'Lock 180D', lockSeconds: 15_552_000, genesisAprBps: 4800, floorBps: 1200, targetBps: 2400, hardCapBps: 3200 },
  { id: 4, label: 'Lock 365D', lockSeconds: 31_536_000, genesisAprBps: 6000, floorBps: 1500, targetBps: 3000, hardCapBps: 4000 },
] as const;

export const STAGE_E_CAPS = {
  genesisYear1CapFlow: 1_000_000,
  standardYear1CapFlow: 2_000_000,
  totalYear1CapFlow: 3_000_000,
  maxWeeklyRewardBudgetFlow: 50_000,
  epochSeconds: 7 * 86_400,
  genesisMaxSeconds: 90 * 86_400,
  plannedRewardTreasuryInventoryFlow: 10_000_000,
  fundingAuthorizedInStageE: false,
  mintPath: false,
} as const;

export const STAGE_E_GENESIS_STATE = {
  rewardTreasuryFlowBalance: 0,
  rewardTreasuryFundedInventory: 0,
  rewardTreasuryAccruedLiabilities: 0,
  controllerWeeklyUsdBudget8: 0,
  controllerMaxFlowPerEpoch: 0,
  controllerOracle: '0x0000000000000000000000000000000000000000',
  dynamicBonusState: 'PENDING_POOL_FAIL_CLOSED',
  vaultPositions: 0,
  vaultPrincipalCustody: 0,
  vaultRewardLiability: 0,
  vaultPaused: false,
  enabledProducts: 0,
  autoStakeOrClaim: false,
} as const;

export const STAGE_E_PROHIBITIONS = {
  signatures: 0,
  broadcasts: 0,
  flowFunded: 0,
  productsActivated: 0,
  oracleConfigured: false,
  roleGrants: 0,
  safeTransactions: 0,
} as const;

export interface StageEApproval {
  approvalId: string;
  chainId: number;
  deployer: string;
  nonce: number;
  valueBOT: 0;
  candidateDigest: string;
  decisionManifestHash: string;
  creationSha256: string;
  constructorArgsKeccak: string;
  unsignedDataKeccak: string;
  gasLimit: number;
  authorizes: string;
  excludes: readonly string[];
  invalidationRule: string;
}

/** One approval per transaction — never a single opaque trio batch. */
export function stageEApprovals(): StageEApproval[] {
  return STAGE_E_CONTRACTS.map((c, i) => ({
    approvalId: `STAGE_E_${i + 1}_${c.contract}`,
    chainId: BOT_MAINNET_CHAIN_ID,
    deployer: APPROVED_DEPLOYER_ADDRESS,
    nonce: c.nonce,
    valueBOT: 0 as const,
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    creationSha256: c.creationSha256,
    constructorArgsKeccak: c.constructorArgsKeccak,
    unsignedDataKeccak: c.unsignedDataKeccak,
    gasLimit: c.gasLimitBuffered30,
    authorizes: `deployment of ${c.contract} only`,
    excludes: [
      '10,000,000 FLOW reward-treasury funding',
      'product activation or public enablement',
      'oracle configuration',
      'role grants (VAULT_ROLE, CONTROLLER_ROLE, PUBLISHER_ROLE) and setVault',
      'any Safe transaction',
    ],
    invalidationRule:
      'If an earlier CREATE address or the live nonce differs at signing time, this approval and every later Stage E approval are void and must be regenerated.',
  }));
}

export const STAGE_E_VERDICT = 'STAGE_E_PREFLIGHT_PASS_APPROVED_NOT_BROADCAST' as const;

export const STAGE_E_OBSERVATION = {
  chainId: BOT_MAINNET_CHAIN_ID,
  block: 21_357_833,
  liveNonce: 5,
  balanceBOT: '2.31312724',
  gasPriceWei: '20000000000',
  totalBufferedFeeBOT: '0.13953564',
} as const;
