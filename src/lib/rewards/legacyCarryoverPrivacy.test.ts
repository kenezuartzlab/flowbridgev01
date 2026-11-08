import {it,expect,vi} from 'vitest';
vi.mock('./vaultV2Ingestion.server',()=>({verifiedVaultDeployment:vi.fn()}));
import {reviewLegacyCarryover} from './legacyCarryover.server';
it('carryover reports never expose source items or account identities',async()=>{
 const preview={snapshotHash:'hash',stateHash:'state',verifiedPoints:100,goodwillPoints:0,wallets:1,sourceCount:1,bins:{VERIFIED_UNPAID:{points:100,rows:1}},items:[{userId:'private-account',wallet:'private-wallet'}]};
 const db={rpc:async()=>({data:preview,error:null}),from:(name:string)=>{const result={data:name==='reward_vault_v2_config'?null:[],error:null};const q:any={select:()=>q,order:()=>q,limit:()=>q,neq:()=>q,maybeSingle:()=>Promise.resolve(result),then:(resolve:any)=>resolve(result)};return q;}};
 const result=await reviewLegacyCarryover(db as never);
 expect(Object.keys(result)).not.toContain('items');expect(JSON.stringify(result)).not.toContain('private-account');expect(result.verifiedPoints).toBe(100);
});
