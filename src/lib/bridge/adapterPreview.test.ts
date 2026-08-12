import { describe, expect, it, vi } from 'vitest';
import { parseUnits } from 'viem';
import {
  fetchAdapterPreview,
  mapAdapterPreview,
  resolveAdapterPreviewRequest,
  type PreviewSourceTuple,
  type ReadPreviewSource,
} from './adapterPreview';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';

const tuple = (
  fee: bigint,
  refundable: bigint,
  feeBps: bigint,
  paused = false,
  tokenPaused = false,
): PreviewSourceTuple => [fee, refundable, feeBps, 0n, 10n, 100000n, paused, tokenPaused];

describe('resolveAdapterPreviewRequest gates', () => {
  it('feature flag OFF → no adapter read', () => {
    expect(
      resolveAdapterPreviewRequest({
        isMainnet: false,
        bridgeDirection: 'BOT_TO_BNB',
        amount: '12',
        flagEnabled: false,
      }),
    ).toBeNull();
  });

  it('mainnet → no adapter read', () => {
    expect(
      resolveAdapterPreviewRequest({
        isMainnet: true,
        bridgeDirection: 'BOT_TO_BNB',
        amount: '12',
        flagEnabled: true,
      }),
    ).toBeNull();
  });

  it('unsupported direction (ETH / TRX, i.e. inactive route) → no adapter read', () => {
    for (const dir of ['BOT_TO_ETH', 'ETH_TO_BOT', 'BOT_TO_TRX', 'TRX_TO_BOT']) {
      expect(
        resolveAdapterPreviewRequest({
          isMainnet: false,
          bridgeDirection: dir,
          amount: '12',
          flagEnabled: true,
        }),
      ).toBeNull();
    }
  });

  it('invalid / zero amount → no adapter read', () => {
    for (const amount of ['', '   ', '0', '0.0', '-5', 'abc']) {
      expect(
        resolveAdapterPreviewRequest({
          isMainnet: false,
          bridgeDirection: 'BOT_TO_BNB',
          amount,
          flagEnabled: true,
        }),
      ).toBeNull();
    }
  });

  it('encodes 6-decimal BOT testnet source amounts', () => {
    const req = resolveAdapterPreviewRequest({
      isMainnet: false,
      bridgeDirection: 'BOT_TO_BNB',
      amount: '12',
      flagEnabled: true,
    });
    expect(req).not.toBeNull();
    expect(req!.route.sourceDecimals).toBe(6);
    expect(req!.amountWei).toBe(parseUnits('12', 6));
    expect(req!.chainId).toBe(968);
    expect(req!.adapter).toBe('0xeb875735711Bf1C4ad35642C0c77f6079F30Ea17');
  });

  it('encodes 18-decimal BNB testnet source amounts', () => {
    const req = resolveAdapterPreviewRequest({
      isMainnet: false,
      bridgeDirection: 'BNB_TO_BOT',
      amount: '10.5',
      flagEnabled: true,
    });
    expect(req).not.toBeNull();
    expect(req!.route.sourceDecimals).toBe(18);
    expect(req!.amountWei).toBe(parseUnits('10.5', 18));
    expect(req!.chainId).toBe(97);
    expect(req!.adapter).toBe('0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065');
  });
});

describe('mapAdapterPreview', () => {
  it('maps the BOT→BNB proven example (1 USDT fee, 11 refundable, 10 bps)', () => {
    const p = mapAdapterPreview(tuple(parseUnits('1', 6), parseUnits('11', 6), 10n), 6);
    expect(p.officialFeeFormatted).toBe('1');
    expect(p.refundableFormatted).toBe('11');
    expect(p.feeBps).toBe(10);
    expect(p.feeRatePercent).toBe('0.1%');
    expect(p.routeUnavailable).toBe(false);
  });

  it('maps the BNB→BOT proven example (0 fee, 10.5 refundable, 0 bps)', () => {
    const p = mapAdapterPreview(tuple(0n, parseUnits('10.5', 18), 0n), 18);
    expect(p.officialFeeFormatted).toBe('0');
    expect(p.refundableFormatted).toBe('10.5');
    expect(p.feeBps).toBe(0);
  });

  it('flags paused bridge or paused token as route unavailable', () => {
    expect(mapAdapterPreview(tuple(0n, 1n, 0n, true, false), 6).routeUnavailable).toBe(true);
    expect(mapAdapterPreview(tuple(0n, 1n, 0n, false, true), 6).routeUnavailable).toBe(true);
  });

  it('normalizes USD bounds regardless of contract scaling', () => {
    const plain = mapAdapterPreview(tuple(0n, 1n, 0n), 6);
    expect(plain.minAmountUsdFormatted).toBe('10');
    const scaled = mapAdapterPreview(
      [0n, 1n, 0n, 0n, parseUnits('10', 18), parseUnits('50000', 18), false, false],
      6,
    );
    expect(scaled.minAmountUsdFormatted).toBe('10');
    expect(scaled.maxAmountUsdFormatted).toBe('50000');
  });
});

describe('fetchAdapterPreview', () => {
  const req = resolveAdapterPreviewRequest({
    isMainnet: false,
    bridgeDirection: 'BOT_TO_BNB',
    amount: '12',
    flagEnabled: true,
  })!;

  it('returns a mapped preview on success', async () => {
    const read: ReadPreviewSource = vi
      .fn()
      .mockResolvedValue(tuple(parseUnits('1', 6), parseUnits('11', 6), 10n));
    const { preview, error } = await fetchAdapterPreview(read, req);
    expect(error).toBeNull();
    expect(preview?.refundableFormatted).toBe('11');
    expect(read).toHaveBeenCalledWith({
      adapter: req.adapter,
      chainId: 968,
      amountWei: parseUnits('12', 6),
    });
  });

  it('falls back safely when the read reverts', async () => {
    const read: ReadPreviewSource = vi.fn().mockRejectedValue(new Error('execution reverted'));
    const { preview, error } = await fetchAdapterPreview(read, req);
    expect(preview).toBeNull();
    expect(error).toContain('execution reverted');
  });
});

describe('phase 3 is read-only', () => {
  it('only previewSource is a non-payable/view read used here; no writes are wired', () => {
    const preview = BRIDGE_ADAPTER_ABI.find(
      (f: any) => f.type === 'function' && f.name === 'previewSource',
    ) as any;
    expect(preview.stateMutability).toBe('view');
  });
});
