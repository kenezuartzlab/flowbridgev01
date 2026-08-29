import { describe, expect, it, vi } from 'vitest';
import { resolveAdapterDispatch } from './adapterDispatch';
import { ADAPTER_CHAIN_IDS } from './adapterConfig';
import {
  AdapterExecutionError,
  executeAdapterBridge,
  resolveAdapterExecutionRoute,
  type AdapterExecutionDeps,
} from './adapterExecution';
import type { PreviewSourceTuple } from './adapterPreview';
import { getLocalSession, saveLocalSession, type RouteSession } from '../../store/routeSession';

const RECIPIENT = '0x2222222222222222222222222222222222222222';
const OWNER = '0x1111111111111111111111111111111111111111';

const both = { flagEnabled: true, executionFlagEnabled: true };

describe('resolveAdapterDispatch — flag matrix', () => {
  const base = { isMainnet: false, bridgeDirection: 'BNB_TO_BOT', walletChainId: ADAPTER_CHAIN_IDS.bnbTestnet };

  it('preview ON + execution OFF → no adapter branch', () => {
    expect(resolveAdapterDispatch({ ...base, flagEnabled: true, executionFlagEnabled: false })).toBeNull();
  });

  it('execution ON + preview OFF → no adapter branch', () => {
    expect(resolveAdapterDispatch({ ...base, flagEnabled: false, executionFlagEnabled: true })).toBeNull();
  });

  it('both OFF → no adapter branch', () => {
    expect(resolveAdapterDispatch({ ...base, flagEnabled: false, executionFlagEnabled: false })).toBeNull();
  });

  it('both ON + testnet BNB_TO_BOT → adapter route selected', () => {
    const route = resolveAdapterDispatch({ ...base, ...both });
    expect(route?.id).toBe('bnbTestnet->botTestnet');
  });

  it('both ON + testnet BOT_TO_BNB → adapter route selected', () => {
    const route = resolveAdapterDispatch({
      isMainnet: false,
      bridgeDirection: 'BOT_TO_BNB',
      walletChainId: ADAPTER_CHAIN_IDS.botTestnet,
      ...both,
    });
    expect(route?.id).toBe('botTestnet->bnbTestnet');
  });

  it('mainnet never selects the adapter', () => {
    expect(resolveAdapterDispatch({ ...base, isMainnet: true, walletChainId: 56, ...both })).toBeNull();
    expect(
      resolveAdapterDispatch({ isMainnet: true, bridgeDirection: 'BOT_TO_BNB', walletChainId: 677, ...both }),
    ).toBeNull();
  });

  it('demo mode never selects the adapter', () => {
    expect(resolveAdapterDispatch({ ...base, isDemoMode: true, ...both })).toBeNull();
  });

  it('Sepolia / ETH / TRON never select the adapter', () => {
    for (const dir of ['ETH_TO_BOT', 'BOT_TO_ETH', 'TRX_TO_BOT', 'BOT_TO_TRX']) {
      expect(
        resolveAdapterDispatch({ isMainnet: false, bridgeDirection: dir, walletChainId: 11155111, ...both }),
      ).toBeNull();
    }
  });

  it('wrong wallet chain never selects the adapter', () => {
    expect(resolveAdapterDispatch({ ...base, walletChainId: ADAPTER_CHAIN_IDS.botTestnet, ...both })).toBeNull();
  });
});

describe('adapterExecution defense in depth', () => {
  const input = {
    sourceChainId: ADAPTER_CHAIN_IDS.bnbTestnet,
    destinationChainId: ADAPTER_CHAIN_IDS.botTestnet,
    amountWei: 10n ** 18n,
    destinationRecipient: RECIPIENT,
    refundRecipient: OWNER,
  };

  it('rejects when only the preview flag is on', () => {
    try {
      resolveAdapterExecutionRoute({ ...input, flagEnabled: true, executionFlagEnabled: false });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterExecutionError);
      expect((e as AdapterExecutionError).code).toBe('EXECUTION_FLAG_DISABLED');
    }
  });

  it('rejects when only the execution flag is on', () => {
    expect(() =>
      resolveAdapterExecutionRoute({ ...input, flagEnabled: false, executionFlagEnabled: true }),
    ).toThrow(/testnet flag is disabled/);
  });

  it('rejects when both flags are off', () => {
    expect(() =>
      resolveAdapterExecutionRoute({ ...input, flagEnabled: false, executionFlagEnabled: false }),
    ).toThrow(AdapterExecutionError);
  });

  it('adapter branch never calls deposit()/depositWithBotGas()', async () => {
    const tuple: PreviewSourceTuple = [1n, 999n, 30n, 0n, 0n, 0n, false, false];
    const writes: string[] = [];
    const deps: AdapterExecutionDeps = {
      readPreviewSource: vi.fn(async () => tuple),
      readBlockTimestamp: vi.fn(async () => 1_000n),
      readAllowance: vi.fn(async () => 0n),
      writeApprove: vi.fn(async () => {
        writes.push('approve');
        return '0xaa' as `0x${string}`;
      }),
      waitForReceipt: vi.fn(async () => ({ logs: [] })),
      simulateBridge: vi.fn(async () => undefined),
      writeBridge: vi.fn(async () => {
        writes.push('bridge');
        return '0xbb' as `0x${string}`;
      }),
      parseBridgeRequested: vi.fn(() => 7n),
    };

    const result = await executeAdapterBridge(deps, { ...input, ...both, owner: OWNER });
    expect(writes).toEqual(['approve', 'bridge']);
    expect(writes).not.toContain('deposit');
    expect(writes).not.toContain('depositWithBotGas');
    // Source mined only — never destination settlement.
    expect(result.sourceConfirmed).toBe(true);
    expect(result.destinationConfirmed).toBe(false);
  });
});

describe('route session compatibility', () => {
  // node env has no window/localStorage; stub a minimal in-memory one
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).localStorage = localStorageStub;
  (globalThis as any).window = { localStorage: localStorageStub };


  it('stores the adapter source receipt as pending, never SUCCESS', () => {
    const session: RouteSession = {
      step1: { step_id: 'ca_bot', status: 'pending' },
      step2: { step_id: 'bot_usdt', status: 'pending' },
      step3: { step_id: 'bridge_usdt', status: 'pending' },
      pendingAdapterBridge: {
        tx_hash: '0xbb',
        source_chain_id: ADAPTER_CHAIN_IDS.bnbTestnet,
        destination_chain_id: ADAPTER_CHAIN_IDS.botTestnet,
        adapter_address: '0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065',
        amount: '1000000000000000000',
        destination_recipient: RECIPIENT,
        refund_recipient: OWNER,
        timestamp: 1,
        status: 'pending',
      },
    };
    saveLocalSession(session);
    const loaded = getLocalSession();
    expect(loaded.pendingAdapterBridge?.status).toBe('pending');
    expect(JSON.stringify(loaded)).not.toContain('SUCCESS');
  });

  it('old persisted sessions without adapter fields still deserialize', () => {
    localStorage.setItem(
      'flowbridge_session',
      JSON.stringify({
        step1: { step_id: 'ca_bot', status: 'done', tx_hash: '0x1' },
        step2: { step_id: 'bot_usdt', status: 'pending' },
        step3: { step_id: 'bridge_usdt', status: 'pending' },
      }),
    );
    const loaded = getLocalSession();
    expect(loaded.step1.status).toBe('done');
    expect(loaded.pendingAdapterBridge).toBeUndefined();
  });
});
