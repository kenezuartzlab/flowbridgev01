/**
 * FlowBridge V30.1F — F.2b settlement record (read-only verification).
 * RewardTreasury.grantRole(CONTROLLER_ROLE, Staking Controller) via Governance Safe.
 */

export const V30_1F_F2B_SETTLEMENT = {
  step: 'F.2b RewardTreasury.grantRole(CONTROLLER_ROLE, Controller)',
  chainId: 677,
  safe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  executionTxHash: '0x73ba131f8c9604ec121d9637a1bc5b6bd5558dc3cf4cd1f37c9769a3e61eecb0',
  blockNumber: 21383715,
  receiptStatus: '0x1',
  gasUsed: '94689',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.00189378',
  target: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  value: '0',
  roleGrantedEventObserved: true,
  approvedCalldataHash:
    '0x8d12af939d82a4a461b73add4e847e0092ee811c20619e855ef6845e25b84a1c',
} as const;

export const V30_1F_F2B_POST_STATE = {
  controllerHasControllerRole: true,
  vaultHasVaultRole: true,
  treasuryFreeBalance: '0',
  economicallyInert: true,
} as const;

/** F.3 pre-execution revalidation, read at block 21,384,017 (chain 677). */
export const V30_1F_F3_PRECHECK = {
  observedAtBlock: 21384017,
  vault: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  pauserRoleIdFromDeployedVault:
    '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
  operationsHasPauser: false,
  governanceHasPauser: true,
  governanceHasDefaultAdmin: true,
  vaultPaused: false,
  totalPrincipal: '0',
  nextPositionId: '0',
  vaultFlowBalance: '0',
  simulatedGas: '51686',
  approvedCalldata:
    '0x2f2ff15d65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a0000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef',
  approvedCalldataHash:
    '0xa65a9a60b7e05f98a6d6126c58042a2708ef0e245c2beebe07e9dbd476bf494e',
  revokeGovernancePauser: false,
  executionBlocker: 'GOVERNANCE_SAFE_SIGNERS_UNAVAILABLE',
} as const;

export const V30_1F_F2B_SETTLEMENT_VERDICT =
  'FLOWBRIDGE V30.1F F.2b SETTLED - CONTROLLER_ROLE GRANTED, ECONOMICALLY INERT' as const;
