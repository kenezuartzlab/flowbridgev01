/**
 * FlowBridge V30.1F — F.1 Controller → Vault binding SETTLEMENT record.
 *
 * Read-only verification of the executed Governance Safe transaction. No
 * further transaction was prepared, signed or broadcast in this record; F.2a
 * onward remain awaiting explicit per-transaction approval.
 */

export const V30_1F_F1_SETTLEMENT = {
  step: 'F.1 Controller.setVault(Vault V2)',
  chainId: 677,
  safe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  safeTxHash: '0x140ec170d1f7c2d8e1effa34feb8341413a66f2c532c094f156c1d1eae3b1490',
  executionTxHash: '0xe8ea7f4e013b613e64a46761e80ad7ad7232ab7d6f6ce7d7b081da2a671ad259',
  executor: '0x145e201c658706d3d2b9f35e0c51270474453b2b',
  to: '0x88a4cc1f5771523baeb83daeea07d323a3ce9507',
  value: '0',
  blockNumber: 21376826,
  blockTimestamp: 1788016484,
  receiptStatus: '0x1',
  gasUsed: 106704,
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.00213408',
  innerCall: {
    target: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    selector: '0x6817031b',
    decoded: 'setVault(0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8)',
    calldataHash: '0xa64fc6b587ec4d9239cfafdfbe8f8a339ff5147fad999010ef04158fd0fcb453',
    matchesApprovedPreflight: true,
    safeExecutionSuccess: true,
  },
} as const;

/** Post-execution state proof, observed at block 21,377,652. */
export const V30_1F_F1_POST_STATE = {
  observedAtBlock: 21377652,
  controller: {
    vault: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
    vaultBoundToDeployedVaultV2: true,
    maxFlowPerEpoch: '0',
    weeklyUsdBudget8: '0',
    oracle: '0x0000000000000000000000000000000000000000',
    emergencyMode: false,
    governanceIsGovernor: true,
  },
  vault: {
    totalPrincipal: '0',
    nextPositionId: '0',
    paused: false,
    flowBalance: '0',
  },
  rewardTreasury: {
    flowBalance: '0',
    vaultHasVaultRole: false,
    controllerHasControllerRole: false,
  },
  operationsIsVaultPauser: false,
  economicallyInert: true,
  reason:
    'Binding alone cannot activate staking: reward treasury roles are ungranted, weeklyUsdBudget8 and maxFlowPerEpoch are 0, oracle is unset and no FLOW is funded',
} as const;

export const V30_1F_F1_REMAINING_STEPS = ['F.2a', 'F.2b', 'F.3', 'F.4'] as const;

export const V30_1F_F1_VERDICT =
  'FLOWBRIDGE V30.1F F.1 CONTROLLER VAULT BINDING SETTLED - VERIFIED, NO FURTHER EXECUTION' as const;
