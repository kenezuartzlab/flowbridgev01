// Builds UNSIGNED constructor calldata only. No wallet/key/signing/broadcast.
import fs from 'node:fs';
import { encodeDeployData,isAddress } from 'viem';
const [chain,token,admin,publisher]=process.argv.slice(2);
if(!['677','968'].includes(chain)||![token,admin,publisher].every(isAddress)||admin.toLowerCase()===publisher.toLowerCase())throw new Error('Usage: node deployment-dry-run.mjs <677|968> <verified FLOW> <admin multisig> <distinct publisher>');
if(chain==='677' && token.toLowerCase()!=='0xcaab50f36252a57529afef651fa6b9f9281917ff')throw new Error('Mainnet FLOW does not match canonical registry');
const artifact=JSON.parse(fs.readFileSync('contracts/production/rewards-vault-v2/artifacts/FlowRewardsVaultV2.json','utf8'));
console.log(JSON.stringify({chainId:Number(chain),status:'UNSIGNED_ONLY',initiallyPaused:true,batchCap:'0',dailyCap:'0',token,admin,publisher,data:encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args:[token,admin,publisher]})},null,2));