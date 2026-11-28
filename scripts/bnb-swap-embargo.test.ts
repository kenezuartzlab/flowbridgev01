import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BNB_SWAP_PUBLICATION_EMBARGO, BNB_SWAP_EMBARGO_REASON, BNB_EXECUTION_ENABLED, LAUNCH_HOLD, bnbSwapGoneResponse } from '../src/lib/bnb/bnbSwapEmbargo';
import { PUBLIC_SWAP_VIEWS, normalizeSwapView, swapViewCanExecute } from '../src/lib/swap/viewContext';
import { requireFlowBridgeExecution, requireFlowBridgeV4Execution, resolveFlowBridgeExecution } from '../src/lib/flowbridge/executionRegistry';
import { isBridgeDirectionSelectable } from '../src/lib/bridge/peerAvailability';
import { MULTISEND_NETWORKS } from '../src/lib/multisend/deployments';
import { checkSource, checkBundle, bnbSwapEmbargoPlugin } from './check-bnb-swap-embargo.mjs';
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('owner BNB Swap embargo', () => {
  it('is source locked irrespective of runtime flags', () => {
    vi.stubEnv('VITE_BNB_EXECUTION_ENABLED', 'true');
    vi.stubEnv('BNB_SWAP_PUBLICATION_EMBARGO', 'false');
    try {
      expect(BNB_SWAP_PUBLICATION_EMBARGO).toBe(true);
      expect(BNB_SWAP_EMBARGO_REASON).toBe('OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE');
      expect(BNB_EXECUTION_ENABLED).toBe(false);
      expect(LAUNCH_HOLD).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it('normalizes persisted and URL chain 56 to the current BOT context', () => {
    expect(PUBLIC_SWAP_VIEWS).toEqual([677, 968]);
    expect(normalizeSwapView(Number(new URL('https://example.test/trade?chainId=56').searchParams.get('chainId')))).toBe(677);
    expect(normalizeSwapView(56, false)).toBe(968);
    expect(normalizeSwapView(677, false)).toBe(677);
    expect(normalizeSwapView(968)).toBe(968);
    expect(normalizeSwapView(NaN, false)).toBe(968);
  });
  it('cannot resolve a BNB swap approval or signing target', () => {
    expect(resolveFlowBridgeExecution(56).configured).toBe(false);
    expect(swapViewCanExecute(56, 56)).toBe(false);
    expect(() => requireFlowBridgeExecution(56)).toThrow();
    expect(() => requireFlowBridgeV4Execution(56)).toThrow();
    expect(swapViewCanExecute(677, 677)).toBe(true);
    expect(swapViewCanExecute(968, 968)).toBe(true);
  });
  it('preserves BNB bridge and the verified BNB MultiSend deployment', () => {
    expect(isBridgeDirectionSelectable('BOT_TO_BNB')).toBe(true);
    expect(isBridgeDirectionSelectable('BNB_TO_BOT')).toBe(true);
    expect(MULTISEND_NETWORKS.find(n => n.chainId === 56)?.contract).toBe('0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e');
  });
  it('retains the exact frozen V1.13 source and undeployed manifest', () => {
    const dir = 'contracts/candidates/bnb-swap-adapter-v1-13';
    expect(createHash('sha256').update(read(`${dir}/FlowBridgeBnbSwapAdapterV1_13.sol`)).digest('hex')).toBe('5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425');
    expect(JSON.parse(read(`${dir}/MANIFEST.json`)).status).toBe('LOCAL CANDIDATE — NOT DEPLOYED, NOT AUDITED, NOT REGISTERED');
  });
  it.each(['unsigned', 'authorized'])('retired handler returns 410 without vendor transport (%s)', async () => {
    // Handler takes no request or auth input: an authorized caller gets exactly the same tombstone.
    const transport = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Vendor must never be called'));
    try {
      const response = bnbSwapGoneResponse();
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ error: 'BNB_SWAP_PAUSED', reason: 'OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE' });
      expect(transport).not.toHaveBeenCalled();
    } finally { transport.mockRestore(); }
  });
});

describe('publish firewall mutations', () => {
  it('blocks the actual Vite emitted-client hook on reintroduced research', () => {
    const plugin = bnbSwapEmbargoPlugin();
    const hook = plugin.generateBundle as Function;
    expect(() => hook.call({ environment: { name: 'client' } }, {}, { 'swap.js': { type: 'chunk', modules: { '/src/lib/bnb/quoteAdapter.ts': {} }, code: '' } })).toThrow(/BNB Swap archived module/);
  });
  it('accepts the current source', () => { expect(checkSource()).toBe(true); });
  it.each([
    ['src/lib/bnb/bnbSwapEmbargo.ts', 'BNB_SWAP_PUBLICATION_EMBARGO = true', 'BNB_SWAP_PUBLICATION_EMBARGO = false'],
    ['src/lib/bnb/bnbSwapEmbargo.ts', 'BNB_EXECUTION_ENABLED = false', 'BNB_EXECUTION_ENABLED = true'],
    ['src/lib/bnb/bnbSwapEmbargo.ts', 'LAUNCH_HOLD = true', 'LAUNCH_HOLD = false'],
    ['src/lib/bnb/bnbSwapEmbargo.ts', 'BNB_SWAP_PUBLICATION_EMBARGO = true', "BNB_SWAP_PUBLICATION_EMBARGO = process.env['ENABLE']"],
    ['src/lib/swap/viewContext.ts', 'PUBLIC_SWAP_VIEWS = [677, 968]', 'PUBLIC_SWAP_VIEWS = [677, 56, 968]'],
    ['src/components/routetabs/swap/SwapChainPicker.tsx', 'const options = PUBLIC_SWAP_VIEWS;', 'const options = [677, 56, 968];'],
    ['src/components/routetabs/swap/SwapWorkspace.tsx', "import { SwapChainPicker }", "import { BnbQuoteInspection } from './BnbQuoteInspection';\nimport { SwapChainPicker }"],
    ['src/components/routetabs/swap/SwapWorkspace.tsx', 'if (!isSwapView(view)) return null;', ''],
    ['src/routes/api/admin.bnb-0x-price.ts', 'POST: bnbSwapGoneResponse', 'POST: async () => fetch("https://api.0x.org")'],
    ['src/routes/api/admin.bnb-0x-price.ts', "import { createFileRoute }", "import { fetchZeroExPrice } from '@/lib/bnb/zeroExPrice.server';\nimport { createFileRoute }"],
    ['src/lib/flowbridge/executionRegistry.ts', "configured: false,\n    chainId: OFFICIAL_CHAIN_IDS.bnbMainnet", "configured: true,\n    chainId: OFFICIAL_CHAIN_IDS.bnbMainnet"],
    ['src/lib/swap/executionCapability.ts', '968: {', '56: {'],
    ['package.json', 'node scripts/check-bnb-swap-embargo.mjs && vite build', 'vite build'],
    ['vite.config.ts', 'bnbSwapEmbargoPlugin(), ', ''],
  ])('rejects mutation in %s: %s', (file, before, after) => {
    const original = read(file);
    expect(original.includes(before)).toBe(true);
    expect(() => checkSource(process.cwd(), { [file]: original.replace(before, after) })).toThrow(/EMBARGO/);
  });
  it.each(['public/bnb-swap-adapter-manifest.json', 'contracts/production/bnb-swap-adapter/manifest.json'])('rejects new public/deployable artifact %s', file => {
    expect(() => checkSource(process.cwd(), { [file]: '{"contract":"FlowBridgeBnbSwapAdapter"}' })).toThrow(/EMBARGO/);
  });
  it('rejects a new direct public BNB Swap route', () => {
    expect(() => checkSource(process.cwd(), { 'src/routes/bnb-swap.tsx': 'export const enabled = true;' })).toThrow(/EMBARGO/);
  });
  it('allows unrelated BNB wallet/bridge content in an emitted client chunk', () => {
    expect(checkBundle({ 'bridge.js': { type: 'chunk', modules: { '/src/lib/wagmi.ts': {}, '/src/lib/bridge/evmBridge.ts': {} }, code: 'BNB Smart Chain' } })).toBe(true);
  });
  it.each(['/src/components/routetabs/swap/BnbQuoteInspection.tsx', '/src/lib/bnb/quoteAdapter.ts', '/src/lib/bnb/feePolicy.ts', '/contracts/candidates/bnb-swap-adapter-v1-13/artifact.json'])('rejects emitted archived module %s', id => {
    expect(() => checkBundle({ 'swap.js': { type: 'chunk', modules: { [id]: {} }, code: '' } })).toThrow(/EMBARGO/);
  });
  it('rejects paused UI emitted even without module identity', () => {
    expect(() => checkBundle({ 'swap.js': { type: 'chunk', modules: {}, code: 'BNB swaps coming after security approval' } })).toThrow(/EMBARGO/);
  });
});
