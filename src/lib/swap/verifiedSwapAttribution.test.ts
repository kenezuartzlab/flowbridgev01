/**
 * V8.2 — feature-gate, ordering, fail-closed and handoff regression tests for
 * verified-swap attribution.
 */
import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_CHAIN_IDS } from '../bridge/officialBridgeConfig';
import { VERIFIED_SWAP_PATHS, VERIFIED_SWAP_V1_ACTION_TYPE } from './verifiedSwapConfig';
import {
  captureVerifiedSwapAttribution,
  resolveQualifyingVerifiedSwap,
  scheduleVerifiedSwapHandoff,
  VerifiedSwapAttributionError,
} from './verifiedSwapAttribution';
import {
  DEFAULT_OFF_ONLY_FLAGS,
  PUBLIC_BUILD_FLAG_DEFAULTS,
  readPublicBuildFlag,
} from '../config/publicBuildFlags';

const PATH = VERIFIED_SWAP_PATHS[0]!;
const USER = '0x1111111111111111111111111111111111111111';

const qualifyingInput = () => ({
  chainId: PATH.chainId,
  steps: [
    {
      routerId: Number(PATH.routerId),
      path: [PATH.tokenIn, PATH.tokenOut],
      inIsNative: false,
      outIsNative: false,
    },
  ],
  amountIn: 1_000_000n,
  user: USER,
});

const signer = vi.fn(async () => `0x${'ab'.repeat(65)}` as `0x${string}`);

const okCapture = (async (_deps: any, args: any) => ({
  status: 'signed' as const,
  completed: false as const,
  intent: {
    intentId: args.intentId,
    user: args.user,
    actionType: args.actionType,
    sourceChainId: BigInt(args.sourceChainId),
    destinationChainId: BigInt(args.destinationChainId),
    token: args.token,
    amount: args.amount,
    recipient: args.recipient,
    campaignId: `0x${'00'.repeat(32)}`,
    nonce: args.nonce,
    deadline: BigInt(args.nowSeconds + 900),
  },
  signature: `0x${'ab'.repeat(65)}`,
})) as any;

describe('V8.2 verified swap attribution gate', () => {
  it('captures nothing when the flag is off', async () => {
    const capture = vi.fn(okCapture) as any;
    const out = await captureVerifiedSwapAttribution(
      { signTypedData: signer, enabled: () => false, capture, persist: () => true },
      qualifyingInput(),
    );
    expect(out).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it('captures on the exact supported route when the flag is true', async () => {
    const capture = vi.fn(okCapture) as any;
    const persisted: any[] = [];
    const out = await captureVerifiedSwapAttribution(
      {
        signTypedData: signer,
        enabled: () => true,
        required: () => true,
        capture,
        persist: (e) => {
          persisted.push(e);
          return true;
        },
      },
      qualifyingInput(),
    );
    expect(out).not.toBeNull();
    expect(persisted).toHaveLength(1);
    const args = (capture.mock.calls[0] as any[])[1] as any;
    expect(args.actionType).toBe(VERIFIED_SWAP_V1_ACTION_TYPE);
    expect(args.sourceChainId).toBe(OFFICIAL_CHAIN_IDS.botTestnet);
    expect(args.destinationChainId).toBe(OFFICIAL_CHAIN_IDS.botTestnet);
    expect(args.token.toLowerCase()).toBe(PATH.tokenIn.toLowerCase());
    expect(args.recipient).toBe(USER);
    expect(args.amount).toBe(1_000_000n);
  });

  it('persists (with read-after-write) before the swap write is allowed', async () => {
    const order: string[] = [];
    const evidence = await captureVerifiedSwapAttribution(
      {
        signTypedData: signer,
        enabled: () => true,
        capture: (async (d: any, a: any) => {
          order.push('sign');
          return await okCapture(d, a);
        }) as any,
        persist: () => {
          order.push('persist');
          return true;
        },
      },
      qualifyingInput(),
    );
    order.push('write');
    expect(evidence).not.toBeNull();
    expect(order).toEqual(['sign', 'persist', 'write']);
  });

  it('fails closed: capture failure prevents the swap write', async () => {
    const write = vi.fn();
    await expect(
      (async () => {
        await captureVerifiedSwapAttribution(
          {
            signTypedData: signer,
            enabled: () => true,
            required: () => true,
            capture: (async () => ({ status: 'unavailable', reason: 'user rejected' })) as any,
            persist: () => true,
          },
          qualifyingInput(),
        );
        write();
      })(),
    ).rejects.toBeInstanceOf(VerifiedSwapAttributionError);
    expect(write).not.toHaveBeenCalled();
  });

  it('fails closed when persistence read-after-write fails', async () => {
    await expect(
      captureVerifiedSwapAttribution(
        {
          signTypedData: signer,
          enabled: () => true,
          required: () => true,
          capture: okCapture,
          persist: () => false,
        },
        qualifyingInput(),
      ),
    ).rejects.toBeInstanceOf(VerifiedSwapAttributionError);
  });

  it('does not qualify unsupported chain / routerId / token-out / native paths', () => {
    const base = qualifyingInput();
    expect(resolveQualifyingVerifiedSwap({ ...base, chainId: 97 })).toBeNull();
    expect(
      resolveQualifyingVerifiedSwap({
        ...base,
        steps: [{ ...base.steps[0]!, routerId: 7 }],
      }),
    ).toBeNull();
    expect(
      resolveQualifyingVerifiedSwap({
        ...base,
        steps: [{ ...base.steps[0]!, path: [PATH.tokenIn, USER] }],
      }),
    ).toBeNull();
    expect(
      resolveQualifyingVerifiedSwap({
        ...base,
        steps: [{ ...base.steps[0]!, outIsNative: true }],
      }),
    ).toBeNull();
    expect(
      resolveQualifyingVerifiedSwap({
        ...base,
        steps: [base.steps[0]!, base.steps[0]!],
      }),
    ).toBeNull();
    expect(resolveQualifyingVerifiedSwap(base)).not.toBeNull();
  });

  it('schedules the verify-swap handoff with the persisted evidence and tx hash', async () => {
    const submit = vi.fn(async (_e: any, _t: any) => ({ outcome: 'CONFIRMED' as const, attempts: 1 }));
    const evidence = await captureVerifiedSwapAttribution(
      { signTypedData: signer, enabled: () => true, capture: okCapture, persist: () => true },
      qualifyingInput(),
    );
    const txHash = `0x${'cd'.repeat(32)}` as `0x${string}`;
    scheduleVerifiedSwapHandoff(evidence, txHash, submit as any);
    await Promise.resolve();
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as any[])[0]).toBe(evidence as any);
    expect((submit.mock.calls[0] as any[])[1]).toBe(txHash as any);
  });

  it('never hands off when nothing was captured', () => {
    const submit = vi.fn();
    scheduleVerifiedSwapHandoff(null, `0x${'cd'.repeat(32)}` as `0x${string}`, submit as any);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('V8.2A verified-swap flag is default OFF', () => {
  const flag = 'ENABLE_VERIFIED_SWAP_ACTIVITY' as const;

  it('true only for explicit true/1', () => {
    expect(readPublicBuildFlag(flag, { env: { [flag]: 'true' }, defaults: {} })).toBe(true);
    expect(readPublicBuildFlag(flag, { env: { [flag]: '1' }, defaults: {} })).toBe(true);
  });

  it('false for explicit false/0/any non-true value', () => {
    for (const v of ['false', '0', 'yes', 'off', '']) {
      expect(readPublicBuildFlag(flag, { env: { [flag]: v }, defaults: { [flag]: true } })).toBe(
        false,
      );
    }
  });

  it('false when absent/undefined, even with a committed true default', () => {
    expect(readPublicBuildFlag(flag, { env: {}, defaults: {} })).toBe(false);
    expect(readPublicBuildFlag(flag, { env: { [flag]: undefined }, defaults: {} })).toBe(false);
    expect(readPublicBuildFlag(flag, { env: {}, defaults: { [flag]: true } })).toBe(false);
  });

  it('carries no committed default for the verified-swap flag', () => {
    expect(PUBLIC_BUILD_FLAG_DEFAULTS.ENABLE_VERIFIED_SWAP_ACTIVITY).toBeUndefined();
    expect(DEFAULT_OFF_ONLY_FLAGS).toContain(flag);
  });

  it('other non-sensitive flags may still use committed defaults', () => {
    expect(
      readPublicBuildFlag('REQUIRE_ACTIVITY_ATTRIBUTION', {
        env: {},
        defaults: { REQUIRE_ACTIVITY_ATTRIBUTION: true },
      }),
    ).toBe(true);
  });
});
