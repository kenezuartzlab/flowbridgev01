import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error local mjs
import { build } from './bnb-bot-v4-crosswalk.mjs';
const D='docs/security/bnb-bot-v4-parity/';
const sha=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
describe('BOT V4 vs BNB V1.13 parity evidence integrity',()=>{
  it('crosswalk anchors match the exact current sources (no stale lines/hashes)',()=>{expect(build()).toEqual(JSON.parse(fs.readFileSync(D+'crosswalk.json','utf8')));});
  it('compares the deployed native-V3-multi baseline, never the older router-v4 source',()=>{const c=JSON.parse(fs.readFileSync(D+'crosswalk.json','utf8'));expect(c.sources.bot.path).toBe('contracts/production/router-v4-native-v3-multi/FlowBridgeRouterV4.sol');
    const id=JSON.parse(fs.readFileSync(D+'bot-v4-identity.json','utf8'));expect(id.sourceSha256).toBe(c.sources.bot.sha256);expect(id.mainnet.liveRuntimeSha256).toBe(id.readmeRuntimeSha256);expect(id.mainnet.matchExcludingMetadata).toBe(true);});
  it('V1.13 source freeze is untouched by this review',()=>{expect(sha('contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol')).toBe('5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425');});
  it('fresh Slither keeps six BNB HIGH reentrancy-balance findings, none suppressed or called resolved',()=>{const s=JSON.parse(fs.readFileSync(D+'slither-v113-fresh.json','utf8'));const h=s.results.detectors.filter((x:any)=>x.impact==='High');expect(h).toHaveLength(6);expect(h.every((x:any)=>x.check==='reentrancy-balance')).toBe(true);
    const disp=JSON.parse(fs.readFileSync(D+'high-dispositions.json','utf8'));expect(disp.findings).toHaveLength(6);expect(disp.findings.every((f:any)=>f.status==='OPEN')).toBe(true);});
  it('every classification is one of the four allowed labels',()=>{const c=JSON.parse(fs.readFileSync(D+'crosswalk.json','utf8'));for(const r of c.rows)expect(['REUSABLE PATTERN','NEEDS BNB ADAPTATION','BOT-ONLY','UNSUPPORTED']).toContain(r.classification);});
});
