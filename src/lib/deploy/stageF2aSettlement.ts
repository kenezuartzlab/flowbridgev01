/**
 * FlowBridge V30.1F — F.2a settlement record (read-only verification).
 * RewardTreasury.grantRole(VAULT_ROLE, Vault V2) executed by the Governance Safe.
 */

export const V30_1F_F2A_SETTLEMENT = {
  step: 'F.2a RewardTreasury.grantRole(VAULT_ROLE, Vault V2)',
  chainId: 677,
  safe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  safeTxHash: '0xb70e59288e1777fed66e5b9a84711391f757b5b651e8382d60943cc2897d5ed9',
  executionTxHash: '0xa84f943f61477f385ff9952eab1dcd031d18af65ca61387d5d10d6e1af592968',
  blockNumber: 21381120,
  receiptStatus: '0x1',
  gasUsed: '94677',
  effectiveGasPriceWei: '20000000000',
  feeBOT: '0.00189354',
  target: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  value: '0',
  innerCalldataMatchesApproved: true,
  approvedCalldataHash:
    '0x654e20c094b56d28f011a2d26fec00e2de4c865a2d9f614eb94bf5aeb1f4f8ce',
} as const;

export const V30_1F_F2A_POST_STATE = {
  vaultHasVaultRole: true,
  controllerHasControllerRole: false,
  treasuryFlowBalance: '0',
  reservedGenesis: '0',
  reservedFloors: '0',
  committedEpoch: '0',
  accruedUnclaimed: '0',
  totalObligations: '0',
  freeBalance: '0',
  vaultPaused: false,
  controllerVault: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  economicallyInert: true,
} as const;

export const V30_1F_F2A_SETTLEMENT_VERDICT =
  'FLOWBRIDGE V30.1F F.2a SETTLED - VAULT_ROLE GRANTED, ECONOMICALLY INERT' as const;
