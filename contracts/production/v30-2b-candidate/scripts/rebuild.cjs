const {createHash}=require('crypto');const fs=require('fs');const path=require('path');
const D='/dev-server/contracts/production/v30-2b-candidate';
const SRC=path.join(D,'sources');
function findImport(p){
  const f=path.join(SRC,p);
  if(fs.existsSync(f))return{contents:fs.readFileSync(f,'utf8')};
  return{error:'not found '+p};
}
const input={language:'Solidity',sources:{'FlowToken.sol':{content:fs.readFileSync(path.join(SRC,'FlowToken.sol'),'utf8')}},
settings:{optimizer:{enabled:true,runs:200},viaIR:false,evmVersion:'cancun',metadata:{bytecodeHash:'ipfs',appendCBOR:true},
outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','metadata']}}}};
function compile(){
  delete require.cache[require.resolve('/dev-server/node_modules/solc')];
  const solc=require('/dev-server/node_modules/solc');
  const out=JSON.parse(solc.compile(JSON.stringify(input),{import:findImport}));
  const errs=(out.errors||[]).filter(e=>e.severity==='error');
  if(errs.length){console.error(errs.map(e=>e.formattedMessage).join('\n'));process.exit(1);}
  return {a:out.contracts['FlowToken.sol'].FlowToken, v:solc.version()};
}
const h=s=>createHash('sha256').update(s).digest('hex');
const hb=x=>h(Buffer.from(x.replace(/^0x/,''),'hex'));
const one=compile(),two=compile();
const A=one.a,B=two.a;
const res={solc:one.v,
 sourceSha:h(fs.readFileSync(path.join(SRC,'FlowToken.sol'))),
 creationSha:hb(A.evm.bytecode.object),runtimeSha:hb(A.evm.deployedBytecode.object),
 abiSha:h(JSON.stringify(A.abi)),
 creationBytes:A.evm.bytecode.object.length/2,runtimeBytes:A.evm.deployedBytecode.object.length/2,
 doubleBuild: hb(A.evm.bytecode.object)===hb(B.evm.bytecode.object)&&hb(A.evm.deployedBytecode.object)===hb(B.evm.deployedBytecode.object)&&h(JSON.stringify(A.abi))===h(JSON.stringify(B.abi))};
const args=fs.readFileSync('/dev-server/contracts/production/v30-2a-candidate/multipart-flowtoken/constructor-args.txt','utf8').trim().replace(/^0x/,'');
const data='0x'+A.evm.bytecode.object+args;
fs.writeFileSync('/tmp/deploydata.txt',data);
res.standardInputSha=h(JSON.stringify(input));
fs.writeFileSync('/tmp/standard-input-2b.json',JSON.stringify(input));
fs.writeFileSync('/tmp/abi-2b.json',JSON.stringify(A.abi));
console.log(JSON.stringify(res,null,2));
