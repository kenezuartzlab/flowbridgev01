import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_MATRIX,
  DEPLOYED_SIZE_MEASUREMENTS,
  EIP170_LIMIT_BYTES,
  SECURITY_FINDINGS,
  evaluateSecurityGate,
  exceedsEip170,
} from './securityGate';

describe('V30.1B security gate', () => {
  it('fails closed while blockers remain open', () => {
    const verdict = evaluateSecurityGate();
    expect(verdict.pass).toBe(false);
    expect(verdict.openBlockerIds).not.toContain('V30.1B-R1');
    expect(verdict.openBlockerIds).toContain('V30.1B-D1');
    expect(verdict.openBlockerIds).toContain('V30.1B-G1');
    expect(verdict.reasons.some((r) => r.includes('EIP-170'))).toBe(false);
  });

  it('V30.1B.1: every candidate is now within the EIP-170 limit', () => {
    expect(exceedsEip170('FlowBridgeRouterV4')).toBe(false);
    expect(exceedsEip170('FlowBridgeRouterLens')).toBe(false);
    expect(exceedsEip170('FlowBridgeActivityRegistry')).toBe(false);
    expect(exceedsEip170('FlowBridgeBridgeAdapterV1')).toBe(false);
  });

  it('fails closed for unknown contracts', () => {
    expect(exceedsEip170('DoesNotExist')).toBe(true);
  });

  it('reports the hardening fixes as fixed in source', () => {
    const verdict = evaluateSecurityGate();
    expect(verdict.fixedIds).toEqual(expect.arrayContaining(['V30.1B-R2', 'V30.1B-L1']));
  });

  it('keeps every measurement hash populated', () => {
    for (const m of DEPLOYED_SIZE_MEASUREMENTS) {
      expect(m.creationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.runtimeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.normalizedAbiSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.deployedBytes).toBeGreaterThan(0);
    }
    expect(EIP170_LIMIT_BYTES).toBe(24_576);
  });

  it('never grants the lens or FlowToken any authority', () => {
    const lens = AUTHORITY_MATRIX.find((r) => r.contractId === 'FlowBridgeRouterLens');
    expect(lens?.holder).toBe('NONE');
    const token = AUTHORITY_MATRIX.find((r) => r.contractId === 'FlowToken');
    expect(token?.holder).toBe('NONE');
    expect(token?.cannot).toContain('mint');
  });

  it('keeps the reward signer server-side only', () => {
    const signer = AUTHORITY_MATRIX.find((r) => r.contractId === 'FLOW_REWARD_SIGNER_PRIVATE_KEY');
    expect(signer?.holder).toBe('SERVER_SECRET');
    expect(signer?.cannot.join(' ')).toMatch(/client bundle/);
  });

  it('has a unique id per finding', () => {
    const ids = SECURITY_FINDINGS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
