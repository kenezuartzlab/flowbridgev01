"""Fixed mobile dock acceptance: real DockedAd + real BottomNav, actual scrolling; local fixture config, no writes."""
import asyncio
import json
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/compact-ad-fixed')
async def main():
 OUT.mkdir(parents=True,exist_ok=True);checks=0
 art=Image.new('RGB',(840,140),'#183b42');draw=ImageDraw.Draw(art);draw.text((64,50),'FLOWBRIDGE',fill='white',font_size=36);draw.text((630,55),'Explore >',fill='#32ff8b',font_size=28);buffer=BytesIO();art.save(buffer,format='PNG')
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w in (320,390,430,1280):
   for motion in ('reduce','no-preference'):
    ctx=await b.new_context(viewport={'width':w,'height':844 if w<600 else 1800},reduced_motion=motion);page=await ctx.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    await page.route('**/__fixed',lambda r:r.fulfill(content_type='text/html',body='<html><head><link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@vite/client"></script></head><body></body></html>'))
    await page.route('**/assets/compact-fixture.png',lambda r:r.fulfill(content_type='image/png',body=buffer.getvalue()))
    await page.goto('http://localhost:8080/__fixed')
    await page.evaluate("async()=>{const r=await import('/@react-refresh');r.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>x=>x;window.__vite_plugin_react_preamble_installed__=true}")
    await page.evaluate('''async()=>{
      const {default:R}=await import('/node_modules/.vite/deps/react.js');const C=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {RouterProvider,Outlet,createRootRoute,createRoute,createRouter}=await import('/node_modules/@tanstack/react-router/dist/esm/index.js');
      const {DockedAd}=await import('/src/components/banners/DockedAd.tsx');const {BottomNav}=await import('/src/components/nav/BottomNav.tsx');
      const {COMPACT_AD_PAGES}=await import('/src/lib/banners/compactAdPages.ts');const {compactPagePlacementSchema}=await import('/src/lib/banners/promotionPolicy.ts');
      // Local network fixture uses an allowed same-origin image path; no saved campaign/config.
      const slide={id:'first',title:'Fixture',imageUrl:'/assets/compact-fixture.png',promotion:{presentationVersion:2,status:'published',sponsored:true}};
      const cfg={enabled:true,pages:Object.fromEntries(COMPACT_AD_PAGES.filter(p=>p.eligible).map(p=>[p.id,compactPagePlacementSchema.parse({enabled:true,creativeIds:['first']})])),slides:[slide]};
      function Root(){const [enabled,setEnabled]=R.useState(false);window.setAdEnabled=setEnabled;return R.createElement(R.Fragment,null,R.createElement('div',{style:{transform:'translateZ(0)'}},R.createElement(Outlet),R.createElement('footer',{id:'foot'},'Footer')),R.createElement(BottomNav),R.createElement(DockedAd,{settings:{...cfg,enabled},central:true}));}
      function View(){return R.createElement('main',null,R.createElement('input',{'aria-label':'Amount'}),Array.from({length:60},(_,i)=>R.createElement('p',{key:i,style:{height:'40px'}},'Recent activity row '+i)));}
      const root=createRootRoute({component:Root});const kids=['home','activity','sets'].map(path=>createRoute({getParentRoute:()=>root,path,component:View}));
      const router=createRouter({routeTree:root.addChildren(kids)});window.router=router;await router.navigate({to:'/activity'});
      document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);(C.createRoot??C.default.createRoot)(el).render(R.createElement(RouterProvider,{router}));
    }''')
    geometry="""()=>Object.fromEntries(['nav[aria-label="Main navigation"]','[data-nav-id]:nth-child(n)'].flatMap((s,i)=>i?Array.from(document.querySelectorAll('[data-nav-id]')).flatMap((e,j)=>[e,e.children[0],e.lastElementChild].map((el,k)=>[`${j}-${k}`,el.getBoundingClientRect().toJSON()])):[[s,document.querySelector(s).getBoundingClientRect().toJSON()]]))"""
    await page.locator('[data-nav-id]').first.wait_for(state='attached');await page.wait_for_timeout(600)
    baseline=await page.evaluate(geometry)
    await page.screenshot(path=str(OUT/f'{w}-{motion}-off.png'))
    await page.evaluate('()=>window.setAdEnabled(true)')
    slot=page.get_by_role('complementary',name='Sponsored placement');await slot.wait_for();await page.wait_for_timeout(600)
    async def invariant(label):
      nonlocal checks
      actual=await page.evaluate(geometry)
      if w<768:
        for key,rect in baseline.items():
          for axis in ('x','y','width','height'):
            assert abs(rect[axis]-actual[key][axis])<=1,(label,key,axis,rect[axis],actual[key][axis])
            checks+=1
    await page.screenshot(path=str(OUT/f'{w}-{motion}-on.png'))
    print('geometry OFF/ON',w,motion,json.dumps({'off':baseline,'on':await page.evaluate(geometry)}))
    await invariant('activation')
    assert await page.evaluate("getComputedStyle(document.querySelector('.compact-ad-dock')).position")=='fixed';checks+=1
    assert await page.evaluate("document.querySelector('.compact-ad-dock').parentElement===document.body");checks+=1
    await page.wait_for_function("document.querySelector('.promotion-art img')?.naturalWidth===840");checks+=1
    assert await page.locator('.promotion-art img').evaluate("el=>getComputedStyle(el).objectFit")=='contain';checks+=1
    boxes=[]
    for i,frac in enumerate((0,.5,1,0)):
      await page.mouse.wheel(0,0);await page.evaluate('(f)=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f)',frac);await page.wait_for_timeout(120)
      boxes.append(await slot.bounding_box());await page.screenshot(path=str(OUT/f'{w}-{motion}-{i}.png'))
      await invariant('scroll')
      if w<768:
        nb=await page.get_by_role('navigation',name='Main navigation').bounding_box();sb=boxes[-1]
        assert 0<=nb['y']-sb['y']-sb['height']<=2;checks+=1
    assert all(abs(bx['y']-boxes[0]['y'])<0.5 and abs(bx['x']-boxes[0]['x'])<0.5 for bx in boxes),boxes;checks+=1
    vh=await page.evaluate('innerHeight');assert boxes[0]['y']+boxes[0]['height']<=vh;checks+=1
    if w<768:
      nav=await page.get_by_role('navigation',name='Main navigation').bounding_box();gap=nav['y']-(boxes[0]['y']+boxes[0]['height'])
      assert 0<=gap<=2,gap;checks+=1
      assert boxes[0]['width']<=w and 40<=boxes[0]['height']<=56;checks+=1
      trade=page.locator('[data-nav-id]').nth(2);tb=await trade.bounding_box()
      assert await page.locator('.compact-ad-nav-trade').count()==0,'Raised Trade control must be gone';checks+=1
      ic=await page.evaluate("()=>[...document.querySelectorAll('[data-nav-id]')].map(l=>{const i=l.querySelector('[data-nav-icon]').getBoundingClientRect(),t=l.lastElementChild.getBoundingClientRect(),r=l.getBoundingClientRect();return [i.top,i.height,i.width,t.top,t.bottom,r.top,r.height,l.closest('nav').getBoundingClientRect().top]})")
      assert all(abs(v[k]-ic[0][k])<0.5 for v in ic for k in range(7)) and ic[0][0]>=ic[0][7],('Nav items not uniform',ic);checks+=1
      clip=await page.locator('.compact-ad-dock .promotion-banner').evaluate("el=>getComputedStyle(el).clipPath");assert clip in ('none',''),clip;checks+=1
      for l in await page.locator('[data-nav-id]').all():
        lb=await l.bounding_box();assert await l.evaluate("(el,[x,y])=>el.contains(document.elementFromPoint(x,y))",[lb['x']+lb['width']/2,lb['y']+lb['height']/2]);checks+=1
      await trade.click(trial=True);checks+=1
      for link in await page.locator('[data-nav-id]').all():
        await link.click(trial=True);checks+=1
    else:
      assert vh-(boxes[0]['y']+boxes[0]['height'])>=15;checks+=1
    cb=await page.get_by_role('button',name='Close ad').bounding_box();assert cb['width']>=44 and cb['height']>=44;checks+=1
    assert abs(cb['x']+cb['width']/2-(boxes[0]['x']+boxes[0]['width']))<=1;checks+=1
    assert cb['x']>=0 and cb['x']+cb['width']<=w;checks+=1
    await page.get_by_role('button',name='Close ad').click(trial=True);checks+=1
    if w<768:
      for rw,rh in ((430,700),(320,844),(667,375),(w,844)):
        await page.set_viewport_size({'width':rw,'height':rh});await page.wait_for_timeout(650)
        sb=await slot.bounding_box();nb=await page.get_by_role('navigation',name='Main navigation').bounding_box()
        assert 0<=nb['y']-sb['y']-sb['height']<=2;checks+=1
        assert sb['height']<=56 and await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
        on=await page.evaluate(geometry);await page.evaluate('()=>window.setAdEnabled(false)');await slot.wait_for(state='hidden');await page.wait_for_timeout(100)
        off=await page.evaluate(geometry)
        assert all(abs(r[a]-off[k][a])<=1 for k,r in on.items() for a in ('x','y','width','height'));checks+=1
        await page.evaluate('()=>window.setAdEnabled(true)');await slot.wait_for();await page.wait_for_timeout(650)
    reserve=await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--compact-ad-reserve')");assert reserve and reserve!='0px';checks+=1
    sh=await page.evaluate('document.documentElement.scrollHeight');assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
    await page.get_by_label('Amount').focus();await slot.wait_for(state='hidden');await invariant('keyboard');await page.get_by_label('Amount').blur();await slot.wait_for();checks+=1
    await page.evaluate('()=>{const d=document.createElement("div");d.setAttribute("role","dialog");d.id="m";document.body.append(d)}');await slot.wait_for(state='hidden');await page.evaluate('()=>document.getElementById("m").remove()');await slot.wait_for();checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/sets"})');await slot.wait_for(state='hidden');await invariant('sensitive route');await page.evaluate('()=>window.router.navigate({to:"/activity"})');await slot.wait_for();await invariant('route return');checks+=1
    await page.get_by_role('button',name='Close ad').click();await slot.wait_for(state='hidden');await page.wait_for_timeout(100)
    await invariant('dismissal')
    await page.screenshot(path=str(OUT/f'{w}-{motion}-dismissed.png'))
    assert await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--compact-ad-reserve')")=='';assert await page.evaluate('document.documentElement.scrollHeight')<sh;checks+=1
    await page.evaluate('()=>window.router.navigate({to:"/home"})');await slot.wait_for();await page.evaluate('()=>window.router.navigate({to:"/activity"})');await page.wait_for_timeout(150);assert await slot.count()==0;checks+=1
    assert not errs,errs;print(w,motion,'fixed dock PASS',boxes[0]);await ctx.close()
  await b.close()
 print(checks,'assertions PASS')
asyncio.run(main())
