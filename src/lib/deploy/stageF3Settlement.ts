/**
 * FlowBridge V30.1F — F.3 settlement record + F.4 precheck (read-only verification).
 * Vault V2.grantRole(PAUSER_ROLE, Operations Safe) via Governance Safe.
 */

export const V30_1F_F3_SETTLEMENT = {
  step: 'F.3 FlowStakingVaultV2.grantRole(PAUSER_ROLE, Operations Safe)',
  chainId: 677,
  safe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  executionTxHash: '0xd7e69b7ae038d8778276b63634c7ce4881fc324e8feb5ec59e83f3ebd40259fd',
  blockNumber: 21385719,
  receiptStatus: '0x1',
  gasUsed: '94739',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.00189478',
  target: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  value: '0',
  roleGrantedEventObserved: true,
  pauserRoleId:
    '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
  grantee: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
  approvedCalldataHash:
    '0xa65a9a60b7e05f98a6d6126c58042a2708ef0e245c2beebe07e9dbd476bf494e',
} as const;

/** F.4 pre-execution revalidation, read at block 21,386,144 (chain 677). */
export const V30_1F_F4_PRECHECK = {
  observedAtBlock: 21386144,
  controller: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
  controllerVault: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  treasuryHasVaultRoleForVault: true,
  treasuryHasControllerRoleForController: true,
  operationsHasPauser: true,
  governanceHasPauser: true,
  currentMaxFlowPerEpoch: '0',
  currentWeeklyUsdBudget8: '0',
  oracleUnset: true,
  emergencyMode: false,
  treasuryFlowBalance: '0',
  vaultFlowBalance: '0',
  totalPrincipal: '0',
  nextPositionId: '0',
  vaultPaused: false,
  approvedCalldata:
    '0x5181ecd30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a968163f0a57b400000',
  approvedCalldataHash:
    '0x9410508219448179db1408fa9683ada69b8811f84238d609ffd3fc06b2ad8da5',
  simulatedGas: '50139',
  simulatesOkFromSafe: true,
  revertsFromDeployerEoa: true,
  executionBlocker: 'GOVERNANCE_SAFE_SIGNERS_UNAVAILABLE',
} as const;

export const V30_1F_F3_SETTLEMENT_VERDICT =
  'FLOWBRIDGE V30.1F F.3 SETTLED - OPERATIONS PAUSER GRANTED, GOVERNANCE ADMIN RETAINED' as const;
