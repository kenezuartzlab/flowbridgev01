import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import { createClaimStakePort } from './vaultV2ClaimStakeRead';
import type { ClaimStakeOperation, Intent } from './vaultV2ClaimStake';
const mocks=vi.hoisted(()=>({client:{getChainId:vi.fn(),getBlockNumber:vi.fn(),getBlock:vi.fn(),getTransaction:vi.fn(),waitForTransactionReceipt:vi.fn(),readContract:vi.fn()},provider:{request:vi.fn()}}));
vi.mock('./vaultV2Read',()=>({vaultClient:()=>mocks.client,readVaultV2:vi.fn()}));
vi.mock('@/lib/wallet/activeProvider',()=>({getActiveProvider:async()=>mocks.provider}));
const wallet='0x0000000000000000000000000000000000000001';
const token='0x0000000000000000000000000000000000000002';
const vault='0x0000000000000000000000000000000000000003';
const hash=`0x${'a'.repeat(64)}` as const;const blockHash=`0x${'b'.repeat(64)}` as const;
const op:ClaimStakeOperation={version:1,wallet,token,rewardVault:vault,stakingVault:vault,mode:'claim',claimAmount:'50',principal:'50',terms:'',complete:false,transactions:{}};
const intent:Intent={step:'claim',nonce:7,startBlock:'9',hash};
function port(){return createClaimStakePort({enabled:true,chainId:677,address:vault,codeHash:blockHash,publisher:token,cutoverVerified:true},wallet,async()=>wallet,()=>{},()=>{});}
beforeEach(()=>{
 vi.resetAllMocks();
 mocks.provider.request.mockImplementation(async({method})=>method==='eth_accounts'?[wallet]:'0x2a5');
 mocks.client.getBlockNumber.mockResolvedValue(12n);
 mocks.client.getBlock.mockResolvedValue({hash:blockHash});
 mocks.client.getTransaction.mockResolvedValue({from:wallet,to:vault,input:'0x4e71d92d',value:0n,nonce:7});
 const topics=encodeEventTopics({abi:VAULT_V2_ABI,eventName:'Claimed',args:{wallet}});
 mocks.client.waitForTransactionReceipt.mockResolvedValue({status:'success',transactionHash:hash,blockNumber:10n,blockHash,logs:[{address:vault,topics,data:encodeAbiParameters([{type:'uint256'}],[50n])}]});
 mocks.client.readContract.mockImplementation(async({functionName,blockNumber})=>functionName==='claimable'?0n:blockNumber===9n?100n:150n);
});
describe('guided flow authoritative mocked chain receipts',()=>{
 it('verifies exact claim event, canonical receipt and cumulative claimed state',async()=>{await expect(port().verify(intent,op)).resolves.toBe('success');});
 it('reverted canonical receipt is safely retryable',async()=>{mocks.client.waitForTransactionReceipt.mockResolvedValue({status:'reverted',transactionHash:hash,blockNumber:10n,blockHash,logs:[]});await expect(port().verify(intent,op)).resolves.toBe('reverted');});
 it('reorg retains pending operation and never confirms',async()=>{mocks.client.getBlock.mockResolvedValue({hash});await expect(port().verify(intent,op)).rejects.toThrow('reorganized');});
 it('insufficient confirmations fail closed',async()=>{mocks.client.getBlockNumber.mockResolvedValue(11n);await expect(port().verify(intent,op)).rejects.toThrow('unconfirmed');});
 it('different sender cannot establish claim',async()=>{mocks.client.getTransaction.mockResolvedValue({from:token,to:vault,input:'0x4e71d92d',value:0n,nonce:7});await expect(port().verify(intent,op)).rejects.toThrow('identity');});
 it('missing Claimed event never confirms',async()=>{mocks.client.waitForTransactionReceipt.mockResolvedValue({status:'success',transactionHash:hash,blockNumber:10n,blockHash,logs:[]});await expect(port().verify(intent,op)).rejects.toThrow('evidence');});
 it('incorrect claimed total delta never confirms',async()=>{mocks.client.readContract.mockResolvedValue(0n);await expect(port().verify(intent,op)).rejects.toThrow('evidence');});
 it('wrong chain blocks identity before wallet sends',async()=>{mocks.provider.request.mockImplementation(async({method})=>method==='eth_accounts'?[wallet]:'0x3c8');await expect(port().identity()).rejects.toThrow('Mainnet');expect(mocks.provider.request.mock.calls.some(([a])=>a.method==='eth_sendTransaction')).toBe(false);});
 it('stale bound wallet blocks identity',async()=>{const p=createClaimStakePort({enabled:true,chainId:677,address:vault,codeHash:blockHash,publisher:token,cutoverVerified:true},wallet,async()=>token,()=>{},()=>{});await expect(p.identity()).rejects.toThrow('account wallet changed');});
 it('unknown pre-broadcast intent never resends and bounded recovery fails closed',async()=>{mocks.client.getBlockNumber.mockResolvedValue(600n);await expect(port().verify({...intent,hash:null},op)).rejects.toThrow('manual receipt reconciliation');});
});