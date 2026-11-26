// Pure read-only identity classification. No RPC transport, signer, calldata construction or role configuration.
import { getAddress } from 'viem';
import { FIXED_PROTOCOL_TARGETS } from './launchReadiness';

export const READ_ONLY_RPC_METHODS = [
  'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getStorageAt',
] as const;
export type ReadOnlyRpcMethod = typeof READ_ONLY_RPC_METHODS[number];
export type AddressVerificationStatus = 'OWNER_PROVIDED_UNVERIFIED' | 'VERIFIED_EOA' | 'VERIFIED_CONTRACT_NON_SAFE' | 'VERIFIED_SAFE' | 'UNVERIFIED';
export type SafeProbe = {
  ownersCount: number;
  ownersHash: `0x${string}`;
  ownersValid: boolean;
  threshold: number;
  version: string;
  domainSeparator: `0x${string}`;
  safeChainId: number;
  implementation: string | null;
  handler: string | null;
};
export type EndpointAddressObservation = {
  endpointId: string;
  chainId: number | null;
  blockNumber: number | null;
  blockHash: string | null;
  codeHash: string | null;
  codeBytes: number | null;
  safe: SafeProbe | null;
  safeError: 'NOT_SAFE' | 'INCONCLUSIVE' | null;
  rpcError: string | null;
};
export type AddressInputAssessment = {
  input: string;
  canonical: string | null;
  checksumStatus: 'VALID' | 'NOT_CHECKSUMMED' | 'INVALID' | 'MALFORMED';
  checksumCorrected: boolean;
  forbiddenProtocolTarget: boolean;
};

export function assertReadOnlyRpcMethod(method: string): asserts method is ReadOnlyRpcMethod {
  if (!(READ_ONLY_RPC_METHODS as readonly string[]).includes(method)) throw new Error(`FORBIDDEN_RPC_METHOD:${method}`);
}

export function assessAddressInput(input: string): AddressInputAssessment {
  let canonical: string | null = null;
  try { canonical = getAddress(input); } catch { /* malformed remains unverified */ }
  const body = input.slice(2);
  const checksumStatus = !canonical ? 'MALFORMED'
    : input === canonical ? 'VALID'
      : /^0x(?:[0-9a-f]{40}|[0-9A-F]{40})$/.test(input) ? 'NOT_CHECKSUMMED' : 'INVALID';
  return {
    input, canonical, checksumStatus, checksumCorrected: canonical !== null && input !== canonical,
    forbiddenProtocolTarget: canonical !== null && Object.values(FIXED_PROTOCOL_TARGETS).some((target) => target.toLowerCase() === canonical!.toLowerCase()),
  };
}

function safeMatches(a: SafeProbe, b: SafeProbe) {
  return a.ownersCount === b.ownersCount && a.ownersHash === b.ownersHash && a.threshold === b.threshold
    && a.version === b.version && a.domainSeparator === b.domainSeparator && a.safeChainId === b.safeChainId
    && a.implementation?.toLowerCase() === b.implementation?.toLowerCase() && a.handler?.toLowerCase() === b.handler?.toLowerCase();
}
function validSafe(s: SafeProbe, chainId: number) {
  return s.ownersValid && s.ownersCount > 0 && Number.isInteger(s.threshold) && s.threshold >= 1 && s.threshold <= s.ownersCount
    && s.version.length > 0 && /^0x[0-9a-fA-F]{64}$/.test(s.domainSeparator) && s.safeChainId === chainId;
}

export function classifyObservedAddress(input: string, observations: readonly EndpointAddressObservation[]): {
  status: AddressVerificationStatus;
  canonical: string | null;
  reasons: string[];
  threshold: number | null;
  ownersCount: number | null;
  ownersHash: `0x${string}` | null;
} {
  const assessed = assessAddressInput(input);
  const reasons = new Set<string>();
  if (assessed.checksumCorrected) reasons.add('CHECKSUM_CORRECTED_TO_EIP55');
  if (assessed.checksumStatus === 'MALFORMED') reasons.add('MALFORMED_ADDRESS');
  if (assessed.canonical === '0x0000000000000000000000000000000000000000') reasons.add('ZERO_ADDRESS');
  if (assessed.forbiddenProtocolTarget) reasons.add('FORBIDDEN_PROTOCOL_TARGET');
  if (!assessed.canonical || observations.length < 2) reasons.add('INSUFFICIENT_INDEPENDENT_OBSERVATIONS');
  if (observations.some((o) => o.rpcError || o.chainId !== 56 || o.blockNumber === null || !o.blockHash || o.codeBytes === null)) reasons.add('RPC_OR_CHAIN_OBSERVATION_UNAVAILABLE');
  const [a, b] = observations;
  if (a && b) {
    if (a.blockNumber !== b.blockNumber || a.blockHash !== b.blockHash) reasons.add('BLOCK_CONSENSUS_MISMATCH');
    if (a.codeHash !== b.codeHash || a.codeBytes !== b.codeBytes) reasons.add('CODE_CONSENSUS_MISMATCH');
    if (a.chainId !== b.chainId) reasons.add('CHAIN_MISMATCH');
  }
  let status: AddressVerificationStatus = 'UNVERIFIED';
  let threshold: number | null = null, ownersCount: number | null = null, ownersHash: `0x${string}` | null = null;
  const hasFatalReason = [...reasons].some((reason) => reason !== 'CHECKSUM_CORRECTED_TO_EIP55');
  if (assessed.canonical && !assessed.forbiddenProtocolTarget && a && b && !hasFatalReason) {
    if (a.codeBytes === 0 && b.codeBytes === 0) status = 'VERIFIED_EOA';
    else if (a.codeBytes! > 0 && b.codeBytes! > 0 && a.safe && b.safe && safeMatches(a.safe, b.safe)
      && validSafe(a.safe, 56) && validSafe(b.safe, 56)) {
      status = 'VERIFIED_SAFE'; threshold = a.safe.threshold; ownersCount = a.safe.ownersCount; ownersHash = a.safe.ownersHash;
    } else if (a.safeError === 'NOT_SAFE' && b.safeError === 'NOT_SAFE') status = 'VERIFIED_CONTRACT_NON_SAFE';
    else reasons.add('SAFE_COMPATIBILITY_INCONCLUSIVE');
  }
  if (status === 'UNVERIFIED' && !hasFatalReason && assessed.canonical && observations.length >= 2 && a?.codeBytes !== 0) reasons.add('SAFE_COMPATIBILITY_INCONCLUSIVE');
  return { status, canonical: assessed.canonical, reasons: [...reasons], threshold, ownersCount, ownersHash };
}

export function assessSafePolicy(guardian: { status: AddressVerificationStatus; threshold: number | null; ownersHash?: string | null }, treasury: { status: AddressVerificationStatus; threshold: number | null; ownersHash?: string | null }, canonicalGuardian: string | null, canonicalTreasury: string | null) {
  const reasons: string[] = [];
  if (!canonicalGuardian || !canonicalTreasury || canonicalGuardian.toLowerCase() === canonicalTreasury.toLowerCase()) reasons.push('ROLES_NOT_DISTINCT');
  for (const [role, value] of [['GUARDIAN', guardian], ['TREASURY', treasury]] as const) {
    if (value.status !== 'VERIFIED_SAFE') reasons.push(`${role}_NOT_VERIFIED_SAFE`);
    if (value.threshold === null || value.threshold < 2) reasons.push(`${role}_THRESHOLD_BELOW_2`);
  }
  if (guardian.ownersHash && treasury.ownersHash && guardian.ownersHash === treasury.ownersHash) reasons.push('OWNERS_OVERLAP_FULLY');
  return {
    status: reasons.length ? 'FAILS_SAFE_POLICY' as const : 'READY_FOR_HUMAN_REVIEW' as const,
    reasons,
    recommendation: reasons.length ? 'Create or retarget separate BNB56 Safe multisigs with threshold >=2 through a separately authorized deployment-planning gate; do not relax policy silently.' : 'Human review and explicit deployment-gate approval still required.',
    canConfigureRoles: false as const,
  };
}
