import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({getChainId:vi.fn(),getBlockNumber:vi.fn(),readContract:vi.fn(),getTransactionCount:vi.fn(),getBlock:vi.fn(),getTransaction:vi.fn()}));
vi.mock('viem',async()=>({...await vi.importActual('viem'),createPublicClient:()=>m}));
vi.mock('./settlement.server',()=>({DISTRIBUTOR:'0x'+'1'.repeat(40)}));
import {publicationPreflight,recoverPublisherHash,publicationNonceMatches} from './publisherReconciliation.server';
beforeEach(()=>{vi.resetAllMocks();m.getChainId.mockResolvedValue(677);m.getBlockNumber.mockResolvedValue(100n);m.readContract.mockImplementation(({functionName})=>Promise.resolve(functionName==='hasRole'?true:2n));m.getTransactionCount.mockResolvedValue(42);});
describe('read-only nonce recovery',()=>{
 it('recorded nonce must equal the original transaction nonce',async()=>{m.getTransaction.mockResolvedValue({nonce:42});expect(await publicationNonceMatches(('0x'+'a'.repeat(64)) as `0x${string}`,42)).toBe(true);expect(await publicationNonceMatches(('0x'+'a'.repeat(64)) as `0x${string}`,43)).toBe(false);});
 it('round three available only with chain 677 and authorized publisher role',async()=>{expect((await publicationPreflight(3)).epochAvailable).toBe(true);m.getChainId.mockResolvedValue(1);await expect(publicationPreflight(3)).rejects.toThrow();});
 it('pending nonce is retained rather than assumed failed',async()=>{m.getTransactionCount.mockImplementation(({blockTag})=>Promise.resolve(blockTag==='pending'?43:42));const r=await publicationPreflight(3);expect(r.latest).toBe(42);expect(r.pending).toBe(43);});
 it('refresh without recorded nonce or outside bounded search stays uncertain',async()=>{expect(await recoverPublisherHash({sender:null,sender_nonce:null,start_block:null,expected_calldata:null},100n)).toBeNull();expect(m.getBlock).not.toHaveBeenCalled();});
});