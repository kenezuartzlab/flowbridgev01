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
  it('is not referenced by app code, production manifests or registries', () => {
    const hits = execSync(`rg -l "FlowBridgeBnbSwapAdapterV1|bnb-swap-adapter-v1" src contracts/production || true`, { encoding: 'utf8' }).split('\n').filter(Boolean)
      .filter((f) => !f.endsWith('adapterCandidateFence.test.ts'));
    expect(hits).toEqual([]);
  });
  it('BNB execution capability remains disabled', async () => {
    const m = await import('@/lib/bnb/quoteAdapter');
    for (const p of Object.values(m.BNB_PROVIDERS) as any[]) expect(JSON.stringify(p)).not.toMatch(/calldata|spender|signer/i);
  });
});
