/** Pure receipt identity checks; never signs or trusts a client publisher address. */
import { decodeEventLog, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { PUBLISH_EPOCH_ABI, SETTLEMENT_SIGNER, type StoredBatch } from './settlementPlanner';
export const PUBLICATION_EVENT_ABI = parseAbi(['event EpochPublished(uint256 indexed epochId, bytes32 root, uint256 allocation, uint64 claimStart, uint64 claimEnd)']);
export interface PublicationEvidence {
 chainId: number; operatorWallet: string; publisherRole: boolean;
 tx: { hash: string; from: string; to: string | null; input: Hex; value: bigint; chainId: number; blockHash: string | null } | null;
 receipt: { transactionHash: string; from: string; to: string | null; status: 'success' | 'reverted'; blockHash: string; blockNumber: bigint; logs: { address: string; data: Hex; topics: readonly Hex[] }[] } | null;
 canonicalBlockHash: string | null; head: bigint; distributor: string; batch: StoredBatch;
}
export function verifyPublicationIdentity(p: PublicationEvidence) {
 const checks: { id: string; pass: boolean }[] = [];
 const add = (id: string, pass: boolean) => checks.push({id,pass});
 const eq = (a: string | null | undefined,b: string) => a?.toLowerCase() === b.toLowerCase();
 const expected = encodeFunctionData({abi:PUBLISH_EPOCH_ABI,functionName:'publishEpoch',args:[p.batch.root,BigInt(p.batch.totalWei),BigInt(p.batch.claimStart),BigInt(p.batch.claimEnd)]});
 add('CHAIN_677',p.chainId===677 && p.tx?.chainId===677);
 add('OPERATOR_PUBLISHER',eq(p.operatorWallet,SETTLEMENT_SIGNER.address));
 add('TRANSACTION_SENDER',eq(p.tx?.from,SETTLEMENT_SIGNER.address) && eq(p.receipt?.from,SETTLEMENT_SIGNER.address));
 add('PUBLISHER_ROLE_AT_RECEIPT',p.publisherRole);
 add('DISTRIBUTOR',eq(p.tx?.to,p.distributor) && eq(p.receipt?.to,p.distributor));
 add('TRANSACTION_HASH',!!p.tx && eq(p.receipt?.transactionHash,p.tx.hash));
 add('EXACT_PUBLISH_CALL',p.tx?.input.toLowerCase()===expected.toLowerCase() && p.tx.value===0n);
 add('RECEIPT_SUCCESS',p.receipt?.status==='success');
 add('CANONICAL_CONFIRMATIONS',!!p.receipt && eq(p.canonicalBlockHash,p.receipt.blockHash) && eq(p.tx?.blockHash,p.receipt.blockHash) && p.head>=p.receipt.blockNumber+1n);
 const event = p.receipt?.logs.some(l=> {
  if(!eq(l.address,p.distributor)) return false;
  try {
   const decoded=decodeEventLog({abi:PUBLICATION_EVENT_ABI,data:l.data,topics:l.topics as [Hex,...Hex[]]});
   const a=decoded.args;
   return a.epochId===BigInt(p.batch.epochId) && eq(a.root,p.batch.root) && a.allocation===BigInt(p.batch.totalWei) && a.claimStart===BigInt(p.batch.claimStart) && a.claimEnd===BigInt(p.batch.claimEnd);
  } catch { return false; }
 });
 add('EXACT_EPOCH_PUBLISHED_EVENT',!!event);
 return {complete:checks.every(c=>c.pass),checks};
}
export type PendingPublication = { attemptId: string; operationId?: string; epochId: number; root: string; fingerprint: string; txHash: string | null; cancellation?: { code: number } };
export const PENDING_PUBLICATION_KEY='flowbridge.publisher.pending.v1';
export function parsePendingPublication(raw: string | null): PendingPublication | null {
 try { const p=JSON.parse(raw ?? 'null'); return p && typeof p.attemptId==='string' && Number.isInteger(p.epochId) && p.epochId>2 && /^0x[0-9a-f]{64}$/i.test(p.root) && typeof p.fingerprint==='string' && (p.txHash===null || /^0x[0-9a-f]{64}$/i.test(p.txHash)) ? p : null; } catch {return null;}
}
