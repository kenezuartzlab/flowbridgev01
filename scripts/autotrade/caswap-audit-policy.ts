// Local/offline audit helpers. Never imported by application execution code.
import { getAddress, type Address } from 'viem';
export const READ_METHODS = new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getLogs','eth_getBalance','eth_getTransactionReceipt','eth_getTransactionByHash']);
export function assertAuditTransport(url: string, method: string) {
  const u=new URL(url);
  const local=u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='8547';
  const official=url==='https://rpc.botchain.ai'||url==='https://scan.botchain.ai/api/eth-rpc';
  if(!local&&!official)throw Error('AUDIT_ORIGIN_REJECTED');
  if(!local&&!READ_METHODS.has(method))throw Error('MAINNET_WRITE_REJECTED');
  if(method.toLowerCase().includes('sign'))throw Error('SIGNING_REJECTED');
}
export function normalizedReserve(raw: bigint, decimals: number): string {
  if(raw<0n||!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('INVALID_RESERVE');
  const unit=10n**BigInt(decimals);return `${raw/unit}.${(raw%unit).toString().padStart(decimals,'0')}`;
}
export function constantProductOut(input:bigint,rIn:bigint,rOut:bigint,bps:bigint):bigint {
 if(input<=0n||rIn<=0n||rOut<=0n||bps<0n||bps>10000n)throw Error('INVALID_QUOTE');
 const net=input-input*bps/10000n;return net*rOut/(rIn+net);
}
export function exactRegistryPreview(router:Address,wrapper:Address){
 if(getAddress(router)!==getAddress('0xe3c1bCEF83C23331593f38B85e16Cf172C022737')||getAddress(wrapper)!==getAddress('0x68CAeA9104419203cF8b8f0B222E75709B97bfc6'))throw Error('IDENTITY_MISMATCH');
 return {router:getAddress(router),rtype:0,wrappedNative:getAddress(wrapper),name:'CaSwap V2',version:'verified-0.6.12',activation:'NOT_AUTHORIZED',defaultRoute:'UNCHANGED_BDEX_V3'} as const;
}
