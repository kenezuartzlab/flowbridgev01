/**
 * FlowBridge V30.1F — F.2a RewardTreasury.grantRole(VAULT_ROLE, Vault V2)
 * IMMEDIATE-PRE-EXECUTION REVALIDATION record.
 *
 * Read-only. The role id is read from the deployed Reward Treasury, the
 * calldata is re-encoded from that on-chain value and hashed, and the call is
 * simulated from the Governance Safe. Nothing was signed or broadcast: the
 * Governance Safe owner keys are not available to this environment.
 */

export const V30_1F_F2A_REVALIDATION = {
  step: 'F.2a RewardTreasury.grantRole(VAULT_ROLE, Vault V2)',
  chainId: 677,
  rpcChainIdMatches: true,
  observedAtBlock: 21379493,
  gasPriceWei: '20000000000',
  safe: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  target: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
  selector: '0x2f2ff15d',
  vaultRoleReadFromContract:
    '0x31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d959',
  grantee: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
  calldata:
    '0x2f2ff15d31e0210044b4f6757ce6aa31f9c6e8d4896d24a755014887391a926c5224d9590000000000000000000000003cc0799fb4169a9bb5da9812bea23cba97b989c8',
  calldataHash: '0x654e20c094b56d28f011a2d26fec00e2de4c865a2d9f614eb94bf5aeb1f4f8ce',
  matchesApprovedCalldataHash: true,
  value: '0',
  simulation: 'OK',
  gasEstimate: '51624',
  estimatedFeeBOT: '0.00103248',
  deployerCanCall: false,
  deployerRevertReason: 'AccessControlUnauthorizedAccount(deployer, DEFAULT_ADMIN_ROLE)',
} as const;

/** Preconditions re-read immediately before the handoff. */
export const V30_1F_F2A_PRECONDITIONS = {
  treasuryToken: '0x535dDDA826142AC42cE288154e9595f080940aE9',
  recoveryRecipient: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  governanceIsDefaultAdmin: true,
  vaultHasVaultRole: false,
  controllerRoleId: '0x7b765e0e932d348852a6f810bfa1ab891e259123f02db8cdcde614c570223357',
  flowBalance: '0',
  reservedGenesis: '0',
  reservedFloors: '0',
  committedEpoch: '0',
  accruedUnclaimed: '0',
  totalObligations: '0',
  freeBalance: '0',
  allPreconditionsMatchApproval: true,
} as const;

export const V30_1F_F2A_EXPECTED_POST_STATE = {
  vaultHasVaultRole: true,
  bucketsRemainZero: true,
  createsSpendableRewards: false,
  activatesStaking: false,
  reason:
    'Every vault path into the treasury (reserveGenesis, reserveFloor, commitEpoch) is bounded by freeBalance(), which is 0 while the treasury holds no FLOW',
} as const;

export const V30_1F_F2A_EXECUTION_STATUS = {
  status: 'GOVERNANCE_SAFE_SIGNERS_UNAVAILABLE',
  transactionsBroadcast: 0,
  safeTransactionsSigned: 0,
  reason:
    'F.2a is DEFAULT_ADMIN_ROLE-gated to the 2-of-3 Governance Safe; no Safe owner key is present in this environment',
  handoff:
    'Execute the exact payload above from the Governance Safe, then return the Safe transaction hash and execution transaction hash for read-only settlement verification',
} as const;

export const V30_1F_F2A_VERDICT =
  'FLOWBRIDGE V30.1F F.2a REVALIDATED - EXACT MATCH, AWAITING GOVERNANCE SAFE EXECUTION' as const;
