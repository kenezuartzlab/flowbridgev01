// Offline only: produces a self-contained verification input and unsigned templates.
// No key access, RPC write, signing, or deployment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import solc from 'solc-0.8.20';
import { encodeDeployData, keccak256 } from 'viem';
const base='contracts/production/rewards-vault-v2';
const destination=process.argv[2];
if(!destination) throw new Error('Supply an output directory for the verification bundle.');
if(!solc.version().startsWith('0.8.20+')) throw new Error('Compiler mismatch');
if(JSON.parse(fs.readFileSync('node_modules/@openzeppelin/contracts/package.json','utf8')).version!=='5.0.2') throw new Error('OpenZeppelin mismatch');
const sources={};
function include(name){
 if(sources[name])return;
 const content=fs.readFileSync(name==='FlowRewardsVaultV2.sol'?`${base}/${name}`:path.join('node_modules',name),'utf8');
 sources[name]={content};
 for(const match of content.matchAll(/import\s+(?:[^;]*?from\s+)?["']([^"']+)["']\s*;/g)){
  const dependency=match[1].startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1])):match[1];include(dependency);
 }
}
include('FlowRewardsVaultV2.sol');
const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
const serialized=JSON.stringify(input);
const first=JSON.parse(solc.compile(serialized));const second=JSON.parse(solc.compile(serialized));
if(first.errors?.some(e=>e.severity==='error'))throw new Error('Compilation failed');
const contract=first.contracts['FlowRewardsVaultV2.sol'].FlowRewardsVaultV2;
const saved=JSON.parse(fs.readFileSync(`${base}/artifacts/FlowRewardsVaultV2.json`,'utf8'));
if(JSON.stringify(first)!==JSON.stringify(second)||contract.evm.bytecode.object!==saved.evm.bytecode.object||contract.evm.deployedBytecode.object!==saved.evm.deployedBytecode.object||JSON.stringify(contract.abi)!==JSON.stringify(saved.abi))throw new Error('Frozen artifact or repeat build mismatch');
fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(`${destination}/standard-input.json`,JSON.stringify(input,null,2));
fs.writeFileSync(`${destination}/compiler-output.json`,JSON.stringify(first,null,2));
fs.writeFileSync(`${destination}/artifact.json`,JSON.stringify({compiler:solc.version(),openzeppelin:'5.0.2',...contract},null,2));
const admin='0x88A4CC1F5771523baeB83DaEea07D323a3ce9507';
const publisher='0x971E7790FE6C8F77dc666Bb05D4aedA362653f94';
const manifest={compiler:solc.version(),openzeppelin:'5.0.2',optimizerRuns:200,evmVersion:'paris',sourceCount:Object.keys(sources).length,creationBytes:contract.evm.bytecode.object.length/2,runtimeBytes:contract.evm.deployedBytecode.object.length/2,eip170Limit:24576,creationKeccak:keccak256(`0x${contract.evm.bytecode.object}`),unpatchedRuntimeKeccak:keccak256(`0x${contract.evm.deployedBytecode.object}`),immutableReferences:contract.evm.deployedBytecode.immutableReferences,repeatBuildAndFrozenParity:'PASS',initiallyPaused:true,initialBatchCap:'0',initialDailyCap:'0',financialAuthorization:false};
fs.writeFileSync(`${destination}/manifest.json`,JSON.stringify(manifest,null,2));
// Mainnet parameters are historical canonical candidates, freshly read-verified separately.
// This is NOT authorization to deploy. No sender/nonce/gas or receipt is invented.
fs.writeFileSync(`${destination}/mainnet-unsigned-candidate.json`,JSON.stringify({status:'UNSIGNED_NOT_AUTHORIZED',chainId:677,token:'0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',admin,publisher,transaction:{value:'0x0',data:encodeDeployData({abi:contract.abi,bytecode:`0x${contract.evm.bytecode.object}`,args:['0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',admin,publisher]})}},null,2));
fs.writeFileSync(`${destination}/testnet-unsigned-template.json`,JSON.stringify({status:'BLOCKED_MISSING_VERIFIED_TESTNET_ADMIN_AND_SIGNER_AUTHORIZATION',chainId:968,token:'0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac',admin:null,publisherCandidate:publisher,from:null,constructorOrder:['token','verifiedAdminMultisig','authorizedDistinctPublisher'],creationBytecode:`0x${contract.evm.bytecode.object}`,value:'0x0',initiallyPaused:true,batchCap:'0',dailyCap:'0',instruction:'Supply chain-968 multisig with at least 3 distinct owners / threshold at least 2, and explicitly authorize the testnet signer; then use deployment-dry-run.mjs. Do not reuse a Mainnet Safe with no Testnet code.'},null,2));
const hashes={};for(const file of fs.readdirSync(destination).sort())if(fs.statSync(`${destination}/${file}`).isFile())hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(`${destination}/${file}`)).digest('hex');
fs.writeFileSync(`${destination}/sha256.json`,JSON.stringify(hashes,null,2));
console.log(JSON.stringify(manifest,null,2));