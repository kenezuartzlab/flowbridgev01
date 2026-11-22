import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const root = 'contracts/audit/bnb-v112-external/submission';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const finalSha = 'feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b';

describe('final private BNB audit submission freeze', () => {
  it('exports the exact final source, and a one-byte source change invalidates its identity', () => {
    const bytes = fs.readFileSync(`${root}/source/FlowBridgeBnbSwapAdapterV1_12.sol`);
    const freeze = JSON.parse(fs.readFileSync(`${root}/SOURCE_FREEZE.json`, 'utf8'));
    expect(digest(bytes)).toBe(finalSha);
    expect(freeze.sha256).toBe(finalSha);
    expect(bytes.equals(fs.readFileSync(freeze.candidatePath))).toBe(true);
    expect(digest(Buffer.concat([bytes, Buffer.from(' ')]))).not.toBe(finalSha);
    expect(freeze.sourceChangeInvalidatesFreeze).toBe(true);
  });
  it('includes every exact inventoried file with matching bytes and no forbidden export paths', () => {
    const inventory = JSON.parse(fs.readFileSync(`${root}/INTEGRITY.json`, 'utf8'));
    expect(inventory.files.length).toBeGreaterThan(50);
    for (const file of inventory.files) {
      expect(file.path.split('/')).not.toContain('.git');
      expect(file.path.split('/')).not.toContain('node_modules');
      expect(file.path.split('/')).not.toContain('public');
      expect(file.path.split('/')).not.toContain('.env');
      expect(digest(fs.readFileSync(`${root}/${file.path}`))).toBe(file.sha256);
    }
  });
  it('records only local fork deployment and zero mainnet adapter transactions', () => {
    const status = JSON.parse(fs.readFileSync(`${root}/evidence/mainnet-deployment-status.json`, 'utf8'));
    expect(status.mainnetAdapterAddress).toBeNull();
    expect(status.mainnetDeploymentTransaction).toBeNull();
    expect(status.productionRegistryMatches).toEqual([]);
    expect(status.localTransactions).toBe(15);
    expect(status.mainnetTransactions).toBe(0);
    expect(status.forkScope).toBe('LOCAL_ONLY');
  });
});