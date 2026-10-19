import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({client:{getChainId:vi.fn(),getTransaction:vi.fn(),getTransactionReceipt:vi.fn(),getBlock:vi.fn(),getBlockNumber:vi.fn(),readContract:vi.fn()},identity:vi.fn(),live:vi.fn(),epoch:vi.fn(),round:vi.fn()}));
vi.mock('viem',async()=>({...await vi.importActual('viem'),createPublicClient:()=>mocks.client}));
vi.mock('./publicationVerification',()=>({verifyPublicationIdentity:mocks.identity}));
vi.mock('./settlement.server',()=>({DISTRIBUTOR:'0x'+'1'.repeat(40),readChainState:mocks.live,readEpoch:mocks.epoch}));
vi.mock('./settlementPlanner',()=>({DISTRIBUTOR_ROLES:{PUBLISHER_ROLE:'0x'+'2'.repeat(64)},verifyPublishedRound:mocks.round}));
import {verifyPublicationOnChain} from './publicationRecovery.server';
import type {StoredBatch} from './settlementPlanner';
const hash=('0x'+'a'.repeat(64)) as `0x${string}`;
const batch={epochId:3,root:hash,totalWei:'1000',claimStart:1,claimEnd:2,leaves:[]} as StoredBatch;
beforeEach(()=>{
 vi.resetAllMocks();mocks.client.getChainId.mockResolvedValue(677);mocks.client.getTransaction.mockResolvedValue({from:'0x'+'1'.repeat(40),chainId:677});mocks.client.getTransactionReceipt.mockResolvedValue({status:'success',blockHash:hash,blockNumber:100n});mocks.client.getBlock.mockResolvedValue({hash});mocks.client.getBlockNumber.mockResolvedValue(101n);mocks.client.readContract.mockResolvedValue(true);mocks.identity.mockReturnValue({complete:true,checks:[]});mocks.live.mockResolvedValue({epochCount:3,paused:false,balanceWei:1000n,totalReservedWei:1000n});mocks.epoch.mockResolvedValue({root:hash});mocks.round.mockReturnValue({complete:true,checks:[]});
});
describe('publisher recovery service',()=>{
 it('confirms only with canonical receipt identity and live matching batch',async()=>expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('CONFIRMED_VERIFIED'));
 it('RPC timeout remains unavailable then recovers against the same hash',async()=>{
  mocks.client.getTransactionReceipt.mockRejectedValueOnce(new Error('timeout'));
  await expect(verifyPublicationOnChain(batch,hash,'operator')).rejects.toThrow('timeout');
  expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('CONFIRMED_VERIFIED');
  expect(mocks.client.getTransactionReceipt.mock.calls.map(c=>c[0].hash)).toEqual([hash,hash]);
 });
 it('dropped/not-found hash stays pending without send',async()=>{
  const e=new Error('missing');e.name='TransactionNotFoundError';mocks.client.getTransaction.mockRejectedValue(e);
  expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('BROADCAST_PENDING');
 });
 it('chain reorganization does not confirm',async()=>{mocks.client.getBlock.mockResolvedValue({hash:'0x'+'b'.repeat(64)});expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('BROADCAST_PENDING');});
 it('waits for second canonical block',async()=>{mocks.client.getBlockNumber.mockResolvedValue(100n);expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('BROADCAST_PENDING');});
 it('rejects wrong RPC network',async()=>{mocks.client.getChainId.mockResolvedValue(1);await expect(verifyPublicationOnChain(batch,hash,'operator')).rejects.toThrow('WRONG_RPC_CHAIN');});
 it('reverted receipt never confirms',async()=>{mocks.client.getTransactionReceipt.mockResolvedValue({status:'reverted',blockHash:hash,blockNumber:100n});expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('REVERTED');});
  it('unrelated reverted transaction must not unlock a publisher batch',async()=>{mocks.client.getTransactionReceipt.mockResolvedValue({status:'reverted',blockHash:hash,blockNumber:100n});mocks.identity.mockReturnValue({complete:false,checks:[{id:'EXACT_PUBLISH_CALL',pass:false}]});expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('CONFIRMED_MISMATCH');});
 it('receipt or event mismatch never confirms',async()=>{mocks.identity.mockReturnValue({complete:false,checks:[]});expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('CONFIRMED_MISMATCH');});
 it('live batch mismatch never confirms',async()=>{mocks.round.mockReturnValue({complete:false,checks:[]});expect((await verifyPublicationOnChain(batch,hash,'operator')).phase).toBe('CONFIRMED_MISMATCH');});
 it('concurrent repeated rechecks are read-only and yield same hash/block',async()=>{const r=await Promise.all(Array.from({length:5},()=>verifyPublicationOnChain(batch,hash,'operator')));expect(r.every(x=>x.phase==='CONFIRMED_VERIFIED'&&x.blockHash===hash)).toBe(true);});
});
