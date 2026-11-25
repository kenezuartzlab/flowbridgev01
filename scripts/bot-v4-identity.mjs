// Local identity check: compile the BOT native-V3-multi Router V4 source with pinned solc 0.8.20 (viaIR, shanghai, opt 200)
// and compare runtime against README hash and the live BOT Mainnet code (read-only eth_getCode). No writes.
import fs from 'node:fs'; import crypto from 'node:crypto';
import solc from 'solc-0.8.20';
const dir='contracts/production/router-v4-native-v3-multi', F='src/FlowBridgeRouterV4.sol', FILE='FlowBridgeRouterV4.sol';
const src=fs.readFileSync(`${dir}/${FILE}`,'utf8');
const input={language:'Solidity',sources:{[F]:{content:src}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',metadata:{bytecodeHash:'ipfs'},outputSelection:{'*':{'*':['evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
const errs=(out.errors??[]).filter(e=>e.severity==='error'); if(errs.length) throw new Error(errs.map(e=>e.formattedMessage).join('\n'));
const c=out.contracts[F].FlowBridgeRouterV4; const rt=c.evm.deployedBytecode.object;
const sha=(h)=>crypto.createHash('sha256').update(Buffer.from(h.replace(/^0x/,''),'hex')).digest('hex');
const README='a42e53b15977c57b81fa63c575b9cb39100b873c50a523b68f02df7bd8bec41d';
const strip=(h)=>{const b=h.replace(/^0x/,'');const n=parseInt(b.slice(-4),16);return b.slice(0,b.length-(n+2)*2);};
let live=null, liveBlock=null, err=null;
try{const rpc=async(m,p)=>(await (await fetch('https://rpc.botchain.ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})})).json()).result;
 liveBlock=await rpc('eth_getBlockByNumber',['latest',false]); live=await rpc('eth_getCode',['0x79653140D84B78C19354ee984f236Ec92160fc61',liveBlock.number]);}catch(e){err=String(e);}
const r={generatedAt:new Date().toISOString(),source:`${dir}/${FILE}`,metadataSourceUnit:F,sourceSha256:crypto.createHash('sha256').update(src).digest('hex'),compiler:solc.version(),settings:'optimizer 200, viaIR, shanghai, ipfs metadata',
 immutableReferences:Object.keys(c.evm.deployedBytecode.immutableReferences??{}).length,
 localRuntimeBytes:rt.length/2,localRuntimeSha256:sha(rt),readmeRuntimeSha256:README,localMatchesReadme:sha(rt)===README,
 mainnet:{chainId:677,address:'0x79653140D84B78C19354ee984f236Ec92160fc61',rpc:'https://rpc.botchain.ai',block:liveBlock?{number:parseInt(liveBlock.number,16),hash:liveBlock.hash,timestamp:parseInt(liveBlock.timestamp,16)}:null,
  liveRuntimeBytes:live?(live.length-2)/2:null,liveRuntimeSha256:live?sha(live):null,exactMatch:live?sha(live)===sha(rt):null,matchExcludingMetadata:live?strip(live)===strip(rt):null,error:err}};
fs.mkdirSync('docs/security/bnb-bot-v4-parity',{recursive:true});
fs.writeFileSync('docs/security/bnb-bot-v4-parity/bot-v4-identity.json',JSON.stringify(r,null,2)+'\n'); console.log(JSON.stringify(r,null,1));
