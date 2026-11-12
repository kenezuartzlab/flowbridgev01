"""Read-only actual-component acceptance. No settings saves, uploads or wallets.
Run: python3 scripts/banner-frame-check.py
Fixtures are fulfilled only in the isolated browser; screenshots live in /tmp.
"""
import asyncio
import io
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/banner-frame')

async def mount(page, surface, ratio, fit='contain', labels=False, align='left', position='middle', sponsored=True):
    await page.evaluate('''async args=>{
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const client=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {BannerSurfacePreview}=await import('/src/components/banners/BannerSurfacePreview.tsx');
      const {TabBanner}=await import('/src/components/banners/TabBanner.tsx');
      const {FeaturedBanner}=await import('/src/components/banners/FeaturedBanner.tsx');
      window.bannerReact=React;window.bannerClient=client;
      if(window.bannerRoot)window.bannerRoot.unmount();
      document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);
      window.bannerRoot=(client.createRoot??client.default.createRoot)(el);
      const slide={id:'fixture',title:'Baked artwork campaign',body:'A long body label that must remain safely inside its compact frame',href:'/rewards',layout:'full',imageUrl:'/api/banner-image/fixture-'+args.ratio+'.png',promotion:{presentationVersion:2,fit:args.fit,textScheme:'light',showTitle:args.labels,showBody:args.labels,showCta:args.labels,textAlign:args.align,textPosition:args.position,sponsored:args.sponsored,motion:'slide'}};
      window.bannerSlide=slide;
      window.bannerRoot.render(React.createElement(React.Fragment,null,
        React.createElement('div',{'data-testid':'preview'},React.createElement(BannerSurfacePreview,{surface:args.surface,slides:[slide,{...slide,id:'second'}],intervalMs:60000})),
        React.createElement('div',{'data-testid':'live'},React.createElement(args.surface==='home'?FeaturedBanner:TabBanner,{slide}))));
    }''', dict(surface=surface,ratio=ratio,fit=fit,labels=labels,align=align,position=position,sponsored=sponsored))
    await page.locator('.promotion-modern').first.wait_for()
    await page.wait_for_timeout(100)

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    checks=0
    fixtures={}
    for name,size in [('wide',(1800,300)),('landscape',(960,540)),('portrait',(400,500))]:
        im=Image.new('RGB',size,'teal');d=ImageDraw.Draw(im)
        d.rectangle((0,0,size[0]-1,size[1]-1),outline='yellow',width=10)
        d.text((size[0]//3,size[1]//2),'PRINTED ARTWORK',fill='white')
        buf=io.BytesIO();im.save(buf,format='PNG');fixtures[name]=buf.getvalue()
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        for width in (320,390,430,1280):
            for motion in ('reduce','no-preference'):
                page=await browser.new_page(viewport={'width':width,'height':844 if width<600 else 1800},reduced_motion=motion)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await page.route('**/api/banner-image/fixture-*',lambda r:r.fulfill(content_type='image/png',body=fixtures[r.request.url.split('fixture-')[1].split('.')[0]]))
                await page.route('**/__banner_acceptance',lambda r:r.fulfill(content_type='text/html',body='<html><head><link rel="stylesheet" href="/src/styles.css"><script type="module" src="/@vite/client"></script></head><body></body></html>'))
                await page.goto('http://localhost:8080/__banner_acceptance',wait_until='domcontentloaded')
                await page.evaluate("async()=>{const r=await import('/@react-refresh');r.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>x=>x;window.__vite_plugin_react_preamble_installed__=true}")
                await page.wait_for_timeout(2000)
                for surface in ('swap','cabot','home','bridge'):
                    for ratio in fixtures:
                        for fit in ('contain','cover'):
                            await mount(page,surface,ratio,fit)
                            frame=page.locator('[data-testid=preview] .promotion-modern').first
                            geometry=await frame.evaluate('''el=>{const r=el.getBoundingClientRect();const image=el.querySelector('.promotion-art img');return {w:r.width,h:r.height,fit:getComputedStyle(image).objectFit,loaded:image.complete&&image.naturalWidth>0,copy:el.querySelectorAll('.promotion-copy').length,ext:!!el.querySelector('.promotion-extension'),cta:el.querySelectorAll('.promotion-cta').length}}''')
                            assert abs(geometry['w']/geometry['h']-6)<.03,geometry
                            assert geometry['loaded'] and geometry['fit']==fit,geometry
                            assert geometry['copy']==0 and geometry['cta']==0,geometry
                            assert geometry['ext']==(fit=='contain'),geometry
                            if fit=='contain':
                                intrinsic=await frame.evaluate('''el=>{const im=el.querySelector('.promotion-art img'),r=im.getBoundingClientRect(),scale=Math.min(r.width/im.naturalWidth,r.height/im.naturalHeight);return {drawW:im.naturalWidth*scale,drawH:im.naturalHeight*scale,w:r.width,h:r.height,filter:getComputedStyle(el.querySelector('.promotion-extension')).filter}}''')
                                assert intrinsic['drawW']<=intrinsic['w']+.1 and intrinsic['drawH']<=intrinsic['h']+.1
                                assert 'blur' in intrinsic['filter']
                            preview=await frame.bounding_box();live=await page.locator('[data-testid=live] .promotion-modern').bounding_box()
                            assert abs(preview['height']-live['height'])<1
                            assert await frame.get_by_text('Sponsored',exact=True).is_visible()
                            checks+=6
                            if fit=='contain' and ratio=='landscape':
                                await page.locator('[data-testid=preview]').screenshot(path=str(OUT/f'{width}-{motion}-{surface}.png'))
                    for align in ('left','center','right'):
                        for position in ('top','middle','bottom'):
                            await mount(page,surface,'wide',labels=True,align=align,position=position)
                            bounds=await page.locator('[data-testid=preview] .promotion-modern').first.evaluate('''el=>{const r=el.getBoundingClientRect(),c=el.querySelector('.promotion-copy').getBoundingClientRect();return {animation:getComputedStyle(el.querySelector('.promotion-copy')).animationName,rect:[r.x,r.y,r.width,r.height],copy:[c.x,c.y,c.width,c.height],inside:c.left>=r.left&&c.right<=r.right&&c.top>=r.top&&c.bottom<=r.bottom,align:getComputedStyle(el.querySelector('.promotion-copy-position')).textAlign}}''')
                            assert bounds['inside'] and bounds['align']==align,(width,motion,surface,align,position,bounds)
                            safe=await page.locator('[data-testid=preview]').evaluate('''el=>{const c=el.querySelector('[aria-hidden=false] .promotion-copy').getBoundingClientRect();return [...el.querySelectorAll('.banner-dot,.banner-playback,[aria-hidden=false] .promotion-disclosure')].every(e=>{const r=e.getBoundingClientRect();return c.right<=r.left+.5||c.left>=r.right-.5||c.bottom<=r.top+.5||c.top>=r.bottom-.5})}''')
                            assert safe,(width,surface,align,position,'control overlap')
                            checks+=1
                    carousel=page.locator('[data-testid=preview] [aria-roledescription=carousel]')
                    if motion=='reduce':
                        await carousel.get_by_role('button',name='Pause promotions').wait_for(state='hidden')
                    else: assert await carousel.get_by_role('button',name='Pause promotions').is_visible()
                    await carousel.get_by_role('button',name='Show banner 2 of 2').click()
                    assert await carousel.locator('[aria-hidden=false]').get_attribute('aria-label')=='2 of 2'
                    await carousel.locator('[tabindex="0"]').focus();await page.keyboard.press('ArrowRight')
                    assert await carousel.locator('[aria-hidden=false]').get_attribute('aria-label')=='1 of 2'
                    checks+=3
                # Exercise the real editor controls in isolated state, with no upload/save.
                await page.evaluate('''async()=>{const {PromotionOptionsEditor}=await import('/src/components/admin/PromotionOptionsEditor.tsx');const React=window.bannerReact;function Editor(){const [slide,setSlide]=React.useState(window.bannerSlide);return React.createElement(PromotionOptionsEditor,{slide,wallet:'',onChange:p=>{window.editedBanner=p;setSlide({...slide,promotion:p})}})}window.bannerRoot.render(React.createElement(Editor))}''')
                await page.get_by_text('Promotion design & publishing',exact=True).click()
                await page.get_by_label('Text mode').select_option('dark')
                await page.get_by_label('Show title',exact=True).uncheck()
                await page.get_by_label('Horizontal placement').select_option('right')
                assert await page.evaluate('window.editedBanner.textScheme')=='dark'
                assert await page.evaluate('window.editedBanner.showTitle') is False
                assert await page.evaluate('window.editedBanner.textAlign')=='right'
                checks+=3
                await page.screenshot(path=str(OUT/f'{width}-{motion}-editor.png'))
                assert not errors,errors
                checks+=1
                print(width,motion,'all four surfaces, image ratios, fits, placement, disclosure, parity, editor PASS')
                await page.close()
        await browser.close()
    print(checks,'browser assertions PASS; actual components, isolated fixtures, no writes')

asyncio.run(main())