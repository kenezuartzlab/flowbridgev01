import { describe, expect, it, vi } from 'vitest';
import {
  claimAdapterRefund,
  refundClaimGate,
  type AdapterRefundDeps,
} from './adapterRefund';
import type { PendingAdapterBridge } from '../../store/routeSession';

const session: PendingAdapterBridge = {
  tx_hash: '0xaaaa',
  gateway_nonce: '42',
  source_chain_id: 97,
  destination_chain_id: 968,
  adapter_address: '0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065',
  amount: '1000000',
  destination_recipient: '0x1111111111111111111111111111111111111111',
  refund_recipient: '0x2222222222222222222222222222222222222222',
  timestamp: 1,
  status: 'refund_available',
};

function mkDeps(overrides: Partial<AdapterRefundDeps> = {}) {
  const write = vi.fn(async () => '0xbbbb' as `0x${string}`);
  const simulate = vi.fn(async () => ({}));
  const states = [3, 4];
  const deps: AdapterRefundDeps = {
    readRequestState: vi.fn(async () => states.shift() ?? 4),
    readCanClaimRefund: vi.fn(async () => true),
    simulateClaimRefund: simulate,
    writeClaimRefund: write,
    waitForReceipt: vi.fn(async () => ({ status: 'success' as const })),
    ...overrides,
  };
  return { deps, write, simulate };
}

describe('refund claim gating', () => {
  it('flag OFF → rejected, no simulation or write', async () => {
    const { deps, write, simulate } = mkDeps();
    await expect(claimAdapterRefund(deps, session, false)).rejects.toThrow(/FLAG_OFF/);
    expect(simulate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('execution flag is irrelevant: claim allowed with only the refund flag on', async () => {
    const { deps, write } = mkDeps();
    const r = await claimAdapterRefund(deps, session, true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(r.refundCompleted).toBe(true);
  });

  it('mainnet / unsupported chains rejected', async () => {
    expect(refundClaimGate({ ...session, source_chain_id: 56 }, true).reason).toBe(
      'UNSUPPORTED_CHAIN',
    );
    expect(refundClaimGate({ ...session, source_chain_id: 677 }, true).reason).toBe(
      'UNSUPPORTED_CHAIN',
    );
  });

  it('Sepolia / inactive route rejected', () => {
    expect(
      refundClaimGate(
        {
          ...session,
          source_chain_id: 11155111,
          adapter_address: '0x7FE51363C6694ACddf3EBBF64B2d4A7Ef970ecB4',
        },
        true,
      ).claimable,
    ).toBe(false);
  });

  it('wrong adapter address rejected', () => {
    expect(
      refundClaimGate({ ...session, adapter_address: '0x' + '1'.repeat(40) }, true).reason,
    ).toBe('ADAPTER_MISMATCH');
  });

  it('wrong source chain for the stored adapter rejected', () => {
    // 968 -> 968 is not a configured route, and the stored BNB adapter cannot match it.
    expect(refundClaimGate({ ...session, source_chain_id: 968 }, true).claimable).toBe(false);
    expect(
      refundClaimGate({ ...session, source_chain_id: 968, destination_chain_id: 97 }, true).reason,
    ).toBe('ADAPTER_MISMATCH');
  });


  it('missing/predicted nonce rejected', () => {
    expect(refundClaimGate({ ...session, gateway_nonce: undefined }, true).reason).toBe(
      'INVALID_NONCE',
    );
    expect(refundClaimGate({ ...session, gateway_nonce: 'n+1' }, true).reason).toBe(
      'INVALID_NONCE',
    );
  });

  it('no session → rejected', () => {
    expect(refundClaimGate(undefined, true).reason).toBe('NO_SESSION');
  });
});

describe('fresh on-chain checks', () => {
  for (const [label, code] of [
    ['Pending', 1],
    ['Executed', 2],
    ['RefundClaimed', 4],
    ['Inconsistent', 5],
    ['None', 0],
  ] as const) {
    it(`${label} → rejected before any write`, async () => {
      const { deps, write, simulate } = mkDeps({ readRequestState: vi.fn(async () => code) });
      await expect(claimAdapterRefund(deps, session, true)).rejects.toThrow(
        /STATE_NOT_REFUND_AVAILABLE/,
      );
      expect(simulate).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    });
  }

  it('RefundAvailable + canClaimRefund false → rejected, no write', async () => {
    const { deps, write, simulate } = mkDeps({
      readRequestState: vi.fn(async () => 3),
      readCanClaimRefund: vi.fn(async () => false),
    });
    await expect(claimAdapterRefund(deps, session, true)).rejects.toThrow(/NOT_CLAIMABLE/);
    expect(simulate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('RefundAvailable + claimable → simulation attempted', async () => {
    const { deps, simulate } = mkDeps();
    await claimAdapterRefund(deps, session, true);
    expect(simulate).toHaveBeenCalledWith({
      adapter: session.adapter_address,
      chainId: 97,
      gatewayNonce: 42n,
    });
  });

  it('simulation failure → zero writes', async () => {
    const { deps, write } = mkDeps({
      readRequestState: vi.fn(async () => 3),
      simulateClaimRefund: vi.fn(async () => {
        throw new Error('revert');
      }),
    });
    await expect(claimAdapterRefund(deps, session, true)).rejects.toThrow(/SIMULATION_FAILED/);
    expect(write).not.toHaveBeenCalled();
  });

  it('successful simulation → exactly one claimRefund write', async () => {
    const { deps, write } = mkDeps();
    await claimAdapterRefund(deps, session, true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('wallet rejection propagates and never marks claimed', async () => {
    const { deps } = mkDeps({
      writeClaimRefund: vi.fn(async () => {
        throw new Error('User rejected');
      }),
    });
    await expect(claimAdapterRefund(deps, session, true)).rejects.toThrow(/User rejected/);
  });

  it('mined receipt alone cannot mark refund complete', async () => {
    const { deps } = mkDeps({ readRequestState: vi.fn(async () => 3) });
    const r = await claimAdapterRefund(deps, session, true);
    expect(r.receiptStatus).toBe('success');
    expect(r.finalState).toBe(3);
    expect(r.refundCompleted).toBe(false);
  });

  it('post-receipt state 4 → refund completed', async () => {
    const states = [3, 4];
    const { deps } = mkDeps({ readRequestState: vi.fn(async () => states.shift() as number) });
    const r = await claimAdapterRefund(deps, session, true);
    expect(r.refundCompleted).toBe(true);
  });

  it('post-receipt RPC failure never yields refund completed', async () => {
    let n = 0;
    const { deps } = mkDeps({
      readRequestState: vi.fn(async () => {
        n += 1;
        if (n === 1) return 3;
        throw new Error('rpc down');
      }),
    });
    await expect(claimAdapterRefund(deps, session, true)).rejects.toThrow(/rpc down/);
  });

  it('the helper exposes no approve/deposit/bridge dependency', () => {
    const { deps } = mkDeps();
    expect(Object.keys(deps).sort()).toEqual([
      'readCanClaimRefund',
      'readRequestState',
      'simulateClaimRefund',
      'waitForReceipt',
      'writeClaimRefund',
    ]);
  });

  it('old direct sessions are never claimable', () => {
    expect(refundClaimGate(undefined, true).claimable).toBe(false);
  });
});
