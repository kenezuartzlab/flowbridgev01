"""Real router + compact manager components, browser-local configuration only; no settings writes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/compact-ad-pages')
async def main():
 OUT.mkdir(parents=True,exist_ok=True);checks=0
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in (320,390,430,1280):
   for motion in ('reduce','no-preference'):
    ctx=await browser.new_context(viewport={'width':width,'height':844 if width<600 else 1800},reduced_motion=motion)
    page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.route('**/__compact_pages',lambda r:r.fulfill(content_type='text/html',body='<html><head><link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@vite/client"></script></head><body></body></html>'))
    await page.goto('http://localhost:8080/__compact_pages')
    await page.evaluate("async()=>{const r=await import('/@react-refresh');r.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>x=>x;window.__vite_plugin_react_preamble_installed__=true}")
    await page.evaluate('''async()=>{
      const {default:R}=await import('/node_modules/.vite/deps/react.js');const C=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {RouterProvider,Outlet,createRootRoute,createRoute,createRouter}=await import('/node_modules/@tanstack/react-router/dist/esm/index.js');
      const {DockedAd}=await import('/src/components/banners/DockedAd.tsx');const {DockedAdEditor}=await import('/src/components/admin/DockedAdEditor.tsx');
      const {COMPACT_AD_PAGES}=await import('/src/lib/banners/compactAdPages.ts');const {compactPagePlacementSchema}=await import('/src/lib/banners/promotionPolicy.ts');
      const {setTradeTab}=await import('/src/lib/trade/tradeSession.ts');window.setTab=setTradeTab;
      const slide={id:'first',title:'First creative',promotion:{presentationVersion:2,status:'published',sponsored:true}};
      const cfg={enabled:true,pages:Object.fromEntries(COMPACT_AD_PAGES.filter(p=>p.eligible).map(p=>[p.id,compactPagePlacementSchema.parse({enabled:true,creativeIds:['first']})])),slides:[slide,{...slide,id:'second',title:'Second creative'}]};
      function Root(){const [v,set]=R.useState(cfg);window.setConfig=set;window.cfg=v;return R.createElement(R.Fragment,null,R.createElement(Outlet),R.createElement(DockedAd,{settings:v,central:true}));}
      function View(){return R.createElement('main',null,R.createElement('h1',null,'Placement acceptance'),R.createElement('div',{'data-compact-ad-anchor':''}),R.createElement('div',{style:{height:'88px'}}));}
      const root=createRootRoute({component:Root});const paths=['home','earn','rewards','stake','wallet','account','learn','activity','discover','markets','docs','bot-chain','liquidity','ecosystem-ranking','campaigns','campaigns/partners','campaigns/$slug','partners','games','adventure','arcadeflix','ecosurge','trade','sets','admin','ops','reset-password','multisend','future-page'];
      const children=paths.map(path=>createRoute({getParentRoute:()=>root,path,component:View}));
      const router=createRouter({routeTree:root.addChildren(children)});window.router=router;
      document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);(C.createRoot??C.default.createRoot)(el).render(R.createElement(RouterProvider,{router}));
      window.showEditor=()=>{const el=document.createElement('div');el.id='editor';document.body.append(el);(C.createRoot??C.default.createRoot)(el).render(R.createElement(DockedAdEditor,{value:window.cfg,wallet:'',onChange:v=>{window.edited=v}}));};
    }''')
    slot=page.get_by_role('complementary',name='Sponsored placement')
    for path,pid in [('home','home'),('earn','earn'),('rewards','rewards'),('stake','staking'),('wallet','wallet'),('account','profile'),('learn','learn'),('activity','activity'),('discover','discover'),('markets','markets'),('docs','docs'),('bot-chain','bot-chain'),('liquidity','liquidity'),('ecosystem-ranking','ecosystem-ranking'),('campaigns','campaigns'),('campaigns/partners','campaign-partners'),('campaigns/example','campaign-detail'),('partners','partners'),('games','games'),('adventure','adventure'),('arcadeflix','arcadeflix'),('ecosurge','ecosurge')]:
      await page.evaluate('(path)=>window.router.navigate({to:"/"+path})',path);await slot.wait_for();assert await slot.count()==1;assert await page.locator('[data-compact-page]').get_attribute('data-compact-page')==pid;checks+=2
    for path in ('sets','admin','ops','reset-password','multisend','future-page'):
      await page.evaluate('(path)=>window.router.navigate({to:"/"+path})',path);await slot.wait_for(state='hidden');checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/trade"})');await slot.wait_for()
    for tab,pid in [('BRIDGE','bridge'),('CA/BOT','cabot'),('BOT/USDT','swap')]:
      await page.evaluate('(tab)=>window.setTab(tab,"USER")',tab);await page.wait_for_timeout(80);assert await page.locator('[data-compact-page]').get_attribute('data-compact-page')==pid;checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/earn",hash:"referrals"})');await slot.wait_for();assert await page.locator('[data-compact-page]').get_attribute('data-compact-page')=='referrals';checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/home"})');await slot.wait_for();await page.get_by_role('button',name='Close ad',exact=True).click();await slot.wait_for(state='hidden')
    await page.evaluate('()=>window.router.navigate({to:"/earn",hash:""})');await slot.wait_for();checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/home"})');await slot.wait_for(state='hidden');checks+=1
    await page.evaluate('()=>{sessionStorage.clear();localStorage.clear();window.setConfig({...window.cfg,enabled:false})}');await slot.wait_for(state='hidden');checks+=1
    await page.evaluate('()=>window.setConfig({...window.cfg,enabled:true,pages:{...window.cfg.pages,home:{...window.cfg.pages.home,enabled:false}}})');await slot.wait_for(state='hidden');checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/earn"})');await slot.wait_for();checks+=1
    await page.evaluate('()=>window.setConfig({...window.cfg,pages:{...window.cfg.pages,earn:{...window.cfg.pages.earn,creativeIds:["second"]}}})');await page.wait_for_timeout(100)
    assert await slot.count()==1;checks+=1
    await page.evaluate('()=>{const d=document.createElement("div");d.role="dialog";d.id="sensitive";document.body.append(d)}');await slot.wait_for(state='hidden');checks+=1
    await page.evaluate('()=>document.getElementById("sensitive").remove()');await slot.wait_for();checks+=1
    for position in ('above-nav-center','above-nav-left','above-nav-right'):
      await page.evaluate('(position)=>window.setConfig({...window.cfg,pages:{...window.cfg.pages,earn:{...window.cfg.pages.earn,position}}})',position);await page.wait_for_timeout(80)
      assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
    await page.evaluate('()=>window.setConfig({...window.cfg,pages:{...window.cfg.pages,earn:{...window.cfg.pages.earn,dismissalScope:"global",dismissal:"session"}}})');await page.wait_for_timeout(80);await page.get_by_role('button',name='Close ad',exact=True).click()
    await page.evaluate('()=>window.router.navigate({to:"/rewards"})');await slot.wait_for(state="hidden");checks+=1
    await page.evaluate('()=>window.showEditor()');await page.get_by_label('Global master switch').wait_for()
    assert await page.get_by_label('Enable compact ad: Operations',exact=True).is_disabled();assert await page.get_by_label('Enable compact ad: Earn',exact=True).is_enabled();checks+=2
    await page.locator('#editor').get_by_role('combobox').first.select_option('wallet');await page.locator('#editor').get_by_role('combobox').nth(3).select_option('above-nav-left');assert await page.evaluate('window.edited.pages.wallet.position')=='above-nav-left';checks+=1
    await page.screenshot(path=str(OUT/f'{width}-{motion}-manager.png'));assert not errors,errors;checks+=1
    print(width,motion,'page routes, trade/referrals, master/page gates, scope, dialogs, single slot and manager PASS');await ctx.close()
  await browser.close()
 print(checks,'assertions PASS; local fixture configuration, no backend writes')
asyncio.run(main())