/** V1.10 owner architecture record. Research metadata only: no execution or deployment authority. */
export const CUSTOM_BNB_ARCHITECTURE = Object.freeze({
  status: 'OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS',
  chainId: 56,
  candidateDirectory: 'contracts/candidates/bnb-swap-adapter-v1-6',
  candidateSourceSha256: '8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a',
  executionEnabled: false,
  deployed: false,
  productionApproved: false,
  independentAudit: 'NOT_DONE',
  feeRateApproved: false,
  feeRecipientApproved: false,
  poolSelection: 'SINGLE_IMMUTABLE_POOL_FEE',
  dynamicBestPoolRouting: false,
  onchainPause: false,
  uiKillSwitchStopsDirectCalls: false,
  donationRecovery: false,
  zeroExDiagnostics: 'ADMIN_ONLY_READ_ONLY',
  botExecutionChanged: false,
  xaut: 'BLOCKED',
} as const);

export type CustomLaunchGate = Readonly<{
  id: string;
  requirement: string;
  state: 'EVIDENCE_COMPLETE' | 'HOLD';
  blocker?: string;
}>;

/** A source-freeze milestone is evidence, never a launch pass. Every other gate remains held. */
export const CUSTOM_LAUNCH_GATES: readonly CustomLaunchGate[] = Object.freeze([
  { id: 'source-freeze', requirement: 'Reproduce the exact V1.6 source, compiler, ABI and bytecode hashes.', state: 'EVIDENCE_COMPLETE' },
  { id: 'independent-audit', requirement: 'Independent third-party audit, fixes in a new frozen candidate if needed, and re-audit.', state: 'HOLD', blocker: 'No independent auditor engaged; six Slither HIGH traces remain open.' },
  { id: 'route-design', requirement: 'Choose audited single-pool or separately frozen allowlisted 500/2500 per-quote pool design.', state: 'HOLD', blocker: 'V1.6 cannot dynamically select the better verified pool.' },
  { id: 'fee-treasury', requirement: 'Separate owner approval of exact BNB fee rate and chain-56 treasury address.', state: 'HOLD', blocker: 'Neither fee rate nor recipient is approved.' },
  { id: 'emergency-policy', requirement: 'Owner governance and emergency-response policy addressing the absence of on-chain pause.', state: 'HOLD', blocker: 'UI controls cannot stop direct contract calls.' },
  { id: 'execution-policy', requirement: 'Slippage, deadline, order-size and MEV-protection policy.', state: 'HOLD', blocker: 'Research limits are not owner-approved execution policy.' },
  { id: 'legal-liquidity-rpc', requirement: 'Token issuer/legal review, sustained pool liquidity and independent RPC quorum.', state: 'HOLD', blocker: 'USDT issuer/legal risk and same-operator RPC observations remain open.' },
  { id: 'dependencies', requirement: 'Remediate or explicitly risk-accept current production dependency advisories.', state: 'HOLD', blocker: 'Fresh dependency scan must be attached to the release review.' },
  { id: 'rehearsal-wallets', requirement: 'Approved local/testnet rehearsal plus physical mobile-wallet signing and rejection checks.', state: 'HOLD', blocker: 'No funded rehearsal or physical-wallet acceptance.' },
  { id: 'deployment-canary', requirement: 'Separately authorized chain-56 deployment, multisig verification and capped canary.', state: 'HOLD', blocker: 'No deployment, multisig verification or canary authorization.' },
]);

export const customLaunchBlockers = () => CUSTOM_LAUNCH_GATES.filter((gate) => gate.state === 'HOLD');
