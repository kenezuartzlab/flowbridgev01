"""Read-only real catalog acceptance; no backend/config writes or wallet interaction."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/rwa-catalog')

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    checks = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width in (320, 390, 430, 1280):
            for theme in ('dark', 'light'):
                for motion in ('reduce', 'no-preference'):
                    context = await browser.new_context(viewport={'width':width, 'height':844 if width < 600 else 1800}, reduced_motion=motion)
                    page = await context.new_page()
                    errors = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    await page.goto('http://localhost:8080/campaigns/rwa', wait_until='domcontentloaded')
                    await page.get_by_test_id('rwa-catalog').wait_for()
                    await page.wait_for_timeout(1500)
                    assert 'BNB Chain · Research only' in await page.locator('header').inner_text(); checks += 1
                    await page.evaluate('(light)=>document.documentElement.classList.toggle("light",light)', theme == 'light')
                    await page.wait_for_timeout(350)
                    await page.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-start.png'))
                    assert await page.locator('[data-rwa-asset]').count() == 1; checks += 1
                    assert await page.locator('img[alt^="Illustrative gold"]').evaluate('e=>e.complete && e.naturalWidth>0'); checks += 1
                    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'); checks += 1
                    nav = page.get_by_role('navigation',name='Main navigation')
                    baseline = await nav.bounding_box() if width < 768 else None
                    await page.locator('[data-rwa-asset="xaut-bnb"]').get_by_role('button',name='Identity, risks & sources').click()
                    await page.get_by_role('link',name='Contract on BscScan').wait_for()
                    assert await page.get_by_role('link',name='Contract on BscScan').get_attribute('href') == 'https://bscscan.com/token/0x21cAef8A43163Eea865baeE23b9C2E327696A3bf'; checks += 1
                    await page.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-gold.png'))
                    assert 'Listed on DEX / FlowBridge trading pending' in await page.locator('[data-rwa-asset="xaut-bnb"]').inner_text(); checks += 1
                    assert '0x83A0A8A723262651Ae9C54BBbA929F167443bC59' in await page.locator('[data-rwa-asset="xaut-bnb"]').inner_text(); checks += 1
                    assert await page.locator('[data-rwa-asset="xaum-research"]').count() == 0; checks += 1
                    for label, count in (('Tokenized Stocks',0), ('ETFs',0)):
                        await page.get_by_role('tab',name=label,exact=True).click()
                        assert await page.locator('[data-rwa-asset]').count() == count; checks += 1
                        await page.get_by_text('Not supported · Research only',exact=True).click()
                        assert await page.get_by_role('link',name='PancakeSwap RWA support',exact=True).get_attribute('href') == 'https://docs.pancakeswap.finance/trade/pancakeswap-x/rwas'; checks += 1
                        assert 'Per-token issuer proof' in await page.get_by_test_id('rwa-catalog').inner_text(); checks += 1
                        assert await page.get_by_role('link',name='Contract on BscScan').count() == 0; checks += 1
                        assert await page.get_by_role('button', name='Buy',exact=True).count() == 0; checks += 1
                        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'); checks += 1
                        await page.screenshot(path=str(OUT/f'{width}-{theme}-{motion}-{label.split()[0]}.png'))
                    if motion == 'reduce':
                        await page.get_by_role('tab',name='Gold & Metals',exact=True).click()
                        assert await page.locator('[data-rwa-asset]').first.evaluate('e=>getComputedStyle(e).animationName') == 'none'; checks += 1
                    if baseline:
                        await page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
                        after = await nav.bounding_box()
                        assert after == baseline; checks += 1
                        assert await nav.locator('[aria-current="page"]').get_attribute('data-nav-id') == 'explore'; checks += 1
                        icons = await nav.locator('[data-nav-icon]').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().toJSON())')
                        assert len({(b['y'],b['width'],b['height']) for b in icons}) == 1; checks += 1
                        await nav.get_by_role('link',name='Trade',exact=True).click()
                        await page.wait_for_url('**/trade')
                        assert await nav.locator('[aria-current="page"]').get_attribute('data-nav-id') == 'trade'; checks += 1
                    assert not errors, errors; checks += 1
                    print(width, theme, motion, 'PASS')
                    await context.close()
        await browser.close()
    print(checks, 'assertions PASS')

asyncio.run(main())