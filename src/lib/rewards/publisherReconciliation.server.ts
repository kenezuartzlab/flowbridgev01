import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import { DISTRIBUTOR } from './settlement.server';
import { DISTRIBUTOR_ROLES, SETTLEMENT_SIGNER } from './settlementPlanner';

const abi = parseAbi(['function epochCount() view returns(uint256)', 'function hasRole(bytes32,address) view returns(bool)']);
export const publicationClient = () => createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:15000,retryCount:0})});
export async function publicationPreflight(epoch: number) {
  const c = publicationClient();
  const [chain, head, count, role, latest, pending] = await Promise.all([
    c.getChainId(), c.getBlockNumber(), c.readContract({address:DISTRIBUTOR,abi,functionName:'epochCount'}),
    c.readContract({address:DISTRIBUTOR,abi,functionName:'hasRole',args:[DISTRIBUTOR_ROLES.PUBLISHER_ROLE,SETTLEMENT_SIGNER.address]}),
    c.getTransactionCount({address:SETTLEMENT_SIGNER.address,blockTag:'latest'}), c.getTransactionCount({address:SETTLEMENT_SIGNER.address,blockTag:'pending'}),
  ]);
  if(chain!==677 || !role) throw new Error('Publisher network or role invalid');
  return {head, count:Number(count), latest, pending, epochAvailable:Number(count)===epoch-1};
}
export async function recoverPublisherHash(a: {sender: string | null; sender_nonce: number | null; start_block: number | null; expected_calldata: string | null}, head: bigint): Promise<Hex | null> {
  if(!a.sender || a.sender_nonce===null || a.start_block===null || !a.expected_calldata) return null;
  if(a.sender.toLowerCase()!==SETTLEMENT_SIGNER.address.toLowerCase()) throw new Error('Sender mismatch');
  const c=publicationClient();
  // Bounded read-only search. Outside this range uncertainty stays locked; never infer failure.
  const start=BigInt(a.start_block); if(head-start>256n) return null;
  for(let n=head;n>=start;n--) {
    const block=await c.getBlock({blockNumber:n,includeTransactions:true});
    const tx=block.transactions.find(t=>typeof t!=='string' && t.from.toLowerCase()===a.sender?.toLowerCase() && t.nonce===a.sender_nonce);
    if(tx && typeof tx!=='string') {
      if(tx.to?.toLowerCase()!==DISTRIBUTOR.toLowerCase() || tx.input.toLowerCase()!==a.expected_calldata.toLowerCase() || tx.value!==0n) return null;
      return tx.hash;
    }
  }
  return null;
}
export async function publicationNonceMatches(hash: Hex, nonce: number | null) {
  if(nonce===null) return false;
  return (await publicationClient().getTransaction({hash})).nonce===nonce;
}