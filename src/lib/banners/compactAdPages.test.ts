import { describe,it,expect } from 'vitest';
import { COMPACT_AD_PAGES,compactAdPage } from './compactAdPages';
import { compactPagePlacementSchema,dockedAdSchema,type DockedAdSettings } from './promotionPolicy';
import { dismissalKey,selectPageAd,dismissalBlocks } from './dockedAdPolicy';
import { readFileSync,readdirSync } from 'node:fs';
const slide={id:'one',title:'Ad',imageUrl:'/api/banner-image/one.png',promotion:{presentationVersion:2 as const,status:'published' as const,sponsored:true}};
const rule=()=>compactPagePlacementSchema.parse({enabled:true,creativeIds:['one']});
const config=():DockedAdSettings=>({...dockedAdSchema.parse({}),enabled:true,pages:{home:rule(),earn:rule()},slides:[slide]});
describe('required independent compact page manager',()=>{
  it('every existing UI content route is explicitly inventoried, including excluded pages',()=>{
    const files=readdirSync('src/routes',{recursive:true,withFileTypes:true}).filter(f=>f.isFile()&&f.name.endsWith('.tsx')&&f.name!=='__root.tsx');
    for(const file of files){const text=readFileSync(`${file.parentPath}/${file.name}`,'utf8');const route=text.match(/createFileRoute\(["']([^"']+)["']\)/)?.[1];if(!route)continue;
      if(route==='/'||route==='/trade')continue;
      expect(COMPACT_AD_PAGES.some(p=>p.route===route.replace(/\/$/,'')),`Unregistered content route: ${route}`).toBe(true);
    }
  });
  for(const page of COMPACT_AD_PAGES)it(`${page.id} defaults OFF${page.eligible?'':' and is excluded'}`,()=>{
    expect(selectPageAd({...config(),pages:{}},page.id,false)).toBeNull();
    if(!page.eligible){expect(dockedAdSchema.safeParse({...config(),pages:{[page.id]:rule()}}).success).toBe(false);expect(selectPageAd({...config(),pages:{[page.id]:rule()}},page.id,false)).toBeNull();}
  });
  it('master OFF disables every page without losing page settings',()=>{const c=config();c.enabled=false;expect(selectPageAd(c,'home',false)).toBeNull();expect(selectPageAd(c,'earn',false)).toBeNull();expect(c.pages.earn?.enabled).toBe(true);});
  it('per-page OFF affects only that page',()=>{const c=config();c.pages.home={...rule(),enabled:false};expect(selectPageAd(c,'home',false)).toBeNull();expect(selectPageAd(c,'earn',false)?.id).toBe('one');});
  it('unregistered new routes inherit OFF and do not match private descendants',()=>{for(const path of ['/future-page','/home/private','/api/config','/auth/callback','/campaigns/analytics/123','/campaigns/studio','/sets'])expect(compactAdPage(path)).toBeNull();});
  it('actual trade tabs and referrals are independent views',()=>{expect(compactAdPage('/trade','BRIDGE')).toBe('bridge');expect(compactAdPage('/','CA/BOT')).toBe('cabot');expect(compactAdPage('/trade')).toBe('swap');expect(compactAdPage('/earn','BOT/USDT','referrals')).toBe('referrals');expect(compactAdPage('/account')).toBe('profile');expect(compactAdPage('/stake')).toBe('staking');});
  it('page creative order selects only one and skips unavailable drafts',()=>{const c=config();c.slides.push({...slide,id:'two'});c.pages.home={...rule(),creativeIds:['two','one']};expect(selectPageAd(c,'home',false)?.id).toBe('two');expect(selectPageAd(c,'earn',false)?.id).toBe('one');});
  it('independent page schedules never change another page',()=>{const c=config();c.pages.home={...rule(),startAt:'2026-12-01T00:00:00Z'};expect(selectPageAd(c,'home',false,new Date('2026-11-12'))).toBeNull();expect(selectPageAd(c,'earn',false,new Date('2026-11-12'))?.id).toBe('one');});
  it('page-scoped dismissal keys cannot bleed into another page',()=>{expect(dismissalKey('earn','page')).not.toBe(dismissalKey('home','page'));expect(dismissalKey('home','global')).toBe(dismissalKey('earn','global'));});
  it('independent cooldowns expire at their own boundaries',()=>{expect(dismissalBlocks({...rule(),dismissal:'cooldown',cooldownMinutes:2},{session:false,closedAt:0},120000)).toBe(false);expect(dismissalBlocks({...rule(),dismissal:'cooldown',cooldownMinutes:3},{session:false,closedAt:0},120000)).toBe(true);});
  it('unknown page IDs and unsafe positions are rejected by shared schema',()=>{expect(dockedAdSchema.safeParse({...config(),pages:{future:rule()}}).success).toBe(false);expect(compactPagePlacementSchema.safeParse({...rule(),position:'fixed-overlay'}).success).toBe(false);});
});