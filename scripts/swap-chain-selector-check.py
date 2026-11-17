"""Real preview, no wallet/session/config writes; baseline captured from head 63c47070."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/chain-selector'); OUT.mkdir(parents=True,exist_ok=True)
BASE={320:(32,48,232),360:(32,48,232),390:(32,48,232),430:(32,48,232),1280:(32,48,324.65625)}
async def main():
 checks=0; evidence=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w in BASE:
   print('width',w,flush=True)
   for theme in ['light','dark']:
    for motion in ['reduce','no-preference']:
     ctx=await b.new_context(viewport={'width':w,'height':1800},reduced_motion=motion); page=await ctx.new_page(); errors=[]; requests=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     page.on('request',lambda r:requests.append((r.method,r.url,r.post_data or '')))
     await page.goto('http://localhost:8080/trade'); await page.get_by_role('button',name='Select swap chain, BOT Mainnet',exact=True).wait_for(); await page.wait_for_timeout(3500)
     await page.evaluate('(t)=>document.documentElement.classList.toggle("light",t==="light")',theme)
     heading=page.locator('[data-swap-heading]'); form=page.locator('[data-swap-form]')
     async def geom():
      return await page.evaluate('''()=>{const h=document.querySelector('[data-swap-heading]').getBoundingClientRect(),f=document.querySelector('[data-swap-form]').getBoundingClientRect(),top=document.querySelector('header').getBoundingClientRect().bottom;return [h.height,f.top-h.top,f.top-top]}''')
     await page.get_by_role('button',name='Pause banner rotation').click() if await page.get_by_role('button',name='Pause banner rotation').count() else None; g=await geom(); assert all(abs(x-y)<=2 for x,y in zip(g[:2],BASE[w][:2])),(w,g,BASE[w]);checks+=3
     nav=await page.locator('[data-nav-id]').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().toJSON())')
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');checks+=1
     picker=page.get_by_role('button',name='Select swap chain, BOT Mainnet',exact=True)
     rect=await picker.bounding_box(); assert rect['height']>=44 and rect['width']>=44;checks+=2
     assert await picker.evaluate('(e)=>{const h=e.closest("[data-swap-heading]").getBoundingClientRect(),r=e.getBoundingClientRect();return r.left>=h.left&&r.right<=h.right}');checks+=1
     await form.locator('input').first.fill('5'); await page.wait_for_timeout(1000); await picker.click()
     dialog=page.get_by_role('dialog',name='Swap chain selection');await dialog.wait_for()
     assert await dialog.get_by_text('Wallet: not connected',exact=True).count()==1;checks+=1
     assert await dialog.get_by_role('button',name='BOT Mainnet · 677').get_attribute('aria-pressed')=='true';checks+=1
     for _ in range(6):
      await page.keyboard.press('Tab'); assert await page.evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)');checks+=1
     await page.keyboard.press('Escape'); await dialog.wait_for(state='hidden'); assert await picker.evaluate('e=>e===document.activeElement'); checks+=1
     await picker.click(); await dialog.get_by_role('button',name='BNB Mainnet · 56').click(); await page.get_by_role('region',name='BNB read-only trading view').wait_for(); await page.wait_for_timeout(300)
     assert await page.get_by_text('BNB swaps coming after security approval',exact=True).count()==1;checks+=1
     assert await page.locator('[data-swap-form] input').count()==0;checks+=1
     assert await page.get_by_role('button',name='Connect Wallet',exact=True).count()==0;checks+=1
     assert await page.get_by_role('button',name='Swap',exact=True).count()==0;checks+=1
     assert await page.get_by_role('button',name='Approve',exact=True).count()==0;checks+=1
     assert await page.get_by_text('XAUt/USDT · archived quote research →',exact=True).count()==1;checks+=1
     assert await page.locator('[data-nav-id]').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().toJSON())')==nav;checks+=1
     assert abs((await geom())[1]-g[1])<=2;checks+=1
     await page.screenshot(path=str(OUT/f'{w}-{theme}-{motion}-bnb.png'))
     await page.get_by_role('button',name='Select swap chain, BNB preview',exact=True).click(); await dialog.wait_for()
     await page.screenshot(path=str(OUT/f'{w}-{theme}-{motion}-popover.png'))
     await dialog.get_by_role('button',name='BOT Mainnet · 677').click(); await page.locator('[data-swap-form] input').first.wait_for();await page.wait_for_timeout(400)
     assert await page.locator('[data-swap-form] input').first.input_value()=='';checks+=1
     assert await page.get_by_role('button',name='Connect Wallet',exact=True).count()==1;checks+=1
     assert await page.locator('[data-nav-id]').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().toJSON())')==nav;checks+=1
     assert all(abs(x-y)<=2 for x,y in zip((await geom())[:2],g[:2])),(w,theme,motion,g,await geom());checks+=3
     assert not errors,errors;checks+=1
     assert not any(any(s in data for s in ['eth_sendTransaction','personal_sign','wallet_switchEthereumChain','eth_sendRawTransaction','eth_getTransactionCount']) for _,_,data in requests);checks+=1
     await page.screenshot(path=str(OUT/f'{w}-{theme}-{motion}-bot.png'))
     evidence.append({'width':w,'theme':theme,'motion':motion,'geometry':g,'baseline':BASE[w]});await ctx.close()
  await b.close()
 OUT.joinpath('results.json').write_text(json.dumps({'checks':checks,'cases':evidence},indent=2));print(f'PASS {checks} assertions / {len(evidence)} real preview cases')
asyncio.run(main())
