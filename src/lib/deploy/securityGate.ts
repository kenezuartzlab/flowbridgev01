/**
 * FlowBridge V30.1B — smart-contract production security gate.
 *
 * Pure, descriptive and fail-closed. It records the audited findings, the
 * authority matrix and the deployability evidence produced by the isolated
 * audit workspace. It never compiles, deploys, signs or broadcasts anything.
 */

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingStatus = 'FIXED_IN_SOURCE' | 'ACCEPTED_DOCUMENTED' | 'OPEN_BLOCKER';

export interface SecurityFinding {
  id: string;
  contractId: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  status: FindingStatus;
  evidence: string;
}

/** EIP-170 deployed-code limit. */
export const EIP170_LIMIT_BYTES = 24_576;

export interface DeployedSizeMeasurement {
  contractId: string;
  deployedBytes: number;
  creationSha256: string;
  runtimeSha256: string;
  normalizedAbiSha256: string;
}

/**
 * Measured in the isolated audit workspace (solc 0.8.20, viaIR, EVM shanghai;
 * Router optimizer runs 200, all other candidates runs 1).
 */
export const DEPLOYED_SIZE_MEASUREMENTS: readonly DeployedSizeMeasurement[] = [
  {
    // V30.1B.1 size-safe candidate (runtime code is the EIP-170 subject).
    contractId: 'FlowBridgeRouterV4',
    deployedBytes: 19_720,
    creationSha256: '7dc0c1869a3eab59afae396294256b3d968a00de33e0554be9c6b63c30ff1195',
    runtimeSha256: '93a922d67c281bf076d87bcf71de186f0998a8feb9c3dccafe592d097000a0f9',
    normalizedAbiSha256: '913ace626b49a5e32b24457bf0fc6982ecca2fbfdcafff6d616ab67fc095d6df',
  },
  {
    contractId: 'FlowBridgeRouterLens',
    deployedBytes: 7_829,
    creationSha256: 'c075879e896baaf0ce61f3c15f11313753d75b77d9dfc4a9795e0c28aaea319b',
    runtimeSha256: '05cde1794ef1620af4248deebb92680d1b806e534dd99ee5f5c8b4603dea6ca3',
    normalizedAbiSha256: '0ee994f33acf1df22e0fd5e558f757d83e0f9913663bf596ef0044dc02dc7042',
  },
  {
    contractId: 'FlowBridgeActivityRegistry',
    deployedBytes: 2_761,
    creationSha256: '89d143d35f07f64f27fd71e3bc84c63dd4d6490c3fd1e3ddc2d102567322afec',
    runtimeSha256: '5004d356f9d7e459524c9bba8a5dc2dca6cc98ff95d6eafc0b7b9cabb08a84f3',
    normalizedAbiSha256: 'e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d',
  },
  {
    contractId: 'FlowBridgeBridgeAdapterV1',
    deployedBytes: 12_660,
    creationSha256: 'c27d23ab320cfe1b1d9d08b80997e1ad9e29cf969720bf59da56d9f5560c6c26',
    runtimeSha256: '8a5dad06a1a8a7e49f134091ad3a574e61c061b2515a4c16800b2659aa0fdaae',
    normalizedAbiSha256: 'c3a9d345a8c471e9db8a2d63480772707636476e6b45fb7453894a138170cc30',
  },
] as const;

export function exceedsEip170(contractId: string): boolean {
  const m = DEPLOYED_SIZE_MEASUREMENTS.find((e) => e.contractId === contractId);
  return m ? m.deployedBytes > EIP170_LIMIT_BYTES : true; // unknown fails closed
}

/** Hardened source hashes after the V30.1B / V30.1B.1 edits. */
export const V30_1B_SOURCE_SHA256: Readonly<Record<string, string>> = {
  FlowBridgeRouterV4: 'bb43445af143d8c4a36fd144315c2d99f13fe28c73eca63c4f3736709e3ba905',
  FlowBridgeRouterLens: '8a5e1c842d6177b380c93b6670eb8e47ef58f00eb5e10bcc4508a3b16ff71aa2',
};

export const SECURITY_FINDINGS: readonly SecurityFinding[] = [
  {
    id: 'V30.1B-R1',
    contractId: 'FlowBridgeRouterV4',
    severity: 'CRITICAL',
    title: 'Deployed bytecode exceeded the EIP-170 contract size limit',
    detail:
      'At the frozen build line (solc 0.8.20, optimizer runs 200, viaIR, shanghai) the V30.1B candidate measured 29,074 creation bytes and 28,703 deployed/runtime bytes, above the 24,576-byte EIP-170 limit. Fixed in V30.1B.1 by removing the non fee-bound legacy swap wrappers, the already-disabled bridge proxy execution surface and the read-only discovery/quote helpers (served by the Lens), and by converting revert strings to custom errors: 20,020 creation bytes and 19,720 runtime bytes, 4,856 bytes of headroom, with every execution-safety invariant preserved.',
    status: 'FIXED_IN_SOURCE',
    evidence: 'src/lib/deploy/routerSizeGate.ts; contracts/production/router-v4/test/V30_1B1_SizeSafe.t.sol (19 acceptance/adversarial tests).',
  },
  {
    id: 'V30.1B-R2',
    contractId: 'FlowBridgeRouterV4',
    severity: 'HIGH',
    title: 'Material integration mutations did not re-arm the activation delay',
    detail:
      'updateRouterWrappedNative, updateBridgeSupportedTokens, setBridgeTokenResource, setBridgeSupportsBotGas and setBridgeProxyExecutionEnabled required deactivation but left the original activation timestamp, so the owner could mutate a route and re-activate it in the same block. Fixed: every material mutation now re-arms the delay and emits IntegrationActivationScheduled. Lowering registryActivationDelay still cannot accelerate a pending activation because activation times are absolute.',
    status: 'FIXED_IN_SOURCE',
    evidence: 'contracts/production/router-v4/test/V30_1B_Hardening.t.sol — 4 activation-delay regressions.',
  },
  {
    id: 'V30.1B-R3',
    contractId: 'FlowBridgeRouterV4',
    severity: 'MEDIUM',
    title: 'Privileged rescue functions and owner-controlled fees',
    detail:
      'rescueERC20/rescueNative and the fee configuration are owner-only by design. Accepted only under an approved multisig/timelock owner; fee-bound safe swap variants and feeConfigNonce protect users from fee changes mid-quote.',
    status: 'ACCEPTED_DOCUMENTED',
    evidence: 'test_SafeSwapRejectsFeeChange, test_BridgeFeeNonceProtectsQuote.',
  },
  {
    id: 'V30.1B-L1',
    contractId: 'FlowBridgeRouterLens',
    severity: 'MEDIUM',
    title: 'Ambiguous no-route result and unvalidated router target',
    detail:
      'getBestV2Rate returned routerId 0 with amountOut 0 when no active V2 route quoted, indistinguishable from a genuine route 0 quote of zero; the constructor also accepted a non-contract target. Fixed: findBestV2Rate returns an explicit found flag, the constructor requires deployed code, and getRoutersPage/getBridgesPage provide bounded discovery.',
    status: 'FIXED_IN_SOURCE',
    evidence: 'test_LensExplicitNoRouteSignal, test_LensRejectsNonContractTarget, test_LensBoundedPages*.',
  },
  {
    id: 'V30.1B-A1',
    contractId: 'FlowBridgeActivityRegistry',
    severity: 'INFO',
    title: 'Append-only attestation with separated roles verified',
    detail:
      'uint256 sourceLogIndex, canonical activity id, duplicate rejection, admin/attester/pauser separation, revocation and pause behaviour all hold; a compromised attester can record activity but cannot create entitlement because rewards are not derived from registry writes.',
    status: 'ACCEPTED_DOCUMENTED',
    evidence: '27 passing Solidity acceptance tests plus the supplied ABI policy checker.',
  },
  {
    id: 'V30.1B-D1',
    contractId: 'FlowRewardsDistributor',
    severity: 'CRITICAL',
    title: 'Cumulative EIP-712 entitlements have no enforceable solvency reservation',
    detail:
      'Authorizations are signed off-chain against cumulative amounts; the contract has no on-chain budget, reservation or epoch root, so outstanding obligations can exceed funded balance and withdrawFunding cannot distinguish reserved from unallocated FLOW. Requires one canonical design decision (enforceable reservations, or a budgeted Merkle/epoch design) plus approved economics before mainnet.',
    status: 'OPEN_BLOCKER',
    evidence: 'Source review of claim/withdrawFunding paths; no reservation state exists.',
  },
  {
    id: 'V30.1B-S1',
    contractId: 'FlowStakingVault',
    severity: 'HIGH',
    title: 'Staking v1 strands unearned emissions and division remainders',
    detail:
      'v1 remains TESTNET_ONLY / DEPRECATED: unearned emission funding and integer-division remainders can be stranded in the vault with no governed sweep path. Excluded from mainnet promotion; staking v2 is a separate gate.',
    status: 'OPEN_BLOCKER',
    evidence: 'Source review of reward accounting; contract stays excluded from the mainnet registry.',
  },
  {
    id: 'V30.1B-B1',
    contractId: 'FlowBridgeBridgeAdapterV1',
    severity: 'HIGH',
    title: 'Mainnet adapter execution blocked pending refund/recovery rehearsal',
    detail:
      'Local smoke, adversarial, randomized accounting and gateway reentrancy evidence all pass, but the official-gateway refund → adapter → user recovery rehearsal has not been performed with real counterparties. Mainnet adapter execution stays disabled.',
    status: 'OPEN_BLOCKER',
    evidence: 'V30.1A.2 adapter script evidence; adapter source unchanged in V30.1B.',
  },
  {
    id: 'V30.1B-T1',
    contractId: 'FlowToken',
    severity: 'INFO',
    title: 'Fixed-supply freeze verified',
    detail:
      'Constructor-only mint, no owner, minter, tax, blacklist, rebase, proxy or transfer hooks. Exact supply and treasury remain external approved deployment inputs.',
    status: 'ACCEPTED_DOCUMENTED',
    evidence: 'Source review; no mint/burn/authority surface after construction.',
  },
  {
    id: 'V30.1B-X1',
    contractId: 'ALL',
    severity: 'MEDIUM',
    title: 'Slither/static analyzer unavailable in this environment',
    detail:
      'No slither, solc or forge binary is installable in the build sandbox. Compensating evidence: pinned isolated rebuild, 44 passing Solidity tests including new adversarial regressions, EIP-170 size measurement, ABI policy checks and selector-parity verification. An external Slither run remains a required release input.',
    status: 'OPEN_BLOCKER',
    evidence: 'Tool probe in the isolated workspace; documented limitation.',
  },
  {
    id: 'V30.1B-G1',
    contractId: 'ALL',
    severity: 'CRITICAL',
    title: 'No approved production governance owner',
    detail:
      'Every candidate needs an approved multisig/timelock owner address (and, for the registry, delayed admin governance). No such address has been approved, so ownership cannot be assigned and mainnet promotion stays blocked.',
    status: 'OPEN_BLOCKER',
    evidence: 'contracts/OWNER_APPROVAL_SHEET.md carries no approved production governance address.',
  },
] as const;

export interface AuthorityMatrixRow {
  contractId: string;
  role: string;
  holder: 'APPROVED_MULTISIG_REQUIRED' | 'SERVER_SECRET' | 'NONE' | 'USER';
  capabilities: readonly string[];
  cannot: readonly string[];
}

export const AUTHORITY_MATRIX: readonly AuthorityMatrixRow[] = [
  {
    contractId: 'FlowBridgeRouterV4',
    role: 'owner (Ownable2Step)',
    holder: 'APPROVED_MULTISIG_REQUIRED',
    capabilities: ['register/activate integrations', 'set fees within ceilings', 'pause', 'rescue stray tokens'],
    cannot: ['mint FLOW', 'accelerate a pending activation', 'exceed the 10% absolute fee ceiling', 'enable bridge proxy execution on mainnet'],
  },
  {
    contractId: 'FlowBridgeRouterLens',
    role: 'none',
    holder: 'NONE',
    capabilities: ['read-only discovery and quoting'],
    cannot: ['write state', 'hold funds', 'execute swaps or bridges'],
  },
  {
    contractId: 'FlowBridgeActivityRegistry',
    role: 'admin / attester / pauser',
    holder: 'APPROVED_MULTISIG_REQUIRED',
    capabilities: ['rotate attesters', 'pause attestation', 'append activity records'],
    cannot: ['mutate or delete records', 'hold funds', 'create reward entitlement'],
  },
  {
    contractId: 'FlowRewardsDistributor',
    role: 'owner + rewardSigner',
    holder: 'APPROVED_MULTISIG_REQUIRED',
    capabilities: ['rotate signer', 'pause claims', 'withdraw unallocated funding'],
    cannot: ['mint FLOW', 'reduce an already claimed amount', 'forge a user signature'],
  },
  {
    contractId: 'FLOW_REWARD_SIGNER_PRIVATE_KEY',
    role: 'reward authorization signer',
    holder: 'SERVER_SECRET',
    capabilities: ['sign cumulative claim authorizations server-side'],
    cannot: ['move treasury funds', 'change contract owner', 'appear in any client bundle or /sets output'],
  },
  {
    contractId: 'FlowToken',
    role: 'none after construction',
    holder: 'NONE',
    capabilities: ['standard ERC-20 + permit transfers by holders'],
    cannot: ['mint', 'burn by authority', 'blacklist', 'rebase', 'tax'],
  },
] as const;

export interface SecurityGateVerdict {
  pass: boolean;
  openBlockerIds: readonly string[];
  fixedIds: readonly string[];
  reasons: readonly string[];
}

/** Fail-closed: any OPEN_BLOCKER or any oversized candidate blocks the gate. */
export function evaluateSecurityGate(): SecurityGateVerdict {
  const open = SECURITY_FINDINGS.filter((f) => f.status === 'OPEN_BLOCKER');
  const fixed = SECURITY_FINDINGS.filter((f) => f.status === 'FIXED_IN_SOURCE');
  const reasons = open.map((f) => `${f.id} (${f.contractId}): ${f.title}`);

  for (const m of DEPLOYED_SIZE_MEASUREMENTS) {
    if (m.deployedBytes > EIP170_LIMIT_BYTES) {
      reasons.push(`${m.contractId}: deployed size ${m.deployedBytes} exceeds EIP-170 limit ${EIP170_LIMIT_BYTES}.`);
    }
  }

  return {
    pass: open.length === 0 && reasons.length === 0,
    openBlockerIds: open.map((f) => f.id),
    fixedIds: fixed.map((f) => f.id),
    reasons,
  };
}
