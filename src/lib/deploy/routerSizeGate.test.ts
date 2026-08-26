import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_PREPARATION,
  PREFERRED_RUNTIME_BUDGET_BYTES,
  RUNTIME_BYTES_SAVED,
  SIZE_REDUCTION_LEDGER,
  SLITHER_RUN,
  SLITHER_TRIAGE,
  V30_1B1_BASELINE,
  V30_1B1_SIZE_SAFE,
  evaluateRouterSizeGate,
  sizeSafeMeasurement,
} from './routerSizeGate';
import { EIP170_LIMIT_BYTES } from './securityGate';
import { V30_1B1_REMOVED_ROUTER_FUNCTIONS, isRemovedOnMainnetRouter } from '@/lib/flowbridge/routerV4Abi';

describe('V30.1B.1 Router size gate', () => {
  it('separates creation code from the EIP-170 runtime subject', () => {
    for (const m of [...V30_1B1_BASELINE, ...V30_1B1_SIZE_SAFE]) {
      expect(m.creationBytes).toBeGreaterThan(m.runtimeBytes);
      expect(m.creationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.runtimeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.normalizedAbiSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('puts the size-safe Router strictly below EIP-170 and inside the preferred budget', () => {
    const verdict = evaluateRouterSizeGate();
    expect(verdict.pass).toBe(true);
    expect(verdict.runtimeBytes).toBe(19_720);
    expect(verdict.runtimeBytes).toBeLessThan(EIP170_LIMIT_BYTES);
    expect(verdict.runtimeBytes).toBeLessThanOrEqual(PREFERRED_RUNTIME_BUDGET_BYTES);
    expect(verdict.headroomBytes).toBe(EIP170_LIMIT_BYTES - 19_720);
    expect(verdict.withinPreferredBudget).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it('accounts for every removed byte with a preserved-invariant attribution', () => {
    expect(RUNTIME_BYTES_SAVED).toBe(28_703 - 19_720);
    expect(SIZE_REDUCTION_LEDGER.length).toBeGreaterThanOrEqual(4);
    for (const item of SIZE_REDUCTION_LEDGER) {
      expect(item.invariantsPreserved).toBe(true);
      expect(item.detail.length).toBeGreaterThan(40);
    }
    const removed = SIZE_REDUCTION_LEDGER.flatMap((i) => i.removedFunctions);
    expect([...removed].sort()).toEqual([...V30_1B1_REMOVED_ROUTER_FUNCTIONS].sort());
  });

  it('keeps the Lens as the replacement for discovery and quoting', () => {
    const discovery = SIZE_REDUCTION_LEDGER.find((i) => i.attribution === 'DISCOVERY_AND_QUOTE_READS');
    expect(discovery?.replacement).toContain('Lens');
    expect(isRemovedOnMainnetRouter('getBestV2Rate')).toBe(true);
    expect(isRemovedOnMainnetRouter('swapV2Safe')).toBe(false);
  });

  it('records an executed static-analysis run with no actionable finding', () => {
    expect(SLITHER_RUN.executed).toBe(true);
    expect(SLITHER_RUN.results).toBe(SLITHER_TRIAGE.length);
    expect(SLITHER_TRIAGE.every((r) => r.disposition !== 'ACTION_REQUIRED')).toBe(true);
  });

  it('prepares governance without assigning any address', () => {
    expect(GOVERNANCE_PREPARATION.length).toBeGreaterThan(0);
    for (const row of GOVERNANCE_PREPARATION) expect(row.address).toBeNull();
  });

  it('fails closed for an unknown contract measurement', () => {
    expect(sizeSafeMeasurement('DoesNotExist')).toBeNull();
  });
});
