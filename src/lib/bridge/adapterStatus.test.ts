import { describe, expect, it, vi } from 'vitest';
import {
  ADAPTER_STATUS_POLL_MS,
  mapAdapterRequestState,
  readAdapterStatus,
  sessionStatusFor,
  shouldPollAdapterStatus,
  type AdapterStatusDeps,
} from './adapterStatus';
import type { PendingAdapterBridge } from '../../store/routeSession';

const base: PendingAdapterBridge = {
  tx_hash: '0xaaaa',
  gateway_nonce: '42',
  source_chain_id: 97,
  destination_chain_id: 968,
  adapter_address: '0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065',
  amount: '1000000',
  destination_recipient: '0x1111111111111111111111111111111111111111',
  refund_recipient: '0x2222222222222222222222222222222222222222',
  timestamp: 1,
  status: 'pending',
};

const depsFor = (code: number, spy = vi.fn()): AdapterStatusDeps => ({
  readRequestState: async (args) => {
    spy(args);
    return code;
  },
});

describe('adapter status gating', () => {
  it('no pendingAdapterBridge → no Adapter read', async () => {
    const spy = vi.fn();
    expect(shouldPollAdapterStatus(undefined)).toBe(false);
    await expect(readAdapterStatus(depsFor(2, spy), undefined as any)).rejects.toThrow(
      /NOT_APPLICABLE/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('old/direct sessions without the field remain compatible', () => {
    const old = { step1: {}, step2: {}, step3: {} } as any;
    expect(shouldPollAdapterStatus(old.pendingAdapterBridge)).toBe(false);
  });

  it('rejects a missing or predicted (non-numeric) gateway nonce', () => {
    expect(shouldPollAdapterStatus({ ...base, gateway_nonce: undefined })).toBe(false);
    expect(shouldPollAdapterStatus({ ...base, gateway_nonce: 'n+1' })).toBe(false);
    expect(shouldPollAdapterStatus(base)).toBe(true);
  });

  it('rejects unsupported source chains (mainnet/sepolia)', () => {
    expect(shouldPollAdapterStatus({ ...base, source_chain_id: 56 })).toBe(false);
    expect(shouldPollAdapterStatus({ ...base, source_chain_id: 11155111 })).toBe(false);
    expect(shouldPollAdapterStatus({ ...base, source_chain_id: 968 })).toBe(true);
  });

  it('reads the stored adapter on the stored source chain with the stored nonce', async () => {
    const spy = vi.fn();
    await readAdapterStatus(depsFor(1, spy), { ...base, source_chain_id: 968 });
    expect(spy).toHaveBeenCalledWith({
      adapter: base.adapter_address,
      chainId: 968,
      gatewayNonce: 42n,
    });
  });
});

describe('adapter state semantics', () => {
  it('Pending → pending, never success', async () => {
    const v = await readAdapterStatus(depsFor(1), base);
    expect(v.key).toBe('pending');
    expect(v.isSuccess).toBe(false);
    expect(v.terminal).toBe(false);
  });

  it('Executed → success and polling stops', async () => {
    const v = await readAdapterStatus(depsFor(2), base);
    expect(v.key).toBe('executed');
    expect(v.isSuccess).toBe(true);
    expect(v.terminal).toBe(true);
  });

  it('RefundAvailable → ready to claim, not success, no write', async () => {
    const v = await readAdapterStatus(depsFor(3), base);
    expect(v.key).toBe('refund_available');
    expect(v.refundClaimable).toBe(true);
    expect(v.isSuccess).toBe(false);
    expect(v.description).toMatch(/claim/i);
  });

  it('RefundClaimed → refund completed, polling stops', async () => {
    const v = await readAdapterStatus(depsFor(4), base);
    expect(v.key).toBe('refund_claimed');
    expect(v.terminal).toBe(true);
    expect(v.isSuccess).toBe(false);
  });

  it('Inconsistent → fail-closed critical, never success', async () => {
    const v = await readAdapterStatus(depsFor(5), base);
    expect(v.severity).toBe('critical');
    expect(v.isSuccess).toBe(false);
    expect(v.terminal).toBe(true);
    expect(v.refundClaimable).toBe(false);
  });

  it('None → unresolved diagnostic, never success', async () => {
    const v = await readAdapterStatus(depsFor(0), base);
    expect(v.key).toBe('none');
    expect(v.isSuccess).toBe(false);
    expect(v.severity).toBe('warning');
  });

  it('unknown codes fall back to unresolved, never success', () => {
    expect(mapAdapterRequestState(99).isSuccess).toBe(false);
    expect(mapAdapterRequestState(99).key).toBe('none');
  });

  it('transient RPC error is non-terminal and never success', async () => {
    const deps: AdapterStatusDeps = { readRequestState: async () => { throw new Error('rpc down'); } };
    await expect(readAdapterStatus(deps, base)).rejects.toThrow(/rpc down/);
  });

  it('source confirmations alone cannot produce success', () => {
    // Only code 2 yields isSuccess; there is no confirmations input at all.
    const successCodes = [0, 1, 2, 3, 4, 5].filter((c) => mapAdapterRequestState(c).isSuccess);
    expect(successCodes).toEqual([2]);
  });

  it('session status mapping keeps none as pending', () => {
    expect(sessionStatusFor(mapAdapterRequestState(0))).toBe('pending');
    expect(sessionStatusFor(mapAdapterRequestState(2))).toBe('executed');
    expect(sessionStatusFor(mapAdapterRequestState(3))).toBe('refund_available');
  });

  it('poll interval is within 5-10s', () => {
    expect(ADAPTER_STATUS_POLL_MS).toBeGreaterThanOrEqual(5000);
    expect(ADAPTER_STATUS_POLL_MS).toBeLessThanOrEqual(10000);
  });
});
