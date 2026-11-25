// Fences the local-only BNB adapter candidate: frozen source and no registration in production surfaces.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { keccak256 } from 'viem';
const dir = 'contracts/candidates/bnb-swap-adapter-v1';
const manifest = JSON.parse(fs.readFileSync(`${dir}/MANIFEST.json`, 'utf8'));
describe('BNB adapter V1 candidate fence', () => {
  it('source matches frozen manifest hash', () => {
    expect(keccak256(fs.readFileSync(`${dir}/FlowBridgeBnbSwapAdapterV1.sol`))).toBe(manifest.sourceKeccak);
    expect(manifest.status).toMatch(/NOT DEPLOYED/);
  });
  it('V1.5 source matches its frozen manifest and V1.4 stays frozen', () => {
    const m = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-5/MANIFEST.json', 'utf8'));
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-5/FlowBridgeBnbSwapAdapterV1_5.sol'))).toBe(m.sourceKeccak);
    expect(manifest.sourceKeccak).toBe('0x06f90355e83aa0940d3c73cfe165a2e5c074bf67361cdea8e1e7def81c41a173');
  });
  it('V1.6 source matches its manifest (solc 0.8.38, cancun) and V1.5 stays frozen', () => {
    const m = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-6/MANIFEST.json', 'utf8'));
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-6/FlowBridgeBnbSwapAdapterV1_6.sol'))).toBe(m.sourceKeccak);
    expect(m.status).toMatch(/NOT DEPLOYED/); expect(m.evmVersion).toBe('cancun');
    const m15 = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-5/MANIFEST.json', 'utf8'));
    expect(m15.sourceKeccak).toBe('0xc0cbca86206a4f672a59e3276c8910e65857ab9ba9901dd410f5b58e3748fa66');
  });
  it('is not referenced by app code, production manifests or registries', () => {
    const hits = execSync(`rg -l "FlowBridgeBnbSwapAdapterV1|bnb-swap-adapter-v1" src contracts/production || true`, { encoding: 'utf8' }).split('\n').filter(Boolean)
      .filter((f) => !f.endsWith('adapterCandidateFence.test.ts') && !f.endsWith('AGENTS.md'));
    expect(hits).toEqual([]);
  });
  it('V1.11 stays hash-pinned while V1.12 remains an isolated frozen audit candidate', () => {
    const previous = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-11/MANIFEST.json', 'utf8'));
    expect(previous.sourceKeccak).toBe('0xba6803f62aee20a030aea1bc963ab859f15a822eade21c3a556f9082b020bc67');
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-11/FlowBridgeBnbSwapAdapterV1_11.sol'))).toBe(previous.sourceKeccak);
    const next = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-12/MANIFEST.json', 'utf8'));
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol'))).toBe(next.sourceKeccak);
    expect(next.sourceKeccak).not.toBe(previous.sourceKeccak);
    expect(next.status).toContain('NOT DEPLOYED');
    // Contract-qualified internalType changes with version; wire types/selectors must not.
    expect(JSON.parse(JSON.stringify(next.abi).replaceAll('FlowBridgeBnbSwapAdapterV1_12', 'FlowBridgeBnbSwapAdapterV1_11'))).toEqual(previous.abi);
  });
  it('V1.12 stays byte-frozen while V1.13 is a separate constructor-guardrail candidate with identical wire ABI', async () => {
    const { createHash } = await import('node:crypto');
    const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    expect(sha('contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol')).toBe('feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b');
    expect(sha('contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol')).toBe('5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425');
    const v12 = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-12/MANIFEST.json', 'utf8'));
    const v13 = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json', 'utf8'));
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol'))).toBe(v13.sourceKeccak);
    expect(v13.status).toContain('NOT DEPLOYED');
    expect(JSON.parse(JSON.stringify(v13.abi).replaceAll('FlowBridgeBnbSwapAdapterV1_13', 'FlowBridgeBnbSwapAdapterV1_12'))).toEqual(v12.abi);
  });
  it('BNB execution capability remains disabled', async () => {
    const m = await import('@/lib/bnb/quoteAdapter');
    for (const p of Object.values(m.BNB_PROVIDERS) as any[]) expect(JSON.stringify(p)).not.toMatch(/calldata|spender|signer/i);
  });
});
