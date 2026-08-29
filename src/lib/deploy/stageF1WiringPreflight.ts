/**
 * FlowBridge V30.1F — Post-Deployment Wiring + Guardrails PREFLIGHT.
 *
 * READ-ONLY record. Every governance transaction below is prepared, decoded and
 * simulated from the authorized Governance Safe via eth_call/estimateGas only.
 * Nothing was signed or broadcast. No FLOW moved, no root/epoch published, no
 * router/bridge registered, no oracle set, no stake created, no attestation
 * recorded, and no source/compiler/artifact was touched.
 */

export const V30_1F_OBSERVATION = {
  chainId: 677,
  rpcChainIdMatches: true,
  observedAtBlock: 21371606,
  gasPriceWei: '20000000000',
  deployerNonce: 8,
  candidateDigest: 'fnv1a64:19671fd13a81be19',
  decisionManifestHash: 'fnv1a64:9972234982dbe76f',
  authorities: {
    governanceSafe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    operationsSafe: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
    treasurySafe: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
    deployer: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  },
  contracts: {
    flowToken: '0x535dDDA826142AC42cE288154e9595f080940aE9',
    rewardsDistributor: '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
    activityRegistry: '0xa80d8740f378989F649ca14C54e4B4a42E68753c',
    routerV4: '0x3c6fdaf93f39c72be931ab80196292962ebe6b06',
    routerLens: '0x48338d23640b09acDf0e7246844a9d867DC8205c',
    stakingRewardTreasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    stakingController: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    stakingVaultV2: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  },
} as const;

/** Current (pre-wiring) state proof — the preconditions each approval binds. */
export const V30_1F_CURRENT_STATE = {
  controller: {
    vault: '0x0000000000000000000000000000000000000000',
    vaultIsUnset: true,
    maxFlowPerEpoch: '0',
    weeklyUsdBudget8: '0',
    oracle: '0x0000000000000000000000000000000000000000',
    oracleUnset: true,
    emergencyMode: false,
    governanceIsDefaultAdmin: true,
    governanceIsGovernor: true,
    publisherRoleHolders: 0,
    deployerHasAnyRole: false,
  },
  rewardTreasury: {
    token: '0x535dDDA826142AC42cE288154e9595f080940aE9',
    recoveryRecipient: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
    flowBalance: '0',
    reservedGenesis: '0',
    reservedFloors: '0',
    committedEpoch: '0',
    accruedUnclaimed: '0',
    freeBalance: '0',
    vaultRoleId: '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959',
    controllerRoleId: '0x7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c570223357',
    vaultHasVaultRole: false,
    controllerHasControllerRole: false,
    governanceIsDefaultAdmin: true,
  },
  vault: {
    token: '0x535dDDA826142AC42cE288154e9595f080940aE9',
    controller: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    treasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    bindingsMatchDeployedContracts: true,
    totalPrincipal: '0',
    nextPositionId: '0',
    flowBalance: '0',
    paused: false,
    governanceIsDefaultAdmin: true,
    governanceIsPauser: true,
    operationsIsPauser: false,
    deployerHasAnyRole: false,
    pauserRoleAdmin: 'DEFAULT_ADMIN_ROLE',
    pauserRoleId: '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
  },
  rewardsDistributor: {
    governanceIsDefaultAdmin: true,
    minPublishDelay: '86400',
    flowBalance: '0',
    epochCount: '0',
    totalReserved: '0',
    totalClaimed: '0',
    unchanged: true,
  },
  activityRegistry: {
    governanceIsDefaultAdmin: true,
    activityRecorded: 0,
    unchanged: true,
  },
  routerV4: {
    owner: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    feeTreasury: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
    globalFeeBps: '0',
    registryActivationDelay: '0',
    maxRegistryActivationDelay: '604800',
    routerCount: 0,
    bridgeCount: 0,
    promoted: false,
    liveProductionRouter: 'v3 0x986962de6f00d0ec571b1a34fa70aeeb445b5445',
  },
  flowToken: {
    totalSupply: '1000000000000000000000000000',
    treasurySafeBalance: '1000000000000000000000000000',
    entireSupplyStillInTreasurySafe: true,
  },
} as const;

export interface PreparedGovernanceTx {
  readonly step: string;
  readonly from: string;
  readonly to: string;
  readonly selector: string;
  readonly decoded: string;
  readonly calldata: string;
  readonly calldataHash: string;
  readonly simulation: 'OK' | 'REVERT';
  readonly gasEstimate: string;
  readonly expectedPostState: string;
  readonly deployerCanCall: false;
  readonly approved: boolean;
}

/**
 * One deterministic unsigned governance transaction per state change. No batch,
 * no combined economic change. Every call reverts from the deployer EOA, so
 * governance authority is provably Safe-only.
 */
export const V30_1F_PREPARED_TXS: readonly PreparedGovernanceTx[] = [
  {
    step: 'F.1 Controller.setVault',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    selector: '0x6817031b',
    decoded: 'setVault(0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8)',
    calldata:
      '0x6817031b0000000000000000000000003cc0799fb4169a9bb5da9812bea23cba97b989c8',
    calldataHash: '0xa64fc6b587ec4d9239cfafdfbe8f8a339ff5147fad999010ef04158fd0fcb453',
    simulation: 'OK',
    gasEstimate: '46823',
    expectedPostState: 'Controller.vault == Vault V2; no other state change',
    deployerCanCall: false,
    approved: true,
  },
  {
    step: 'F.2a RewardTreasury.grantRole(VAULT_ROLE, Vault V2)',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    selector: '0x2f2ff15d',
    decoded:
      'grantRole(0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959, 0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8)',
    calldata:
      '0x2f2ff15d31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d9590000000000000000000000003cc0799fb4169a9bb5da9812bea23cba97b989c8',
    calldataHash: '0x654e20c094b56d28f011a2d26fec00e2de4c865a2d9f614eb94bf5aeb1f4f8ce',
    simulation: 'OK',
    gasEstimate: '51624',
    expectedPostState: 'hasRole(VAULT_ROLE, Vault) == true; all buckets remain 0',
    deployerCanCall: false,
    approved: true,
  },
  {
    step: 'F.2b RewardTreasury.grantRole(CONTROLLER_ROLE, Controller)',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    selector: '0x2f2ff15d',
    decoded:
      'grantRole(0x7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c570223357, 0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf)',
    calldata:
      '0x2f2ff15d7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c5702233570000000000000000000000005095ecc7226ad6decee99846bc83363ca41b52bf',
    calldataHash: '0x8d12af939d82a4a461b73add4e847e0092ee811c20619e855ef6845e25b84a1c',
    simulation: 'OK',
    gasEstimate: '51636',
    expectedPostState:
      'hasRole(CONTROLLER_ROLE, Controller) == true; commitEpoch still bounded by freeBalance() == 0',
    deployerCanCall: false,
    approved: true,
  },
  {
    step: 'F.3 Vault.grantRole(PAUSER_ROLE, Operations Safe)',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
    selector: '0x2f2ff15d',
    decoded:
      'grantRole(0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a, 0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF)',
    calldata:
      '0x2f2ff15d65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a0000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef',
    calldataHash: '0xa65a9a60b7e05f98a6d6126c58042a2708ef0e245c2beebe07e9dbd476bf494e',
    simulation: 'OK',
    gasEstimate: '51686',
    expectedPostState:
      'Operations Safe gains PAUSER_ROLE; Governance retains PAUSER_ROLE and DEFAULT_ADMIN_ROLE',
    deployerCanCall: false,
    approved: true,
  },
  {
    step: 'F.4 Controller.setBudgets(weeklyUsdBudget8 = 0, maxFlowPerEpoch = 50,000 FLOW)',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    selector: '0x5181ecd3',
    decoded: 'setBudgets(0, 50000000000000000000000)',
    calldata:
      '0x5181ecd30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a968163f0a57b400000',
    calldataHash: '0x9410508219448179db1408fa9683ada69b8811f84238d609ffd3fc06b2ad8da5',
    simulation: 'OK',
    gasEstimate: '50139',
    expectedPostState:
      'maxFlowPerEpoch == 50000e18 (ceiling only); weeklyUsdBudget8 stays 0 so no epoch can be published',
    deployerCanCall: false,
    approved: true,
  },
  {
    step: 'F.5 RouterV4.setRegistryActivationDelay(86400) — PREPARED, NOT APPROVED',
    from: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
    to: '0x3c6fdaf93f39c72be931ab80196292962ebe6b06',
    selector: '0x7e64facf',
    decoded: 'setRegistryActivationDelay(86400)',
    calldata:
      '0x7e64facf0000000000000000000000000000000000000000000000000000000000015180',
    calldataHash: '0x7b9a7daed26110c3db6932d9e1624d6774893600f573bd767677e87d605f18eb',
    simulation: 'OK',
    gasEstimate: '47937',
    expectedPostState: 'registryActivationDelay == 86400 (must precede any registry entry)',
    deployerCanCall: false,
    approved: false,
  },
] as const;

/**
 * F.4 units, read from the deployed Controller: setBudgets(uint256
 * weeklyUsdBudget8, uint256 maxFlowPerEpoch) is GOVERNOR_ROLE-gated and
 * maxFlowPerEpoch is denominated in FLOW wei (18 decimals) per published epoch.
 * The vault epoch length is the 7-day epoch used by settleVariableEpoch.
 */
export const V30_1F_CEILING_DERIVATION = {
  setter: 'setBudgets(uint256,uint256)',
  authorization: 'GOVERNOR_ROLE (Governance Safe)',
  maxFlowPerEpochUnits: 'FLOW wei (1e18)',
  approvedWeeklyCeilingFlow: 50_000,
  encodedValue: '50000000000000000000000',
  epochLengthSeconds: 604_800,
  weeklyUsdBudget8StaysZero: true,
  oracleStaysUnset: true,
  createsSpendableRewards: false,
  activatesStaking: false,
  reason:
    'publishVariableEpoch requires a healthy oracle and a non-zero weeklyUsdBudget8; both remain fail-closed',
} as const;

/**
 * F.3 source-backed reason: FlowStakingVaultV2 grants PAUSER_ROLE to the
 * constructor admin and PAUSER_ROLE is administered by DEFAULT_ADMIN_ROLE, so
 * Governance may delegate pause authority to Operations. The frozen
 * TIMELOCK_POLICY decision requires only "immediate pause through a narrowly
 * scoped pauser"; it does not require Operations-exclusive pause authority, so
 * NO revocation of Governance PAUSER_ROLE is prepared.
 */
export const V30_1F_PAUSE_AUTHORITY_PLAN = {
  delegationAllowedByFrozenModel: true,
  grantOperationsPauser: true,
  revokeGovernancePauser: false,
  governanceRetainsDefaultAdmin: true,
  sourceBasis:
    'FlowStakingVaultV2 constructor _grantRole(PAUSER_ROLE, admin); getRoleAdmin(PAUSER_ROLE) == DEFAULT_ADMIN_ROLE',
} as const;

/**
 * The frozen manifest approves a general 24h TIMELOCK_POLICY that lists "Router
 * registry changes" among delayed actions, but no Router-V4-specific
 * registryActivationDelay value was ever approved as an exact on-chain
 * parameter. Per V30.1F §4 that inference is not permitted.
 */
export const V30_1F_ROUTER_DELAY_STATUS = {
  status: 'ROUTER_DELAY_DECISION_REQUIRED',
  exactApprovedRouterRegistryDelaySeconds: null,
  relatedGeneralDecision: { id: 'TIMELOCK_POLICY', delaySeconds: 86400 },
  inferenceAllowed: false,
  preparedButUnapprovedCalldataHash:
    '0x7b9a7daed26110c3db6932d9e1624d6774893600f573bd767677e87d605f18eb',
} as const;

export const V30_1F_SOURCE_VERIFICATION_STATUS = {
  publiclyVerified: ['FlowBridgeRouterV4', 'FlowBridgeRouterLens', 'FlowStakingRewardTreasury', 'FlowStakingController'],
  verifiedSourcePending: ['FlowToken', 'FlowRewardsMerkleDistributor', 'FlowBridgeActivityRegistry', 'FlowStakingVaultV2'],
  pendingReason: 'EXPLORER_TRANSPORT_BLOCKED (Cloudflare 403 on the verification POST endpoint)',
  bundlesPreservedUnchanged: true,
  sourceOrCompilerModified: false,
  redeployed: false,
  finalReleasePassStillRequiresPublication: true,
} as const;

export const V30_1F_PROHIBITED_ACTIONS_TAKEN = {
  transactionsBroadcast: 0,
  safeTransactionsSigned: 0,
  flowFundedWei: '0',
  stakesCreated: 0,
  rootsOrEpochsPublished: 0,
  oracleConfigurations: 0,
  routerOrBridgeRegistrations: 0,
  routerV4TrafficMigrations: 0,
  activityAttestations: 0,
  liquidityActions: 0,
} as const;

export const V30_1F_GAS_TOTALS = {
  approvedStepGasEstimates: ['46823', '51624', '51636', '51686', '50139'],
  approvedTotalGas: 251908,
  gasPriceWei: '20000000000',
  approvedTotalFeeBOT: '0.00503816',
  unapprovedRouterDelayGas: '47937',
} as const;

export const V30_1F_VERDICT =
  'FLOWBRIDGE V30.1F POST-DEPLOYMENT WIRING GUARDRAILS PREFLIGHT PASS - APPROVED, NOT BROADCAST' as const;
