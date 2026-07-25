import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
const c = createPublicClient({ transport: http('https://rpc.botchain.ai') });
const R='0x986962de6F00D0eC571b1a34Fa70AEeB445b5445';
const abi=parseAbi([
 'function computeRouterFee(uint256 routerId, uint256 swapAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
 'function swapTokenToNative(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256 amountOut)',
]);
const U='0x3d8a7fa490f9db09dd8006b74688213ace9c0164';
const CA='0x546307af427902a75771434df831d88219784e19';
const CAW='0x68caea9104419203cf8b8f0b222e75709b97bfc6';
const bal=0x1ae4569a3594000n;
console.log('fee', await c.readContract({address:R,abi,functionName:'computeRouterFee',args:[3n,bal,U]}));
for (const frac of [1000n, 995n, 990n]) {
  const amt = bal*frac/1000n;
  try {
    const r = await c.simulateContract({address:R,abi,functionName:'swapTokenToNative',args:[3n,CA,0,amt,0n,[CA,CAW],U,BigInt(Math.floor(Date.now()/1e3)+600)],account:U});
    console.log(frac, 'OK', r.result);
  } catch(e){ console.log(frac, 'FAIL', (e.shortMessage||e.message).slice(0,160)); }
}
