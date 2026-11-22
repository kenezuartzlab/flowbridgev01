import asyncio,json,hashlib
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/bnb-v111/qa')
PROV=json.load(open('/dev-server/docs/security/BNB_SWAP_V1_11_BRANDING_PROVENANCE_20261122.json'))
async def main():
 evidence=[];checks=0
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for width in [320,360,390,430,1280]:
   for theme in ['dark','light']:
    for motion in ['reduce','no-preference']:
     ctx=await b.new_context(viewport={'width':width,'height':1800},reduced_motion=motion);page=await ctx.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
     await page.goto('http://localhost:8080/trade');picker=page.get_by_role('button',name='Select swap chain, BOT Mainnet',exact=True);await picker.wait_for();await page.wait_for_timeout(3500)
     await page.evaluate('(t)=>document.documentElement.classList.toggle("light",t==="light")',theme)
     await picker.click();dialog=page.get_by_role('dialog',name='Swap chain selection');await dialog.wait_for()
     await dialog.get_by_role('button',name='BNB Mainnet · 56').click();await page.get_by_role('region',name='BNB read-only trading view').wait_for()
     mark=page.locator('[data-swap-heading] [data-bnb-chain="56"]');await mark.wait_for();await page.wait_for_function('Array.from(document.querySelectorAll("[data-swap-heading] [data-bnb-chain] img")).every(i=>i.complete&&i.naturalWidth===96)')
     rect=await mark.bounding_box();assert rect['width']==16 and rect['height']==16;checks+=2
     assert await page.locator('[data-swap-heading]').evaluate('e=>e.getBoundingClientRect().height')==32;checks+=1
     selected='black' if theme=='light' else 'yellow';img=mark.locator('.bnb-symbol-'+selected);assert await img.is_visible();checks+=1
     src=await img.get_attribute('src');response=await page.request.get('http://localhost:8080'+src);assert response.ok;assert hashlib.sha256(await response.body()).hexdigest()==PROV['assets'][selected]['sha256'];checks+=2
     assert await mark.get_attribute('aria-label')=='BNB Chain';checks+=1
     assert await page.get_by_role('button',name='Swap',exact=True).count()==0;checks+=1
     assert not errs,errs;checks+=1
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
     await page.locator('[data-swap-heading]').screenshot(path=str(OUT/f'{width}-{theme}-{motion}-heading.png'))
     if width in [320,1280] and motion=='reduce':await page.screenshot(path=str(OUT/f'{width}-{theme}-page.png'))
     evidence.append({'width':width,'theme':theme,'motion':motion,'logoPx':rect['width'],'variant':selected,'headingHeight':32,'assetSha256':PROV['assets'][selected]['sha256'],'runtimeErrors':errs});await ctx.close()
  ctx=await b.new_context(viewport={'width':320,'height':1800});page=await ctx.new_page();await page.route('**/bnb-chain-symbol-*.svg',lambda r:r.abort());await page.goto('http://localhost:8080/trade');await page.wait_for_timeout(3500);await page.get_by_role('button',name='Select swap chain, BOT Mainnet',exact=True).click();dialog=page.get_by_role('dialog',name='Swap chain selection');await dialog.wait_for();mark=dialog.locator('[data-bnb-chain="56"]');await mark.get_by_text('BNB',exact=True).wait_for();assert await mark.get_attribute('aria-label')=='BNB Chain';checks+=1;await dialog.screenshot(path=str(OUT/'missing-asset-fallback.png'));await ctx.close();await b.close()
 Path('/dev-server/docs/security/BNB_SWAP_V1_11_LOGO_QA_20261122.json').write_text(json.dumps({'checks':checks,'cases':evidence,'missingAssetFallback':'PASS'},indent=2)+'\n');print('PASS',checks,'checks',len(evidence),'cases and missing asset fallback')
asyncio.run(main())
