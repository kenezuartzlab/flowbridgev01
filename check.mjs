import { createPublicClient, http, parseAbi } from 'viem';
const c = createPublicClient({ transport: http('https://rpc.botchain.ai') });
const abi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function factory() view returns (address)',
]);
const lp = '0xB9044d8df4C81ac577E5BF69eDcb23555514CC82';
const router = '0x1414eD29FdFD322c3c0a830330ed982E2D629e76';
const routerAbi = parseAbi(['function factory() view returns (address)','function WETH() view returns (address)']);
try {
  const [t0,t1,r,f] = await Promise.all([
    c.readContract({address:lp,abi,functionName:'token0'}),
    c.readContract({address:lp,abi,functionName:'token1'}),
    c.readContract({address:lp,abi,functionName:'getReserves'}),
    c.readContract({address:lp,abi,functionName:'factory'}),
  ]);
  console.log('LP token0:', t0);
  console.log('LP token1:', t1);
  console.log('LP reserves:', r);
  console.log('LP factory:', f);
} catch(e){console.log('LP err',e.message)}
try {
  const [f,w] = await Promise.all([
    c.readContract({address:router,abi:routerAbi,functionName:'factory'}),
    c.readContract({address:router,abi:routerAbi,functionName:'WETH'}),
  ]);
  console.log('Router factory:', f);
  console.log('Router WETH:', w);
} catch(e){console.log('Router err',e.message)}
