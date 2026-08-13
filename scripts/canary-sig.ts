import { keccak256, toHex } from 'viem';
const target='0x149e97aecc616341d5a67409106c097edb8b1cb696be297458e2f5c7e00c9d76';
const addrs=['address'],u=['uint256'];
const tails=[
 'uint256,address,address,address,uint256,uint256,uint256',
 'uint256,address,address,address,uint256,uint256,uint256,uint256',
 'uint256,address,address,address,uint256,uint256,uint256,bytes32',
 'uint256,address,address,address,uint256,uint256,uint256,uint256,uint256',
 'uint256,address,address,address,uint256,uint256,uint256,bool',
];
for (const t of tails){
 for (const name of ['BridgeRequested','BridgeInitiated','BridgeSubmitted','SourceBridgeRequested']){
  const sig=`${name}(${t})`;
  if (keccak256(toHex(sig))===target) console.log('MATCH',sig);
 }
}
const data='0x000000000000000000000000628e237b73c5a37ef3968527563fa1a26b32bb9700000000000000000000000000000000000000000000000091b77e5e5d9a000000000000000000000000000000000000000000000000000091b77e5e5d9a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
console.log('data words', (data.length-2)/64);
