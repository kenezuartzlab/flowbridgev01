"""Fixed mobile dock acceptance: real DockedAd + real BottomNav, actual scrolling; local fixture config, no writes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/compact-ad-fixed')
async def main():
 OUT.mkdir(parents=True,exist_ok=True);checks=0
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w in (320,390,430,1280):
   for motion in ('reduce','no-preference'):
    ctx=await b.new_context(viewport={'width':w,'height':844 if w<600 else 900},reduced_motion=motion);page=await ctx.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    await page.route('**/__fixed',lambda r:r.fulfill(content_type='text/html',body='<html><head><link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@vite/client"></script></head><body></body></html>'))
    await page.goto('http://localhost:8080/__fixed')
    await page.evaluate("async()=>{const r=await import('/@react-refresh');r.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>x=>x;window.__vite_plugin_react_preamble_installed__=true}")
    await page.evaluate('''async()=>{
      const {default:R}=await import('/node_modules/.vite/deps/react.js');const C=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {RouterProvider,Outlet,createRootRoute,createRoute,createRouter}=await import('/node_modules/@tanstack/react-router/dist/esm/index.js');
      const {DockedAd}=await import('/src/components/banners/DockedAd.tsx');const {BottomNav}=await import('/src/components/nav/BottomNav.tsx');
      const {COMPACT_AD_PAGES}=await import('/src/lib/banners/compactAdPages.ts');const {compactPagePlacementSchema}=await import('/src/lib/banners/promotionPolicy.ts');
      const slide={id:'first',title:'Fixture',promotion:{presentationVersion:2,status:'published',sponsored:true}};
      const cfg={enabled:true,pages:Object.fromEntries(COMPACT_AD_PAGES.filter(p=>p.eligible).map(p=>[p.id,compactPagePlacementSchema.parse({enabled:true,creativeIds:['first']})])),slides:[slide]};
      function Root(){return R.createElement(R.Fragment,null,R.createElement('div',{style:{transform:'translateZ(0)'}},R.createElement(Outlet),R.createElement('footer',{id:'foot'},'Footer')),R.createElement(BottomNav),R.createElement(DockedAd,{settings:cfg,central:true}));}
      function View(){return R.createElement('main',null,R.createElement('input',{'aria-label':'Amount'}),Array.from({length:60},(_,i)=>R.createElement('p',{key:i,style:{height:'40px'}},'Recent activity row '+i)));}
      const root=createRootRoute({component:Root});const kids=['home','activity','sets'].map(path=>createRoute({getParentRoute:()=>root,path,component:View}));
      const router=createRouter({routeTree:root.addChildren(kids)});window.router=router;await router.navigate({to:'/activity'});
      document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);(C.createRoot??C.default.createRoot)(el).render(R.createElement(RouterProvider,{router}));
    }''')
    slot=page.get_by_role('complementary',name='Sponsored placement');await slot.wait_for();await page.wait_for_timeout(600)
    assert await page.evaluate("getComputedStyle(document.querySelector('.compact-ad-dock')).position")=='fixed';checks+=1
    assert await page.evaluate("document.querySelector('.compact-ad-dock').parentElement===document.body");checks+=1
    boxes=[]
    for i,frac in enumerate((0,.5,1,0)):
      await page.mouse.wheel(0,0);await page.evaluate('(f)=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f)',frac);await page.wait_for_timeout(120)
      boxes.append(await slot.bounding_box());await page.screenshot(path=str(OUT/f'{w}-{motion}-{i}.png'))
    assert all(abs(bx['y']-boxes[0]['y'])<0.5 and abs(bx['x']-boxes[0]['x'])<0.5 for bx in boxes),boxes;checks+=1
    vh=await page.evaluate('innerHeight');assert boxes[0]['y']+boxes[0]['height']<=vh;checks+=1
    if w<768:
      nav=await page.get_by_role('navigation',name='Main navigation').bounding_box();gap=nav['y']-(boxes[0]['y']+boxes[0]['height'])
      assert 16<=gap<=22,gap;checks+=1  # clears raised Trade button, adjacent to nav
      assert boxes[0]['width']<=w and boxes[0]['height']<=86;checks+=1
      trade=page.locator('[data-nav-id]').nth(2);tb=await trade.bounding_box();assert tb['y']>=boxes[0]['y']+boxes[0]['height'];checks+=1
      await trade.click(trial=True);checks+=1
    else:
      assert vh-(boxes[0]['y']+boxes[0]['height'])>=15;checks+=1
    cb=await page.get_by_role('button',name='Close ad').bounding_box();assert cb['width']>=44 and cb['height']>=44;checks+=1
    reserve=await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--compact-ad-reserve')");assert reserve and reserve!='0px';checks+=1
    sh=await page.evaluate('document.documentElement.scrollHeight');assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
    await page.get_by_label('Amount').focus();await slot.wait_for(state='hidden');await page.get_by_label('Amount').blur();await slot.wait_for();checks+=1
    await page.evaluate('()=>{const d=document.createElement("div");d.setAttribute("role","dialog");d.id="m";document.body.append(d)}');await slot.wait_for(state='hidden');await page.evaluate('()=>document.getElementById("m").remove()');await slot.wait_for();checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/sets"})');await slot.wait_for(state='hidden');await page.evaluate('()=>window.router.navigate({to:"/activity"})');await slot.wait_for();checks+=1
    await page.get_by_role('button',name='Close ad').click();await slot.wait_for(state='hidden');await page.wait_for_timeout(100)
    assert await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--compact-ad-reserve')")=='';assert await page.evaluate('document.documentElement.scrollHeight')<sh;checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/home"})');await slot.wait_for();await page.evaluate('()=>window.router.navigate({to:"/activity"})');await page.wait_for_timeout(150);assert await slot.count()==0;checks+=1
    assert not errs,errs;print(w,motion,'fixed dock PASS',boxes[0]);await ctx.close()
  await b.close()
 print(checks,'assertions PASS')
asyncio.run(main())
