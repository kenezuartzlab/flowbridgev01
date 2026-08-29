/**
 * FlowBridge V30.1E.16 — Stage E.3 settlement record (FlowStakingVaultV2).
 *
 * Exactly one transaction was broadcast on BOT Mainnet 677 from the approved
 * deployer at nonce 7 using the frozen creation bytecode and the frozen
 * constructor arguments (FLOW, Controller, Reward Treasury, Governance Safe
 * admin). No Controller setVault, no Treasury role grant, no pause delegation,
 * no epoch budget, no oracle configuration, no funding, no stake and no UI
 * activation occurred.
 */

export const STAGE_E3_ARTIFACT = {
  contract: 'FlowStakingVaultV2',
  source: 'contracts/production/staking-v2/FlowStakingVaultV2.sol',
  compiler: {
    version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: 'cancun',
    openzeppelin: '5.6.1',
    buildLine: 'stakingV2',
  },
  standardJsonInputPath:
    'contracts/production/stage-e-verification/standard-input-FlowStakingVaultV2.json',
  standardJsonInputSha256: 'cea8ef2f131aee8fc7b05f918fa97daa41240c3ee88f08ca991a3acfb4af9636',
  creationSha256: '159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6',
  runtimeSha256: 'af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce',
  creationBytes: 11254,
  runtimeBytes: 10366,
  doubleBuildReproducible: true,
  manifestParity: 'EXACT_MATCH',
} as const;

export const STAGE_E3_PRESIGN_REVALIDATION = {
  observedAtBlock: 21366225,
  chainId: 677,
  deployer: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  nonce: 7,
  balanceBOT: '2.25412392',
  gasPriceWei: '20000000000',
  candidateDigest: 'fnv1a64:19671fd13a81be19',
  decisionManifestHash: 'fnv1a64:9972234982dbe76f',
  creationSha256Matches: true,
  constructorArgsKeccak: '0xc19ac2409811e9b37f32175a7869863cc7673216514e19ee5db98241e39b3c54',
  unsignedDataKeccak: '0x654e7597031841556f69bdfdaa6522d708a0a1d78b31de05e31ff6ae9c613440',
  dataBytes: 11382,
  gasEstimate: 2390840,
  gasLimit: 3108092,
  predictedAddress: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  predictedAddressCodeless: true,
  dependencyCodeSizes: { flowToken: 3539, controller: 7108, rewardTreasury: 4137 },
} as const;

export const STAGE_E3_TRANSACTION = {
  txHash: '0xe3d000d3243a0b85862e64fff63e340ccabb2e73831b2293cd87ec1f1b43f6c9',
  blockNumber: 21366262,
  blockTimestamp: 1788008561,
  status: 1,
  contractAddress: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  nonce: 7,
  valueBOT: 0,
  gasUsed: 2370856,
  gasLimit: 3108092,
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.04741712',
  broadcastCount: 1,
} as const;

/**
 * The vault stores token, controller and treasury as immutables. The compiled
 * artifact carries zeroes in those slots, so the raw on-chain runtime hash
 * differs from the frozen hash in exactly 28 twenty-byte ranges, each equal to
 * one of the three approved dependency addresses.
 */
export const STAGE_E3_RUNTIME_PARITY = {
  onchainRuntimeBytes: 10366,
  compiledRuntimeBytes: 10366,
  rawOnchainRuntimeSha256: '78ae940e72f35a2e85bcd24e8fbbe0ab88e44ab80e9640ded95f2c8f67bf2fb3',
  frozenRuntimeSha256: 'af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce',
  differingRangeCount: 28,
  differingRangeWidthBytes: 20,
  differingRangeValues: [
    '535ddda826142ac42ce288154e9595f080940ae9',
    '5095ecc7226ad6decee99846bc83363ca41b52bf',
    'a861152ca3676bccf7b5fdafb9eb6a57b9d32d0e',
  ],
  differingRangeExplanation:
    'every differing range is an immutable address slot: FLOW token, Controller or Reward Treasury',
  classification: 'EXACT_IMMUTABLE_AWARE_MATCH',
} as const;

export const STAGE_E3_POST_SETTLEMENT = {
  bindings: {
    token: '0x535dDDA826142AC42cE288154e9595f080940aE9',
    controller: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    treasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    allMatchDeployedContracts: true,
    immutable: true,
  },
  authority: {
    governanceSafe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    governanceIsDefaultAdmin: true,
    governanceIsPauser: true,
    deployerIsDefaultAdmin: false,
    deployerIsPauser: false,
    deployerHasEpochRole: false,
    epochRoleHolders: 0,
    epochGate: 'settleVariableEpoch requires msg.sender == controller (role grants are not a bypass)',
  },
  genesisState: {
    totalPrincipal: '0',
    nextPositionId: '0',
    totalPositions: 0,
    totalStakedByProduct: ['0', '0', '0', '0', '0'],
    varPerTokenStored: ['0', '0', '0', '0', '0'],
    currentFlowPerSecond: ['0', '0', '0', '0', '0'],
    currentEpochCommitted: '0',
    currentEpochMoved: '0',
    currentEpochEnd: '0',
    lastVarUpdate: '0',
    paused: false,
    flowBalanceWei: '0',
  },
  reachability: {
    controllerVault: '0x0000000000000000000000000000000000000000',
    controllerVaultIsUnset: true,
    controllerMaxFlowPerEpoch: '0',
    vaultHasTreasuryRoles: false,
    rewardInventoryFundedFlow: 0,
    economicallyActivePositionsPossibleNow: false,
    blockedBy: [
      'Controller setVault not called (vault unbound)',
      'Reward Treasury grants no reserve/payout role to the vault',
      'maxFlowPerEpoch = 0 and no epoch published',
      'oracle unset — dynamic bonus fail-closed',
      'reward inventory unfunded (0 FLOW)',
    ],
  },
  productRules: {
    productCount: 5,
    lockedProductsFixedMaturity: true,
    lockedMaturitySeconds: [2_592_000, 7_776_000, 15_552_000, 31_536_000],
    flexibleProductHasNoFixedLock: true,
    matureWithdrawalPresent: true,
    matureWithdrawalWorksWhilePaused: true,
    normalEarlyWithdrawalForFixedLocks: false,
    earlyExitRevert: 'PositionLocked',
  },
  custody: {
    canMintFlow: false,
    hasSlashingPath: false,
    hasPrincipalConfiscationPath: false,
    hasSweepOrRescuePath: false,
    payableFunctions: 0,
    hasReceive: false,
    hasFallback: false,
    withdrawReturnsExactPrincipal: true,
  },
  /**
   * Frozen product-flag semantics (accepted with Stage E.2): `product.active`
   * means the product definition and rate matrix exist. It is not by itself a
   * public-availability switch.
   */
  productFlagSemantics: {
    activeMeansDefinitionExists: true,
    activeMeansPublicStakingAvailable: false,
    publicStakingAvailableNow: false,
  },
} as const;

export const STAGE_E3_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'BLOCKSCOUT_V2_STANDARD_JSON_INPUT',
  isVerified: false,
  status: 'EXPLORER_TRANSPORT_BLOCKED',
  observedResponse: 'HTTP 403 Cloudflare challenge on the verification POST endpoint (GET reads succeed)',
  attempts: 5,
  submittedInput: 'contracts/production/stage-e-verification/standard-input-FlowStakingVaultV2.json',
  exactPackagePreserved: true,
  note: 'The exact Standard JSON package is preserved and reproduces the frozen artifact; verification can be resubmitted unchanged once the explorer accepts the request.',
} as const;

export const STAGE_E3_PROHIBITED_ACTIONS_TAKEN = {
  setVaultCalls: 0,
  treasuryRoleGrants: 0,
  pauserDelegationsToOperationsSafe: 0,
  weeklyBudgetConfigurations: 0,
  oracleConfigurations: 0,
  flowFundedWei: '0',
  stakesCreated: 0,
  publicStakingUiActivated: false,
  safeTransactions: 0,
  unrelatedWrites: 0,
} as const;

export const STAGE_E3_STAGE_LOCKS = {
  activationConfigurationStageAuthorized: false,
  routerV3StillLive: true,
  routerV4PromotionAuthorized: false,
} as const;

export const STAGE_E3_VERDICT = 'STAGE_E3_SETTLED_ONCHAIN_VERIFIED_SOURCE_PENDING' as const;
