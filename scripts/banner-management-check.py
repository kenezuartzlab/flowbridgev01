"""Actual-component fixtures only; no server settings, uploads, signatures or publication.
Run python3 scripts/banner-management-check.py. Screenshots: /tmp/browser/banner-management.
"""
import asyncio, io
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

OUT=Path('/tmp/browser/banner-management')

async def mount(page, mode, ratio='6:1', x='right', y='top', theme='dark', cooldown=False, auto=0):
    await page.evaluate('''async a=>{
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const client=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {BannerSurfacePreview}=await import('/src/components/banners/BannerSurfacePreview.tsx');
      const {FeaturedBanner}=await import('/src/components/banners/FeaturedBanner.tsx');
      const {TabBanner}=await import('/src/components/banners/TabBanner.tsx');
      const {DockedAd}=await import('/src/components/banners/DockedAd.tsx');
      const {DockedAdEditor}=await import('/src/components/admin/DockedAdEditor.tsx');
      const {RouterProvider,createRootRoute,createRouter}=await import('/node_modules/.vite/deps/@tanstack_react-router.js');
      if(window.testRoot)window.testRoot.unmount();document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);
      window.testRoot=(client.createRoot??client.default.createRoot)(el);
      const slide={id:'fixture-dock',title:'Owner artwork',imageUrl:'/api/banner-image/management.png',href:'/home',layout:'full',promotion:{presentationVersion:2,status:'published',fit:'contain',sponsored:true,disclosureLabel:'Ad · Brand',disclosureX:a.x,disclosureY:a.y,disclosureTheme:a.theme,disclosureOpacity:0,homeRatio:a.ratio,backgroundMode:'transparent',showTitle:false,showBody:false,showCta:false}};
      const settings={enabled:true,surfaces:['swap'],slides:[slide],dismissal:a.cooldown?'cooldown':'session',cooldownMinutes:1,autoHideSeconds:a.auto};
      function Content(){
        if(a.mode==='home')return React.createElement(React.Fragment,null,React.createElement('div',{'data-testid':'preview'},React.createElement(BannerSurfacePreview,{surface:'home',slides:[slide,{...slide,id:'second'}],intervalMs:60000})),React.createElement('div',{'data-testid':'live'},React.createElement(FeaturedBanner,{slide,surface:'home'})),React.createElement('div',{'data-testid':'trade'},React.createElement(TabBanner,{slide,surface:'swap'})));
        if(a.mode==='editor'){const [v,set]=React.useState(settings);return React.createElement(DockedAdEditor,{value:v,wallet:'',onChange:s=>{window.editedAd=s;set(s)}})}
        return React.createElement(React.Fragment,null,React.createElement('main',{style:{minHeight:'300px'}},React.createElement('input',{'aria-label':'Amount'}),React.createElement('button',{'data-testid':'trade-action'},'Review trade')),React.createElement(DockedAd,{settings,path:'/trade'}),React.createElement('div',{'data-testid':'nav-spacer',style:{height:'70px'}}),React.createElement('nav',{'aria-label':'Fixture navigation',style:{position:'fixed',bottom:0,height:'60px',width:'100%'}},'Home · Trade · Explore'),React.createElement('button',{'aria-label':'Fixture chatbot',style:{position:'fixed',bottom:'7px',right:'8px',width:'40px',height:'40px'}},'AI'));
      }
      const root=createRootRoute({component:Content});const router=createRouter({routeTree:root});window.testRoot.render(React.createElement(RouterProvider,{router}));
    }''',dict(mode=mode,ratio=ratio,x=x,y=y,theme=theme,cooldown=cooldown,auto=auto))
    await page.wait_for_timeout(150)

async def main():
    OUT.mkdir(parents=True,exist_ok=True);checks=0
    im=Image.new('RGB',(900,150),'teal');d=ImageDraw.Draw(im);d.rectangle((0,0,899,149),outline='yellow',width=5);d.text((280,65),'OWNER ARTWORK',fill='white');buf=io.BytesIO();im.save(buf,format='PNG')
    async with async_playwright() as p:
      browser=await p.chromium.launch(headless=True)
      for width in (320,390,430,1280):
       for motion in ('reduce','no-preference'):
        context=await browser.new_context(viewport={'width':width,'height':844 if width<600 else 1800},reduced_motion=motion)
        page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        await page.route('**/__banner_management',lambda r:r.fulfill(content_type='text/html',body='<html><head><link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@vite/client"></script></head><body></body></html>'))
        await page.route('**/api/banner-image/management.png',lambda r:r.fulfill(content_type='image/png',body=buf.getvalue()))
        events=[]
        await page.route('**/api/banner-events',lambda r:(events.append(r.request.post_data),r.fulfill(json={'ok':True}))[1])
        await page.goto('http://localhost:8080/__banner_management',wait_until='domcontentloaded')
        await page.evaluate("async()=>{const r=await import('/@react-refresh');r.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>x=>x;window.__vite_plugin_react_preamble_installed__=true}")
        for ratio in ('6:1','3:1','16:9','1:1','4:5','9:16'):
          await mount(page,'home',ratio)
          shape=await page.locator('[data-testid=live] .promotion-banner').evaluate('el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,fit:getComputedStyle(el.querySelector(".promotion-art img")).objectFit}}')
          a,b=map(int,ratio.split(':'));assert abs(shape['h']-min(shape['w']*b/a,480))<1,shape
          assert shape['fit']=='contain'
          pre=await page.locator('[data-testid=preview] .promotion-banner').first.bounding_box();assert abs(pre['height']-shape['h'])<1,(pre,shape)
          trade=await page.locator('[data-testid=trade] .promotion-banner').bounding_box();assert abs(trade['width']/trade['height']-6)<.04
          assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
          checks+=5
          if ratio in ('4:5','9:16'):await page.locator('[data-testid=preview]').screenshot(path=str(OUT/f'{width}-{motion}-{ratio.replace(":","-")}-home.png'))
        for x in ('left','center','right'):
         for y in ('top','middle','bottom'):
          await mount(page,'home','6:1',x,y,'transparent')
          safe=await page.locator('[data-testid=preview]').evaluate('''el=>{const frame=el.querySelector('.promotion-banner').getBoundingClientRect(),label=el.querySelector('.promotion-disclosure').getBoundingClientRect();return label.left>=frame.left&&label.right<=frame.right&&label.top>=frame.top&&label.bottom<=frame.bottom&&[...el.querySelectorAll('.banner-dot,.banner-playback')].every(e=>{const r=e.getBoundingClientRect();return label.right<=r.left||label.left>=r.right||label.bottom<=r.top||label.top>=r.bottom})}''')
          assert safe,(width,x,y)
          backing=await page.locator('.promotion-disclosure span').first.evaluate('el=>getComputedStyle(el).backgroundColor');assert backing!='rgba(0, 0, 0, 0)'
          checks+=2
        await mount(page,'dock')
        slot=page.get_by_role('complementary',name='Sponsored placement');await slot.wait_for()
        box=await slot.bounding_box();nav=await page.get_by_role('navigation',name='Fixture navigation').bounding_box();assert box['y']+box['height']<=nav['y']
        pos=await slot.evaluate('el=>getComputedStyle(el).position');assert pos=='relative'
        assert await page.get_by_role('button',name='Review trade').is_visible()
        await slot.screenshot(path=str(OUT/f'{width}-{motion}-dock.png'));checks+=3
        await page.get_by_label('Amount',exact=True).focus();await slot.wait_for(state='hidden');checks+=1
        await page.get_by_role('button',name='Review trade').focus();await slot.wait_for();checks+=1
        await page.get_by_role('button',name='Close ad',exact=True).click();await slot.wait_for(state='hidden');checks+=1
        await mount(page,'dock');assert await slot.count()==0;checks+=1
        await page.evaluate('sessionStorage.removeItem("fb-docked-ad-dismissed")');await mount(page,'dock');await slot.wait_for();checks+=1
        await page.get_by_role('button',name='Close ad',exact=True).click();await mount(page,'dock',cooldown=True);assert await slot.count()==0;checks+=1
        await page.evaluate('localStorage.setItem("fb-docked-ad-close",String(Date.now()-60001))');await mount(page,'dock',cooldown=True);await slot.wait_for();checks+=1
        await page.evaluate('sessionStorage.clear();localStorage.removeItem("fb-docked-ad-close")');await mount(page,'dock',auto=1);await slot.wait_for();await slot.wait_for(state='hidden',timeout=4000);checks+=1
        await mount(page,'editor');await page.get_by_text('Promotion design & publishing',exact=True).click();await page.get_by_label('Disclosure wording').fill('Promoted');await page.get_by_label('Disclosure horizontal').select_option('left');await page.get_by_label('Overlay background').select_option('transparent')
        assert await page.evaluate('window.editedAd.slides[0].promotion.disclosureLabel')=='Promoted';assert await page.evaluate('window.editedAd.slides[0].promotion.sponsored') is True
        assert await page.get_by_label('Paid promotion · disclosure required').is_disabled();checks+=3
        await page.get_by_role('button',name='Close ad',exact=True).click();await page.get_by_role('button',name='Restore ad preview').click();assert await page.get_by_role('button',name='Close ad',exact=True).is_visible();checks+=1
        await page.screenshot(path=str(OUT/f'{width}-{motion}-editor.png'))
        assert not any('"kind":"click"' in (e or '') for e in events),events;checks+=1
        assert not errors,errors;checks+=1
        print(width,motion,'Home ratios, parity, disclosure, flow dock, keyboard, caps and editor PASS')
        await context.close()
      await browser.close()
    print(checks,'assertions PASS; isolated actual-component fixtures, no settings writes')

asyncio.run(main())