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
  it('BNB execution capability remains disabled', async () => {
    const m = await import('@/lib/bnb/quoteAdapter');
    for (const p of Object.values(m.BNB_PROVIDERS) as any[]) expect(JSON.stringify(p)).not.toMatch(/calldata|spender|signer/i);
  });
});
