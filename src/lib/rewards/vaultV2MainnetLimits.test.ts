import { describe, it, expect } from 'vitest';
import { selectBoundedVaultSources } from './vaultV2Allocator';
import { VAULT_V2_OWNER_EOA_EXCEPTION } from './vaultV2Identity';
const row=(id:string,wallet:string,points:number)=>({id,wallet,points} as never);
describe('Mainnet V2 owner limits',()=>{
  it('credits at most 100 FLOW per wallet per batch',()=>{
    const s=selectBoundedVaultSources([row('a','0x1',60),row('b','0x1',60),row('c','0x2',100)],10_000n*10n**18n);
    expect(s.map((r:any)=>r.id)).toEqual(['a','c']);
  });
  it('respects the 10,000 FLOW batch limit',()=>{
    const rows=Array.from({length:150},(_,i)=>row(String(i).padStart(3,'0'),'0x'+i,100));
    expect(selectBoundedVaultSources(rows,10_000n*10n**18n).length).toBe(100);
  });
  it('owner exception is pinned to the deployed vault and temporary owner',()=>{
    expect(VAULT_V2_OWNER_EOA_EXCEPTION).toEqual({vault:'0x91f70c91b4273d0129abc3f14373fbb10ca59006',owner:'0x851275569923c62a2ef962ec35bfbb8f1bcbf3dd'});
  });
});
