import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/rwa-quotes')
async def main():
 checks=0
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for width in (320,390,430,1280):
   for theme in ('dark','light'):
    for motion in ('reduce','no-preference'):
     ctx=await b.new_context(viewport={'width':width,'height':844 if width<600 else 1800},reduced_motion=motion)
     page=await ctx.new_page(); errors=[]; rpc=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     page.on('request',lambda r:rpc.append(r.url) if 'bsc-dataseed' in r.url else None)
     await page.goto('http://localhost:8080/campaigns/rwa',wait_until='domcontentloaded')
     panel=page.get_by_test_id('rwa-quote-readiness'); await panel.wait_for(); await page.wait_for_timeout(1500)
     await page.evaluate('(light)=>document.documentElement.classList.toggle("light",light)',theme=='light')
     await panel.scroll_into_view_if_needed()
     assert 'Two endpoints matched' in await panel.inner_text(); checks+=1
     assert 'Archived snapshot · not fresh' in await panel.inner_text(); checks+=1
     assert '134,073,409' in await panel.inner_text(); checks+=1
     assert await panel.locator('article').count()==5; checks+=1
     assert '0.001294 XAUt' in await panel.inner_text(); checks+=1
     assert '0.258835 XAUt' in await panel.inner_text(); checks+=1
     assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'); checks+=1
     await page.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-buy.png'))
     await panel.get_by_role('tab',name='XAUt → USDT',exact=True).click()
     await page.wait_for_timeout(350)
     assert '4.992251 USDT' in await panel.inner_text(); checks+=1
     assert '998.716928 USDT' in await panel.inner_text(); checks+=1
     assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'); checks+=1
     await panel.get_by_text('Sources & remaining gates',exact=True).click()
     assert 'Health & token behavior · Unverified' in await panel.inner_text(); checks+=1
     assert 'Legal, provider & fees · Blocked' in await panel.inner_text(); checks+=1
     await page.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-sell.png'))
     assert await panel.get_by_role('link',name='Official PancakeSwap V3 addresses').get_attribute('href')=='https://developer.pancakeswap.finance/contracts/v3/addresses'; checks+=1
     for action in ('Buy','Swap','Approve'):
      assert await panel.get_by_role('button',name=action,exact=True).count()==0;checks+=1
     assert not rpc,rpc; checks+=1
     assert not errors,errors;checks+=1
     await ctx.close()
     print(width,theme,motion,'PASS')
  await b.close()
 print(checks,'quote panel assertions PASS')
asyncio.run(main())
