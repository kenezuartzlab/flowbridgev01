import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
it('uses the exact compiled Vault ABI with no Merkle or epoch claim arguments',()=>{
  const artifact=JSON.parse(readFileSync('contracts/production/rewards-vault-v2/artifacts/FlowRewardsVaultV2.json','utf8'));
  expect(VAULT_V2_ABI).toEqual(artifact.abi);
  const claim=VAULT_V2_ABI.find(e=>e.type==='function'&&e.name==='claim');
  expect(claim?.type==='function'?claim.inputs:null).toEqual([]);
});