/**
 * FlowBridge V30.1E.15 — Stage E.2 settlement record (FlowStakingController).
 *
 * Exactly one transaction was broadcast on BOT Mainnet 677 from the approved
 * deployer at nonce 6 using the frozen creation bytecode and the frozen
 * constructor arguments (admin = governor = Governance Safe, publisher = zero).
 * No funding, no role grants, no oracle configuration, no setVault, no product
 * reconfiguration, no epoch publication and no Safe transaction occurred.
 */

export const STAGE_E2_ARTIFACT = {
  contract: 'FlowStakingController',
  source: 'contracts/production/staking-v2/FlowStakingController.sol',
  compiler: {
    version: '0.8.24+commit.e11b9ed9.Emscripten.clang',
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: 'cancun',
    openzeppelin: '5.6.1',
    buildLine: 'stakingV2',
  },
  standardJsonInputPath:
    'contracts/production/stage-e-verification/standard-input-FlowStakingController.json',
  standardJsonInputSha256: 'eb28fb7cc46f74324c15210665d36d4485aa1a13392aa4e12fe8d89e930209ca',
  creationSha256: 'c54baac0837b46791e6af688c3cf1cb13085ccf174597341ef57abf774777ef8',
  runtimeSha256: 'e534f7b8a606b4e12ef80aa77df2372c742cf085ca38a7d15e2d697c031f459b',
  creationBytes: 8876,
  runtimeBytes: 7108,
  doubleBuildReproducible: true,
  manifestParity: 'EXACT_MATCH',
} as const;

export const STAGE_E2_PRESIGN_REVALIDATION = {
  observedAtBlock: 21363599,
  chainId: 677,
  deployer: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  nonce: 6,
  balanceBOT: '2.29310704',
  gasPriceWei: '20000000000',
  candidateDigest: 'fnv1a64:19671fd13a81be19',
  decisionManifestHash: 'fnv1a64:9972234982dbe76f',
  creationSha256Matches: true,
  constructorArgsKeccak: '0xf03d5b653f96d9a93b75aceb736e3596e106e4db698b3d0667234dd76f24c856',
  unsignedDataKeccak: '0xb3bdd9c923df5210b67be451b36a079edaafda2f682717d659e1901f6d844893',
  dataBytes: 8972,
  gasEstimate: 1965793,
  gasLimit: 2555531,
  predictedAddress: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  predictedAddressCodeless: true,
} as const;

export const STAGE_E2_TRANSACTION = {
  txHash: '0x70e7cbfc298c2f6ea33483f1531b29538bf4fba7a64d6b3ce6c4ce241b3a8f49',
  blockNumber: 21363621,
  blockTimestamp: 1788006580,
  status: 1,
  contractAddress: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  nonce: 6,
  valueBOT: 0,
  gasUsed: 1949156,
  gasLimit: 2555531,
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.03898312',
  broadcastCount: 1,
} as const;

/**
 * The Controller stores `year1Start` as an immutable set to `block.timestamp`.
 * The compiled artifact carries zeroes there, so the raw on-chain runtime hash
 * differs by exactly one 4-byte range that equals the deploy block timestamp.
 */
export const STAGE_E2_RUNTIME_PARITY = {
  onchainRuntimeBytes: 7108,
  compiledRuntimeBytes: 7108,
  rawOnchainRuntimeSha256: 'b11897045c5fe2f5350b27c50c5d624294efa256851774c4359b0ecbcb3c972e',
  frozenRuntimeSha256: 'e534f7b8a606b4e12ef80aa77df2372c742cf085ca38a7d15e2d697c031f459b',
  differingRanges: [{ start: 4063, end: 4066, onchainHex: '6a92d0b4', compiledHex: '00000000', decodedUint: 1788006580 }],
  differingRangeExplanation: 'year1Start immutable == deploy block timestamp 1788006580',
  classification: 'EXACT_IMMUTABLE_AWARE_MATCH',
} as const;

export const STAGE_E2_POST_SETTLEMENT = {
  authority: {
    governanceSafe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    governanceIsDefaultAdmin: true,
    governanceIsGovernor: true,
    governanceHasPublisherRole: false,
    deployerIsDefaultAdmin: false,
    deployerIsGovernor: false,
    deployerIsPublisher: false,
    zeroAddressHasPublisherRole: false,
    publisherRoleHolders: 0,
  },
  year1Caps: { genesisFlow: 1_000_000, standardFlow: 2_000_000, totalFlow: 3_000_000 },
  year1Used: { genesisWei: '0', standardWei: '0' },
  budget: {
    weeklyUsdBudget8: '0',
    maxFlowPerEpoch: '0',
    weeklyCeiling50kActivated: false,
    note: 'The approved 50,000 FLOW/week ceiling is intentionally NOT configured in Stage E.2; it belongs to the later controlled activation stage.',
  },
  oracle: {
    address: '0x0000000000000000000000000000000000000000',
    configured: false,
    policy: { maxStalenessSeconds: 7200, minLiquidityUsd8: 0, maxDeviationBps: 500 },
    referenceHealthy: false,
    referenceReasonCode: 1,
    quoteEpochBudget: 'REVERTS_OracleNotConfigured',
    dynamicBonusState: 'FAIL_CLOSED_UNAVAILABLE',
  },
  epochState: { epochEnd: '0', epochCommitted: '0', prevImpliedVarBps: '0', emergencyMode: false, epochsPublished: 0, rewardsReleased: 0 },
  vault: {
    address: '0x0000000000000000000000000000000000000000',
    configured: false,
    expectedLater: true,
    note: 'setVault is a governor action reserved for the later activation stage; Stage E.3 vault deployment remains unauthorized.',
  },
  /**
   * Honest reading of the frozen constructor: all five products are written by
   * the constructor with `active = true` and their exact frozen economics. The
   * `active` flag is a rate-matrix presence flag, not a public-availability
   * switch: no staking is reachable because the vault binding is unset,
   * maxFlowPerEpoch is 0, the oracle is unset and the Vault contract is not
   * deployed. No product was reconfigured or enabled in Stage E.2.
   */
  products: {
    count: 5,
    matrixMatchesFrozenEconomics: true,
    activeFlagSetByFrozenConstructor: true,
    publiclyStakeableNow: false,
    stakingBlockedBy: ['vault unset', 'maxFlowPerEpoch = 0', 'oracle unset', 'FlowStakingVaultV2 not deployed'],
    reconfiguredInStageE2: 0,
    matrix: [
      { id: 0, name: 'Flexible', lockSeconds: 0, genesisAprBps: 1800, floorBps: 0, targetBps: 1000, hardCapBps: 1200, minPrincipalFlow: 1 },
      { id: 1, name: 'Lock 30D', lockSeconds: 2_592_000, genesisAprBps: 2700, floorBps: 800, targetBps: 1400, hardCapBps: 1800, minPrincipalFlow: 1 },
      { id: 2, name: 'Lock 90D', lockSeconds: 7_776_000, genesisAprBps: 3600, floorBps: 1000, targetBps: 1800, hardCapBps: 2400, minPrincipalFlow: 1 },
      { id: 3, name: 'Lock 180D', lockSeconds: 15_552_000, genesisAprBps: 4800, floorBps: 1200, targetBps: 2400, hardCapBps: 3200, minPrincipalFlow: 1 },
      { id: 4, name: 'Lock 365D', lockSeconds: 31_536_000, genesisAprBps: 6000, floorBps: 1500, targetBps: 3000, hardCapBps: 4000, minPrincipalFlow: 1 },
    ],
  },
  custody: { canMintFlow: false, holdsFlow: false, canMovePrincipal: false },
} as const;

export const STAGE_E2_SOURCE_VERIFICATION = {
  explorer: 'https://scan.botchain.ai',
  method: 'BLOCKSCOUT_V2_STANDARD_JSON_INPUT',
  isVerified: true,
  contractName: 'FlowStakingController',
  compilerVersion: 'v0.8.24+commit.e11b9ed9',
  submittedInput: 'contracts/production/stage-e-verification/standard-input-FlowStakingController.json',
  status: 'PUBLICLY_SOURCE_VERIFIED',
} as const;

export const STAGE_E2_PROHIBITED_ACTIONS_TAKEN = {
  flowFunded: 0,
  productsActivatedOrReconfigured: 0,
  oracleConfigured: false,
  roleGrants: 0,
  setVaultCalls: 0,
  epochsPublished: 0,
  maxFlowPerEpochChanges: 0,
  safeTransactions: 0,
  routerMigrations: 0,
  unrelatedWrites: 0,
} as const;

export const STAGE_E2_STAGE_LOCKS = {
  stageE3VaultAuthorized: false,
  activationStageAuthorized: false,
  routerV3StillLive: true,
  routerV4PromotionAuthorized: false,
} as const;

export const STAGE_E2_VERDICT = 'STAGE_E2_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED' as const;
