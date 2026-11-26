import { describe, expect, it } from 'vitest';
import { getAddress, keccak256, toBytes } from 'viem';
import { assessAddressInput, assessSafePolicy, assertReadOnlyRpcMethod, classifyObservedAddress, type EndpointAddressObservation, type SafeProbe } from './addressVerification';

const guardian = '0x351E236a636c8be4Fa0B602cb096d72346D1a412';
const treasury = '0xb7322660B40561ae7C224F963e51583e923F7fC8';
const codeHash = '0x' + '12'.repeat(32);
const safe: SafeProbe = {
  ownersCount: 3, ownersHash: keccak256(toBytes('three unique owners')), ownersValid: true, threshold: 2,
  version: '1.3.0', domainSeparator: keccak256(toBytes('domain')), safeChainId: 56, implementation: null, handler: null,
};
const observation = (patch: Partial<EndpointAddressObservation> = {}): EndpointAddressObservation => ({
  endpointId: 'A', chainId: 56, blockNumber: 100, blockHash: '0x' + 'ab'.repeat(32), codeHash, codeBytes: 500,
  safe, safeError: null, rpcError: null, ...patch,
});

describe('owner-provided address input', () => {
  it('validates and canonicalizes the exact proposed public addresses without selecting roles', () => {
    for (const input of [guardian, treasury]) {
      const result = assessAddressInput(input);
      expect(result.canonical).toBe(getAddress(input));
      expect(result.forbiddenProtocolTarget).toBe(false);
    }
  });
  it('reports malformed, invalid mixed-case and non-checksummed inputs distinctly', () => {
    expect(assessAddressInput('0x123').checksumStatus).toBe('MALFORMED');
    expect(assessAddressInput(guardian.toLowerCase()).checksumStatus).toBe('NOT_CHECKSUMMED');
    const wrong = guardian.slice(0, 5) + (guardian[5] === guardian[5]!.toUpperCase() ? guardian[5]!.toLowerCase() : guardian[5]!.toUpperCase()) + guardian.slice(6);
    expect(assessAddressInput(wrong).checksumStatus).toBe('INVALID');
    expect(assessAddressInput(wrong).canonical).toBe(getAddress(guardian));
  });
  it('rejects zero and fixed protocol targets', () => {
    expect(assessAddressInput('0x0000000000000000000000000000000000000000').canonical).toBe('0x0000000000000000000000000000000000000000');
    expect(assessAddressInput('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c').forbiddenProtocolTarget).toBe(true);
    const zero = observation({ codeBytes: 0, codeHash: null, safe: null });
    expect(classifyObservedAddress('0x0000000000000000000000000000000000000000', [zero, { ...zero, endpointId: 'B' }]).status).toBe('UNVERIFIED');
  });
});

describe('two-endpoint read-only classification', () => {
  it('verifies an EOA only when both endpoints agree on code absence at the same chain/block', () => {
    const a = observation({ codeBytes: 0, codeHash: keccak256('0x'), safe: null });
    const b = observation({ endpointId: 'B', codeBytes: 0, codeHash: keccak256('0x'), safe: null });
    expect(classifyObservedAddress(guardian, [a, b]).status).toBe('VERIFIED_EOA');
  });
  it('does not call a contract Safe from bytecode alone', () => {
    const a = observation({ safe: null, safeError: 'NOT_SAFE' });
    const b = observation({ endpointId: 'B', safe: null, safeError: 'NOT_SAFE' });
    expect(classifyObservedAddress(guardian, [a, b]).status).toBe('VERIFIED_CONTRACT_NON_SAFE');
  });
  it('requires matching Safe ABI facts, owners, threshold, version, domain and chain', () => {
    const result = classifyObservedAddress(guardian, [observation(), observation({ endpointId: 'B' })]);
    expect(result).toMatchObject({ status: 'VERIFIED_SAFE', threshold: 2, ownersCount: 3 });
  });
  it('keeps partial or mismatched Safe responses UNVERIFIED', () => {
    const partial = observation({ safe: null, safeError: 'INCONCLUSIVE' });
    expect(classifyObservedAddress(guardian, [partial, observation({ endpointId: 'B' })]).status).toBe('UNVERIFIED');
    expect(classifyObservedAddress(guardian, [observation(), observation({ endpointId: 'B', safe: { ...safe, threshold: 1 } })]).status).toBe('UNVERIFIED');
  });
  it('fails closed on chain mismatch, RPC errors and block/code disagreement', () => {
    expect(classifyObservedAddress(guardian, [observation({ chainId: 1 }), observation({ endpointId: 'B', chainId: 1 })]).status).toBe('UNVERIFIED');
    expect(classifyObservedAddress(guardian, [observation({ rpcError: 'timeout', codeBytes: null }), observation({ endpointId: 'B' })]).status).toBe('UNVERIFIED');
    expect(classifyObservedAddress(guardian, [observation(), observation({ endpointId: 'B', blockHash: '0x' + 'cd'.repeat(32) })]).status).toBe('UNVERIFIED');
    expect(classifyObservedAddress(guardian, [observation(), observation({ endpointId: 'B', codeHash: '0x' + 'ef'.repeat(32) })]).status).toBe('UNVERIFIED');
  });
});

describe('multisig policy and transport fence', () => {
  it('accepts only distinct verified Safes with threshold >=2 for human review, never configuration', () => {
    expect(assessSafePolicy({ status: 'VERIFIED_SAFE', threshold: 2 }, { status: 'VERIFIED_SAFE', threshold: 3 }, guardian, treasury)).toMatchObject({ status: 'READY_FOR_HUMAN_REVIEW', canConfigureRoles: false });
  });
  it('flags EOA and one-of-n without relaxing policy', () => {
    const result = assessSafePolicy({ status: 'VERIFIED_EOA', threshold: null }, { status: 'VERIFIED_SAFE', threshold: 1 }, guardian, treasury);
    expect(result.status).toBe('FAILS_SAFE_POLICY');
    expect(result.reasons).toEqual(expect.arrayContaining(['GUARDIAN_NOT_VERIFIED_SAFE', 'GUARDIAN_THRESHOLD_BELOW_2', 'TREASURY_THRESHOLD_BELOW_2']));
    expect(result.recommendation).toContain('separately authorized');
  });
  it('rejects sendTransaction and every non-read method', () => {
    expect(() => assertReadOnlyRpcMethod('eth_sendTransaction')).toThrow('FORBIDDEN_RPC_METHOD');
    expect(() => assertReadOnlyRpcMethod('eth_sendRawTransaction')).toThrow('FORBIDDEN_RPC_METHOD');
    expect(() => assertReadOnlyRpcMethod('personal_sign')).toThrow('FORBIDDEN_RPC_METHOD');
    expect(() => assertReadOnlyRpcMethod('eth_getCode')).not.toThrow();
  });
});
