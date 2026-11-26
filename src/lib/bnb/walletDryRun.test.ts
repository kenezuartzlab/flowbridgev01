import { describe, expect, it } from 'vitest';
import { connectDryRunWallet, createSimulatedInjectedProvider, reviewInjectedWalletDryRun, SUPPORTED_DRY_RUN_WALLETS, WALLET_REVIEW_POLICY, type DryRunQuote, type WalletDryRunInput } from './walletDryRun';
import { slippageFloor } from './executionReviewPolicy';

const E = 10n ** 18n;
const A = '0x00000000000000000000000000000000000000a1';
const B = '0x00000000000000000000000000000000000000b2';
const context = { chainId: 56, account: A, tokenIn: 'WBNB' as const, tokenOut: 'USDT' as const, poolFee: 500, amountIn: E / 100n };
const gross = 6n * E, fee = gross * 5n / 10_000n, net = gross - fee;
const quote: DryRunQuote = { ...context, source: 'PANCAKE_V3_QUOTER', quotedGrossOut: gross, quotedAtSec: 1000, quoteBlock: 500 };

async function fixture(wallet: 'MetaMask' | 'TokenPocket' | 'Rabby' = 'MetaMask', patch: Partial<WalletDryRunInput> = {}) {
  const simulated = createSimulatedInjectedProvider({ wallet, account: A, chainId: 56, blockNumber: 500 });
  await connectDryRunWallet(simulated.provider);
  const input: WalletDryRunInput = { provider: simulated.provider, quote, current: context, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(net, 50), slippageBps: 50, slippageAcknowledged: true, feeBps: 5, ...patch };
  return { simulated, result: await reviewInjectedWalletDryRun(input), input };
}

describe('V1.15 non-funded injected-wallet review dry-run', () => {
  for (const wallet of SUPPORTED_DRY_RUN_WALLETS) it(`${wallet}: explicit connect requests accounts but never a signature`, async () => {
    const simulated = createSimulatedInjectedProvider({ wallet });
    expect(simulated.calls).toEqual([]);
    expect(await connectDryRunWallet(simulated.provider)).toBe(A);
    expect(simulated.calls).toEqual(['eth_requestAccounts']);
    await expect(simulated.provider.request({ method: 'personal_sign', params: ['0x00', A] })).rejects.toThrow('DRY_RUN_FORBIDS_personal_sign');
    await expect(simulated.provider.request({ method: 'eth_sendTransaction' })).rejects.toThrow('DRY_RUN_FORBIDS_eth_sendTransaction');
  });
  it('passive review never connects automatically and reports disconnected', async () => {
    const simulated = createSimulatedInjectedProvider({ wallet: 'MetaMask' });
    const result = await reviewInjectedWalletDryRun({ provider: simulated.provider, quote, current: context, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(net, 50), slippageBps: 50, slippageAcknowledged: true, feeBps: 5 });
    expect(simulated.calls).toEqual(['eth_accounts', 'eth_chainId']);
    expect(result.reasons).toContain('WALLET_DISCONNECTED');
    expect(result.canSign).toBe(false);
    expect(result.canSubmit).toBe(false);
  });
  it('connect rejection is visible and no review request is attempted', async () => {
    const simulated = createSimulatedInjectedProvider({ wallet: 'Rabby', rejectConnect: true });
    await expect(connectDryRunWallet(simulated.provider)).rejects.toMatchObject({ code: 4001 });
    expect(simulated.calls).toEqual(['eth_requestAccounts']);
  });
  it('valid review is non-executable and shows exact output fee and NET output', async () => {
    const { result } = await fixture();
    expect(result.mode).toBe('NON_EXECUTABLE_REVIEW');
    expect(result.review.presentable).toBe(true);
    expect(result.reasons).toEqual(['EXECUTION_DISABLED']);
    expect(result.fee).toEqual({ bps: 5, grossOut: gross, feeAmount: 3n * 10n ** 15n, netOut: 5_997_000_000_000_000_000n, chosen: false });
    expect(result.review.slippageFloor).toBe(5_967_015_000_000_000_000n);
  });
  it('supports only the proposed 0/5/10 bps illustrations without selecting one', async () => {
    for (const feeBps of [0, 5, 10] as const) {
      const netAfterFee = gross - gross * BigInt(feeBps) / 10_000n;
      const { result } = await fixture('MetaMask', { feeBps, approvedMinNetOut: slippageFloor(netAfterFee, 50) });
      expect(result.fee.netOut).toBe(netAfterFee);
      expect(result.fee.chosen).toBe(false);
    }
  });
  it('wrong BOT chain 677 is rejected and never enables BNB signing', async () => {
    const simulated = createSimulatedInjectedProvider({ wallet: 'MetaMask', chainId: 677 });
    await connectDryRunWallet(simulated.provider);
    const result = await reviewInjectedWalletDryRun({ provider: simulated.provider, quote, current: context, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(net, 50), slippageBps: 50, slippageAcknowledged: true, feeBps: 5 });
    expect(result.reasons).toContain('WRONG_CHAIN');
    expect(result.reasons).toContain('CONTEXT_CHANGED');
    expect(result.canSign).toBe(false);
  });
  it('account change invalidates the quote', async () => {
    const simulated = createSimulatedInjectedProvider({ wallet: 'Rabby' });
    await connectDryRunWallet(simulated.provider);
    simulated.setAccount(B);
    const result = await reviewInjectedWalletDryRun({ provider: simulated.provider, quote, current: context, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(net, 50), slippageBps: 50, slippageAcknowledged: true, feeBps: 5 });
    expect(result.reasons).toContain('CONTEXT_CHANGED');
  });
  for (const [name, current] of [
    ['token', { ...context, tokenIn: 'USDT' as const, tokenOut: 'WBNB' as const }],
    ['tier', { ...context, poolFee: 2500 }],
    ['amount', { ...context, amountIn: E / 50n }],
  ] as const) it(`${name} change invalidates the quote`, async () => {
    const { result } = await fixture('TokenPocket', { current });
    expect(result.reasons).toContain('CONTEXT_CHANGED');
  });
  it('31 seconds and 101 blocks are stale; exact 30/100 boundaries pass freshness', async () => {
    expect((await fixture('MetaMask', { nowSec: 1031 })).result.reasons).toContain('QUOTE_STALE_TIME');
    expect((await fixture('MetaMask', { currentBlock: 601 })).result.reasons).toContain('QUOTE_STALE_BLOCKS');
    expect((await fixture('MetaMask', { nowSec: 1030, currentBlock: 600 })).result.reasons).toEqual(['EXECUTION_DISABLED']);
  });
  it('0x indicative price cannot execute', async () => {
    const { result } = await fixture('MetaMask', { quote: { ...quote, source: '0X_PRICE' } });
    expect(result.reasons).toContain('INDICATIVE_SOURCE_NOT_EXECUTABLE');
    expect(result.canSubmit).toBe(false);
  });
  it('requires slippage acknowledgement', async () => {
    expect((await fixture('MetaMask', { slippageAcknowledged: false })).result.reasons).toContain('SLIPPAGE_NOT_ACKNOWLEDGED');
  });
  it('gas is honestly unavailable unless clearly labeled as simulated', async () => {
    expect((await fixture()).result.gas).toEqual({ status: 'UNAVAILABLE', label: 'Gas not estimated', gasUnits: null });
    expect((await fixture('MetaMask', { gasUnits: 250_000n })).result.gas).toEqual({ status: 'SIMULATED_ESTIMATE', label: 'Simulated gas estimate — not a wallet quote', gasUnits: 250_000n });
  });
  it('disconnect invalidates subsequent review', async () => {
    const simulated = createSimulatedInjectedProvider({ wallet: 'TokenPocket' });
    await connectDryRunWallet(simulated.provider);
    simulated.disconnect();
    const result = await reviewInjectedWalletDryRun({ provider: simulated.provider, quote, current: context, nowSec: 1010, currentBlock: 520, approvedMinNetOut: slippageFloor(net, 50), slippageBps: 50, slippageAcknowledged: true, feeBps: 5 });
    expect(result.reasons).toContain('WALLET_DISCONNECTED');
  });
  it('review policy is visibly separate from on-chain and not an oracle claim', () => {
    expect(WALLET_REVIEW_POLICY).toContain('not a verified oracle');
    expect(WALLET_REVIEW_POLICY).toContain('On-chain checks are separate');
    expect(WALLET_REVIEW_POLICY).toContain('sandwich loss');
  });
});
