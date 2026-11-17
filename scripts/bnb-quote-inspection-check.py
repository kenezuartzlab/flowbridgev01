"""Actual public preview; no wallet or saved settings. Provider placeholders are not live evidence."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/bnb-inspection');OUT.mkdir(parents=True,exist_ok=True)
async def main():
 checks=0
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [320,360,390,430,1280]:
   for theme in ['light','dark']:
    for motion in ['reduce','no-preference']:
     context=await browser.new_context(viewport={'width':width,'height':1800},reduced_motion=motion)
     page=await context.new_page();errors=[];rpc=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     page.on('request',lambda r:rpc.append(r.url) if any(s in r.url for s in ['bsc-dataseed','api.0x.org']) else None)
     await page.goto('http://localhost:8080/trade');picker=page.get_by_role('button',name='Select swap chain, BOT Mainnet',exact=True)
     await picker.wait_for();await page.wait_for_timeout(3500)
     await page.evaluate('(t)=>document.documentElement.classList.toggle("light",t==="light")',theme)
     await picker.click();await page.get_by_role('dialog',name='Swap chain selection').get_by_role('button',name='BNB Mainnet · 56').click()
     assert await page.locator('[data-swap-heading]').evaluate('e=>e.getBoundingClientRect().height')==32;checks+=1
     await page.get_by_role('button',name='Inspect BNB quote readiness').click()
     panel=page.get_by_role('dialog',name='BNB quote readiness',exact=True);await panel.wait_for()
     assert await panel.get_by_role('status').inner_text()=='Unverified';checks+=1
     assert await panel.get_by_label('BNB quote output').inner_text()=='—';checks+=1
     await panel.get_by_role('button',name='Inspect BNB quote provider').click()
     providers=page.get_by_role('dialog',name='BNB quote providers',exact=True)
     await providers.get_by_role('button',name='0x Aggregation · Unverified').click();await page.keyboard.press('Escape')
     assert await panel.get_by_text('Aggregation',exact=True).count()==1;checks+=1
     assert await panel.get_by_label('BNB quote output').inner_text()=='—';checks+=1
     await panel.get_by_role('button',name='Inspect BNB pair').click()
     pairs=page.get_by_role('dialog',name='BNB read-only pair',exact=True)
     await pairs.get_by_role('button',name='USDT / XAUt · RWA restricted').click();await page.keyboard.press('Escape')
     assert await panel.get_by_text('RWA eligibility, issuer rules, market hours and provider permission: Blocked',exact=True).count()==1;checks+=1
     await panel.get_by_role('button',name='Inspect BNB quote provider').click()
     await providers.get_by_role('button',name='PancakeSwapX RFQ · Unverified').click();await page.keyboard.press('Escape')
     assert await panel.get_by_text('RFQ',exact=True).count()==1;checks+=1
     assert await panel.get_by_label('BNB quote output').inner_text()=='—';checks+=1
     rect=await panel.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=width;checks+=1
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
     assert await panel.get_by_role('button',name='Swap',exact=True).count()==0;checks+=1
     assert await panel.get_by_role('button',name='Approve',exact=True).count()==0;checks+=1
     await panel.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-rfq.png'))
     await page.keyboard.press('Escape');await panel.wait_for(state='hidden')
     await page.get_by_role('button',name='Select swap chain, BNB preview',exact=True).click()
     await page.get_by_role('dialog',name='Swap chain selection').get_by_role('button',name='BOT Mainnet · 677').click()
     await picker.wait_for();await picker.click()
     await page.get_by_role('dialog',name='Swap chain selection').get_by_role('button',name='BNB Mainnet · 56').click()
     await page.get_by_role('button',name='Inspect BNB quote readiness').click();await panel.wait_for()
     assert await panel.get_by_role('button',name='Inspect BNB pair').inner_text()=='BNB / USDT';checks+=1
     assert await panel.get_by_role('button',name='Inspect BNB quote provider').inner_text()=='PancakeSwap V3';checks+=1
     assert not rpc,rpc;checks+=1
     assert not errors,errors;checks+=1
     await context.close()
  await browser.close()
 OUT.joinpath('results.json').write_text(json.dumps({'checks':checks,'cases':20}));print(f'PASS {checks} assertions / 20 real preview cases')
asyncio.run(main())