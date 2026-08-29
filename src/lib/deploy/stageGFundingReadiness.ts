/**
 * FlowBridge V30.1G — Funding readiness + source-verification closure.
 *
 * Read-only: records the immutable post-wiring snapshot (F.1–F.4), the public
 * source-verification state observed on scan.botchain.ai, and the two
 * deterministic Treasury Safe ERC-20 funding payloads. Funding stays
 * fail-closed until every contract in a given economic path is publicly
 * source verified, and even then a fresh owner execution approval is required.
 */

export const V30_1G_ADDRESSES = {
  flowToken: '0x535ddda826142ac42ce288154e9595f080940ae9',
  rewardsDistributor: '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
  rewardTreasury: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  stakingController: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  stakingVaultV2: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  activityRegistry: '0xa80d8740f378989F649ca14C54e4B4a42E68753c',
  routerV4: '0x3c6fdaf93F39c72be931AB80196292962ebe6b06',
  routerLens: '0x48338d23640b09acDf0e7246844a9d867DC8205c',
  treasurySafe: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  governanceSafe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  operationsSafe: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
} as const;

/** Immutable post-wiring snapshot, read-only at block 21,389,568 (chain 677). */
export const V30_1G_POST_WIRING_SNAPSHOT = {
  chainId: 677,
  observedAtBlock: 21389568,
  roles: {
    vaultRoleId: '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959',
    controllerRoleId: '0x7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c570223357',
    pauserRoleId: '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
    rewardTreasuryVaultRoleHeldByVault: true,
    rewardTreasuryControllerRoleHeldByController: true,
    vaultPauserHeldByOperationsSafe: true,
    vaultPauserRetainedByGovernanceSafe: true,
    vaultDefaultAdminRetainedByGovernanceSafe: true,
  },
  wiring: {
    controllerVault: V30_1G_ADDRESSES.stakingVaultV2,
    maxFlowPerEpoch: '50000000000000000000000',
    weeklyUsdBudget8: '0',
    oracle: '0x0000000000000000000000000000000000000000',
  },
  economicEmptiness: {
    flowTotalSupply: '1000000000000000000000000000',
    treasurySafeFlowBalance: '1000000000000000000000000000',
    rewardTreasuryFlowBalance: '0',
    rewardTreasuryFreeBalance: '0',
    rewardTreasuryTotalObligations: '0',
    rewardTreasuryReservedGenesis: '0',
    rewardTreasuryReservedFloors: '0',
    rewardTreasuryCommittedEpoch: '0',
    rewardTreasuryAccruedUnclaimed: '0',
    vaultFlowBalance: '0',
    vaultTotalPrincipal: '0',
    vaultNextPositionId: '0',
    vaultPaused: false,
    distributorFlowBalance: '0',
    distributorTotalReserved: '0',
    distributorEpochCount: '0',
  },
  routerBoundary: {
    registryActivationDelay: '0',
    routerCount: '0',
    bridgeCount: '0',
    v3RemainsLiveProductionRouter: true,
    v4TrafficMigrated: false,
  },
} as const;

export type SourceVerificationState = 'PUBLICLY_VERIFIED' | 'SOURCE_PENDING';

/** Public verification state observed on scan.botchain.ai (chain 677). */
export const V30_1G_SOURCE_VERIFICATION: Record<string, SourceVerificationState> = {
  FlowToken: 'SOURCE_PENDING',
  FlowRewardsMerkleDistributor: 'SOURCE_PENDING',
  FlowStakingVaultV2: 'SOURCE_PENDING',
  FlowBridgeActivityRegistry: 'SOURCE_PENDING',
  FlowStakingRewardTreasury: 'PUBLICLY_VERIFIED',
  FlowStakingController: 'PUBLICLY_VERIFIED',
  FlowBridgeRouterV4: 'PUBLICLY_VERIFIED',
  FlowBridgeRouterLens: 'PUBLICLY_VERIFIED',
};

/** Exact result of each preserved-package retry in this gate. */
export const V30_1G_VERIFICATION_RETRIES = [
  {
    contract: 'FlowToken',
    bundleBytes: 183110,
    routes: ['v2 standard-input multipart', 'v1 verifysourcecode urlencoded'],
    result: 'EDGE_BLOCKED_HTTP_403_CLOUDFLARE',
    artifactChanged: false,
  },
  {
    contract: 'FlowRewardsMerkleDistributor',
    bundleBytes: 88281,
    routes: ['v2 standard-input multipart', 'v1 verifysourcecode urlencoded'],
    result: 'EDGE_BLOCKED_HTTP_403_CLOUDFLARE',
    artifactChanged: false,
  },
  {
    contract: 'FlowStakingVaultV2',
    bundleBytes: 67001,
    routes: [
      'v2 standard-input multipart',
      'v1 verifysourcecode urlencoded',
      'v1 verifysourcecode gzip-encoded',
    ],
    result: 'EDGE_BLOCKED_HTTP_403_CLOUDFLARE (gzip passed edge, explorer returned 400 — it does not decode gzip)',
    artifactChanged: false,
  },
  {
    contract: 'FlowBridgeActivityRegistry',
    bundleBytes: 22866,
    routes: ['v1 verifysourcecode urlencoded (accepted, autodetect + explicit constructor args)'],
    result: 'SUBMISSION_ACCEPTED_EXPLORER_REPORTED_FAIL_UNABLE_TO_VERIFY',
    artifactChanged: false,
  },
] as const;

export type FundingPathId = 'REWARDS_1M' | 'STAKING_10M';

export interface FundingPayload {
  readonly id: FundingPathId;
  readonly description: string;
  readonly sourceSafe: string;
  readonly token: string;
  readonly destination: string;
  readonly amountTokenUnits: string;
  readonly selector: '0xa9059cbb';
  readonly calldata: string;
  readonly calldataHash: string;
  readonly value: '0';
  readonly operation: 'CALL';
  readonly simulatedFromSafe: 'OK';
  readonly simulatedGas: string;
  readonly revertsFromDeployerEoa: true;
  readonly requiredConfirmations: 2;
  readonly requiredVerifiedContracts: readonly string[];
  readonly expectedStateDelta: Record<string, string>;
}

export const V30_1G_FUNDING_PAYLOADS: readonly FundingPayload[] = [
  {
    id: 'REWARDS_1M',
    description: 'ERC-20 transfer of 1,000,000 FLOW from Treasury Safe to the Rewards Distributor',
    sourceSafe: V30_1G_ADDRESSES.treasurySafe,
    token: V30_1G_ADDRESSES.flowToken,
    destination: V30_1G_ADDRESSES.rewardsDistributor,
    amountTokenUnits: '1000000000000000000000000',
    selector: '0xa9059cbb',
    calldata:
      '0xa9059cbb0000000000000000000000003824681c3560a63e1c9cedabbfcab2691c5673fb00000000000000000000000000000000000000000000d3c21bcecceda1000000',
    calldataHash: '0xdfb6499dc319e219dd9e8cc847170a8babf6964c2f80539a59cf9abfb3ff2c7d',
    value: '0',
    operation: 'CALL',
    simulatedFromSafe: 'OK',
    simulatedGas: '51714',
    revertsFromDeployerEoa: true,
    requiredConfirmations: 2,
    requiredVerifiedContracts: ['FlowToken', 'FlowRewardsMerkleDistributor'],
    expectedStateDelta: {
      treasurySafeFlow: '-1000000 FLOW',
      distributorFlow: '+1000000 FLOW',
      distributorTotalReserved: '0 (unchanged)',
      distributorEpochCount: '0 (unchanged)',
    },
  },
  {
    id: 'STAKING_10M',
    description:
      'ERC-20 transfer of 10,000,000 FLOW inventory from Treasury Safe to the Staking Reward Treasury',
    sourceSafe: V30_1G_ADDRESSES.treasurySafe,
    token: V30_1G_ADDRESSES.flowToken,
    destination: V30_1G_ADDRESSES.rewardTreasury,
    amountTokenUnits: '10000000000000000000000000',
    selector: '0xa9059cbb',
    calldata:
      '0xa9059cbb000000000000000000000000a861152ca3676bccf7b5fdafb9eb6a57b9d32d0e000000000000000000000000000000000000000000084595161401484a000000',
    calldataHash: '0x875f551af0ac0bfa831823917036181e1a72b59398915354c7d45f2a634fde9d',
    value: '0',
    operation: 'CALL',
    simulatedFromSafe: 'OK',
    simulatedGas: '51726',
    revertsFromDeployerEoa: true,
    requiredConfirmations: 2,
    requiredVerifiedContracts: ['FlowToken', 'FlowStakingVaultV2'],
    expectedStateDelta: {
      treasurySafeFlow: '-10000000 FLOW',
      rewardTreasuryFlow: '+10000000 FLOW',
      rewardTreasuryFreeBalance: '+10000000 FLOW',
      rewardTreasuryReservedGenesis: '0 (unchanged)',
      rewardTreasuryReservedFloors: '0 (unchanged)',
      rewardTreasuryCommittedEpoch: '0 (unchanged)',
      rewardTreasuryAccruedUnclaimed: '0 (unchanged)',
    },
  },
] as const;

/** Frozen Year-1 economics; funding inventory never widens these ceilings. */
export const V30_1G_ECONOMIC_CEILINGS = {
  year1AuthorizedReleaseFlow: '3000000',
  genesisYear1MaxFlow: '1000000',
  standardYear1MaxFlow: '2000000',
  maxFlowPerEpochFlow: '50000',
  epochSeconds: 604800,
  weeklyUsdBudget8: '0',
  oracleConfigured: false,
} as const;

export type FundingReadiness = 'FUNDING_READY' | 'BLOCKED_BY_SOURCE';

export interface FundingGateResult {
  readonly id: FundingPathId;
  readonly readiness: FundingReadiness;
  readonly missingVerification: readonly string[];
  readonly executable: false | true;
  readonly requiresFreshOwnerApproval: true;
}

/**
 * Fail-closed funding gate: a path is executable only when every contract in
 * its economic path is publicly verified AND the owner supplies a fresh
 * execution approval for that specific transfer.
 */
export function evaluateFundingPath(
  payload: FundingPayload,
  verification: Record<string, SourceVerificationState> = V30_1G_SOURCE_VERIFICATION,
  freshOwnerApproval = false,
): FundingGateResult {
  const missingVerification = payload.requiredVerifiedContracts.filter(
    (c) => verification[c] !== 'PUBLICLY_VERIFIED',
  );
  const readiness: FundingReadiness =
    missingVerification.length === 0 ? 'FUNDING_READY' : 'BLOCKED_BY_SOURCE';
  return {
    id: payload.id,
    readiness,
    missingVerification,
    executable: readiness === 'FUNDING_READY' && freshOwnerApproval,
    requiresFreshOwnerApproval: true,
  };
}

export const V30_1G_BROADCAST_LEDGER = {
  transactionsSigned: 0,
  transactionsBroadcast: 0,
  flowTransferred: '0',
  roleChanges: 0,
  configurationWrites: 0,
  registryEntriesAdded: 0,
} as const;

export const V30_1G_VERDICT =
  'FLOWBRIDGE V30.1G FUNDING READINESS SOURCE VERIFICATION CLOSURE PASS - PREPARED, NOT FUNDED' as const;
