/** Local release evidence only. Never builds, signs or touches financial records. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const output='/tmp/flowbridge-release';mkdirSync(output,{recursive:true});
const checks:Record<string,unknown>[]=[];
for(const [name,args] of [['regression',['bunx','vitest','run']],['dependencies',['bun','audit']],['production-dependencies',['bun','audit','--production']]] as const){
 const [command,...rest]=args;const result=spawnSync(command,rest,{encoding:'utf8',maxBuffer:20*1024*1024});
 writeFileSync(`${output}/${name}.log`,(result.stdout??'')+(result.stderr??''));checks.push({name,pass:result.status===0});
}
let build='unavailable';try{build=readFileSync('/tmp/observability/build-errors.log','utf8').trim().split('\n').at(-1)??'unavailable';}catch{}
checks.push({name:'automatic-build',pass:build==='build OK',observed:build});
checks.push({name:'production-wallet-and-release-approval',pass:false,reason:'Requires actual authenticated deployment, supported device acceptance and release-scoped security approval; never inferred from tests.'});
writeFileSync(`${output}/acceptance.json`,JSON.stringify({release:'V36.11',at:new Date().toISOString(),checks,productionPass:checks.every(c=>c.pass===true)},null,2));
console.log(`Release evidence recorded at ${output}; ${checks.every(c=>c.pass===true)?'PASS':'HOLD'}`);
process.exitCode=checks.every(c=>c.pass===true)?0:1;