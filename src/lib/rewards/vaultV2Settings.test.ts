import { describe, it, expect } from 'vitest';
import { compareVaultSettings } from './vaultV2Settings';
const live={owner:'0x851275569923c62a2ef962ec35bfbb8f1bcbf3dd',publisher:'0x971e7790fe6c8f77dc666bb05d4aeda362653f94',batchCapWei:(10000n*10n**18n).toString(),dailyCapWei:(10000n*10n**18n).toString()};
const input={address:'0x91f70c91b4273d0129abc3f14373fbb10ca59006' as const,owner:live.owner.toUpperCase().replace('0X','0x'),publisher:live.publisher,batchCapFlow:'10000',dailyCapFlow:'10000'};
describe('vault settings must equal live chain',()=>{
  it('accepts exact match (case-insensitive addresses)',()=>expect(compareVaultSettings(input,live)).toEqual([]));
  it('rejects wrong owner',()=>expect(compareVaultSettings({...input,owner:'0x'+'1'.repeat(40)},live)[0]).toMatch(/^Owner/));
  it('rejects wrong publisher',()=>expect(compareVaultSettings({...input,publisher:'0x'+'2'.repeat(40)},live)[0]).toMatch(/^Publisher/));
  it('rejects limits off by any amount',()=>expect(compareVaultSettings({...input,batchCapFlow:'9999.999',dailyCapFlow:'20000'},live)).toEqual(['Per-batch limit','Daily limit']));
});
