import { keccak256, toHex, toFunctionSelector, encodeAbiParameters, parseAbiParameters, stringToBytes } from 'viem';
const sel = s => toFunctionSelector(s);
const R='https://rpc.botchain.ai';
const T='0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e';
const rpc = async (method,params)=>{const r=await fetch(R,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return await r.json();};
const call=(to,data,from)=>rpc('eth_call',[{to,data,...(from?{from}:{})},'latest']);
const vr = await call(T, sel('function VAULT_ROLE() view returns (bytes32)'));
console.log('VAULT_ROLE', vr.result);
const role = vr.result;
const cd = sel('function grantRole(bytes32,address)') + encodeAbiParameters(parseAbiParameters('bytes32,address'),[role,'0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8']).slice(2);
console.log('calldata', cd);
console.log('calldataHash', keccak256(cd));
const has=(r,a)=>call(T, sel('function hasRole(bytes32,address) view returns (bool)')+encodeAbiParameters(parseAbiParameters('bytes32,address'),[r,a]).slice(2));
console.log('hasRole(VAULT_ROLE,vault)', (await has(role,'0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8')).result);
const ZERO='0x'+'0'.repeat(64);
console.log('gov default admin', (await has(ZERO,'0x88A4CC1F5771523baeB83DaEea07D323a3ce9507')).result);
console.log('CONTROLLER_ROLE', (await call(T, sel('function CONTROLLER_ROLE() view returns (bytes32)'))).result);
for (const f of ['reservedGenesis','reservedFloors','committedEpoch','accruedUnclaimed','freeBalance','totalObligations','recoveryRecipient','token']) {
  console.log(f, (await call(T, sel(`function ${f}() view returns (uint256)`))).result);
}
console.log('balance FLOW', (await call('0x535dDDA826142AC42cE288154e9595f080940aE9', sel('function balanceOf(address) view returns (uint256)')+encodeAbiParameters(parseAbiParameters('address'),[T]).slice(2))).result);
console.log('gasEstimate from Safe', JSON.stringify(await rpc('eth_estimateGas',[{from:'0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',to:T,data:cd,value:'0x0'}])));
console.log('deployer call', JSON.stringify(await call(T,cd,'0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD')));
console.log('block', (await rpc('eth_blockNumber',[])).result, 'gasPrice', (await rpc('eth_gasPrice',[])).result);
