import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
const erc=parseAbi(['function balanceOf(address) view returns (uint256)']);
for (const url of ['https://rpc-testnet.bit-origin.io','https://testnet-rpc.bit-origin.io']){
 try{
  const c=createPublicClient({transport:http(url)});
  const b=await c.readContract({address:'0x75edC9335175Fc0552D51D48439F229c10420fe3',abi:erc,functionName:'balanceOf',args:['0x628e237b73C5a37EF3968527563FA1a26b32BB97']});
  console.log(url,'dest USDT',formatUnits(b as bigint,6));break;
 }catch(e){console.log('rpc fail',url,String(e).slice(0,80));}
}
