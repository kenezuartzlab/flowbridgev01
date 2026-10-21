import { describe,it,expect } from 'vitest';
import { encodeFunctionData,encodeEventTopics,encodeAbiParameters,type Hex } from 'viem';
import { verifyPublicationIdentity,parsePendingPublication,type PublicationEvidence,PUBLICATION_EVENT_ABI } from './publicationVerification';
import { PUBLISH_EPOCH_ABI,SETTLEMENT_SIGNER } from './settlementPlanner';
const hash=('0x'+'a'.repeat(64)) as Hex;
const root=('0x'+'b'.repeat(64)) as Hex;
const block=('0x'+'c'.repeat(64)) as Hex;
const distributor='0x'+'1'.repeat(40);
function evidence():PublicationEvidence {
 const args=[root,1000n*10n**18n,10000n,2602000n] as const;
 return {chainId:677,operatorWallet:SETTLEMENT_SIGNER.address,publisherRole:true,distributor,
 batch:{epochId:3,root,totalWei:args[1].toString(),claimStart:10000,claimEnd:2602000,leaves:[]},
 tx:{hash,from:SETTLEMENT_SIGNER.address,to:distributor,input:encodeFunctionData({abi:PUBLISH_EPOCH_ABI,functionName:'publishEpoch',args}),value:0n,chainId:677,blockHash:block},
 receipt:{transactionHash:hash,from:SETTLEMENT_SIGNER.address,to:distributor,status:'success',blockHash:block,blockNumber:100n,logs:[{address:distributor,topics:encodeEventTopics({abi:PUBLICATION_EVENT_ABI,eventName:'EpochPublished',args:{epochId:3n}}) as Hex[],data:encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'uint64'},{type:'uint64'}],args)}]},canonicalBlockHash:block,head:101n};
}
describe('publisher confirmation identity',()=>{
 it('requires the exact authorized publish transaction and emitted epoch',()=>expect(verifyPublicationIdentity(evidence()).complete).toBe(true));
 for(const [name,change] of [
  ['missing operator wallet',(p:PublicationEvidence)=>{p.operatorWallet='';}],
  ['arbitrary publisher context',(p:PublicationEvidence)=>{p.operatorWallet=distributor;}],
  ['wrong chain',(p:PublicationEvidence)=>{p.chainId=1;}],
  ['wrong transaction sender',(p:PublicationEvidence)=>{if(p.tx)p.tx.from=distributor;}],
  ['missing transaction',(p:PublicationEvidence)=>{p.tx=null;}],
  ['missing receipt',(p:PublicationEvidence)=>{p.receipt=null;}],
  ['wrong distributor',(p:PublicationEvidence)=>{if(p.tx)p.tx.to=SETTLEMENT_SIGNER.address;}],
  ['revoked publisher role',(p:PublicationEvidence)=>{p.publisherRole=false;}],
  ['wrong calldata',(p:PublicationEvidence)=>{if(p.tx)p.tx.input='0x12345678';}],
  ['wrong root',(p:PublicationEvidence)=>{p.batch.root=hash;}],
  ['wrong amount',(p:PublicationEvidence)=>{p.batch.totalWei='1';}],
  ['wrong epoch',(p:PublicationEvidence)=>{p.batch.epochId=4;}],
  ['wrong window',(p:PublicationEvidence)=>{p.batch.claimEnd++;}],
  ['unrelated successful transaction',(p:PublicationEvidence)=>{if(p.receipt)p.receipt.logs=[];}],
  ['revert',(p:PublicationEvidence)=>{if(p.receipt)p.receipt.status='reverted';}],
  ['reorganization',(p:PublicationEvidence)=>{p.canonicalBlockHash=hash;}],
  ['insufficient confirmations',(p:PublicationEvidence)=>{p.head=100n;}],
 ] as const) it(`rejects ${name}`,()=>{const p=evidence();change(p);expect(verifyPublicationIdentity(p).complete).toBe(false);});
 it('timeout then recovery never proves success until full evidence returns',()=>{const p=evidence();p.tx=null;expect(verifyPublicationIdentity(p).complete).toBe(false);expect(verifyPublicationIdentity(evidence()).complete).toBe(true);});
 it('repeated checks produce identical verified result',()=>{expect(verifyPublicationIdentity(evidence())).toEqual(verifyPublicationIdentity(evidence()));});
 it('persists original hash and attempt across restart without trusting it as confirmation',()=>{const p={attemptId:'id',epochId:3,root,fingerprint:hash,txHash:hash};expect(parsePendingPublication(JSON.stringify(p))).toEqual(p);expect(parsePendingPublication('{invalid')).toBeNull();expect(parsePendingPublication(JSON.stringify({...p,epochId:2}))).toBeNull();});
 it('persists wallet cancellation evidence across reload and strips invalid evidence',()=>{
  const p={attemptId:'id',epochId:3,root,fingerprint:hash,txHash:null,cancellation:{code:4001}};
  expect(parsePendingPublication(JSON.stringify(p))).toEqual(p);
  expect(parsePendingPublication(JSON.stringify({...p,cancellation:{code:'4001'}}))).toEqual({attemptId:'id',epochId:3,root,fingerprint:hash,txHash:null});
 });
});
