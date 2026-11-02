import { createPublicClient, http, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import { VAULT_V2_CONFIG, vaultFlowToken } from './vaultV2';

const tokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)']);
export const vaultClient = () => createPublicClient({ transport: http('https://rpc.botchain.ai', { timeout: 15_000, retryCount: 1 }) });
export async function readVaultV2(wallet?: Address, config = VAULT_V2_CONFIG) {
  if (!config.address || !config.codeHash || !config.publisher || config.chainId !== 677) return null;
  const c = vaultClient();
  if (await c.getChainId() !== 677) throw new Error('Wrong Vault RPC chain');
  const block = await c.getBlock();
  const at = { blockNumber: block.number };
  const code = await c.getCode({ address: config.address, ...at });
  if (!code || code === '0x' || keccak256(code) !== config.codeHash) throw new Error('Vault code identity mismatch');
  const read = (name: 'flow'|'publisher'|'owner'|'paused'|'batchCap'|'dailyCap'|'totalLiabilities'|'freeBalance'|'creditDay'|'creditedToday') => c.readContract({address:config.address as Address,abi:VAULT_V2_ABI,functionName:name,...at});
  const [flow,publisher,owner,paused,batchCap,dailyCap,liabilities,free] = await Promise.all([read('flow'),read('publisher'),read('owner'),read('paused'),read('batchCap'),read('dailyCap'),read('totalLiabilities'),read('freeBalance')]);
  if (String(flow).toLowerCase() !== vaultFlowToken()?.toLowerCase() || String(publisher).toLowerCase() !== config.publisher.toLowerCase() || String(owner).toLowerCase() === String(publisher).toLowerCase()) throw new Error('Vault token or governance mismatch');
  const token = flow as Address;
  const [balance,decimals,claimable,claimed] = await Promise.all([
    c.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[config.address],...at}),
    c.readContract({address:token,abi:tokenAbi,functionName:'decimals',...at}),
    wallet ? c.readContract({address:config.address,abi:VAULT_V2_ABI,functionName:'claimable',args:[wallet],...at}):0n,
    wallet ? c.readContract({address:config.address,abi:VAULT_V2_ABI,functionName:'totalClaimed',args:[wallet],...at}):0n,
  ]);
  if (decimals !== 18 || balance < BigInt(liabilities) || BigInt(free) !== balance-BigInt(liabilities)) throw new Error('Vault backing mismatch');
  const [creditDay,creditedToday]=await Promise.all([read('creditDay'),read('creditedToday')]);
  const spent=BigInt(creditDay)===block.timestamp/86400n?BigInt(creditedToday):0n;
  if ((await c.getBlock({blockNumber:block.number})).hash !== block.hash) throw new Error('Chain reorganized; retry');
  return {address:config.address,codeHash:config.codeHash,owner:owner as Address,publisher:publisher as Address,paused:Boolean(paused),batchCap:BigInt(batchCap),dailyCap:BigInt(dailyCap),dailyRemaining:BigInt(dailyCap)>spent?BigInt(dailyCap)-spent:0n,liabilities:BigInt(liabilities),free:BigInt(free),balance,claimable,claimed,blockNumber:block.number,blockHash:block.hash as Hex};
}