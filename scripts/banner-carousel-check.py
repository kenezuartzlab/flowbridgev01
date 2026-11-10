"""Read-only preview regression: carousel navigation, pause and reduced motion.

Run with python3 scripts/banner-carousel-check.py. Screenshots stay in /tmp.
No wallet, settings or database writes are performed.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/banner-regression')


async def active(carousel):
    return await carousel.locator('[aria-roledescription="slide"][aria-hidden="false"]').get_attribute('aria-label')


async def ready(page):
    await page.goto('http://localhost:8080/trade', wait_until='domcontentloaded')
    carousel = page.get_by_role('group', name='Promotions', exact=True)
    await carousel.wait_for(state='visible')
    # SSR renders controls before hydration reads the motion preference.
    # Wait for that observable state, not a fixed cold-start compilation delay.
    if await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"):
        await carousel.get_by_role('button', name='Pause promotions').wait_for(state='hidden', timeout=45000)
    await page.wait_for_timeout(6500)
    return carousel


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    checks = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width in (320, 390, 430, 1280):
            page = await browser.new_page(viewport={'width': width, 'height': 844 if width < 600 else 1800}, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            carousel = await ready(page)
            assert await carousel.get_by_role('button', name='Pause promotions').count() == 0
            checks += 1
            before = await active(carousel)
            await page.wait_for_timeout(4500)
            assert await active(carousel) == before  # no reduced-motion autoplay
            checks += 1
            await carousel.get_by_role('button', name='Show banner 2 of 4').click()
            assert await active(carousel) == '2 of 4'
            checks += 1
            grid = carousel.locator('[tabindex="0"]')
            await grid.focus()
            await page.keyboard.press('ArrowRight')
            assert await active(carousel) == '3 of 4'
            checks += 1
            await grid.dispatch_event('pointerdown', {'clientX': 220})
            await grid.dispatch_event('pointerup', {'clientX': 120})
            assert await active(carousel) == '4 of 4'
            checks += 1
            for i in range(1, 5):
                await carousel.get_by_role('button', name=f'Show banner {i} of 4').click()
                await carousel.screenshot(path=str(OUT / f'{width}-slide-{i}.png'))
            await page.screenshot(path=str(OUT / f'{width}-page.png'))
            assert not errors, errors
            checks += 1
            print(f'{width}px: navigation, swipe, reduced-motion and runtime checks PASS')
            await page.close()
        page = await browser.new_page(viewport={'width':390,'height':844}, reduced_motion='no-preference')
        carousel = await ready(page)
        await carousel.get_by_role('button', name='Pause promotions', exact=True).click()
        await page.mouse.move(0, 0)
        await page.evaluate('document.activeElement.blur()')
        paused = await active(carousel)
        await page.wait_for_timeout(4500)
        assert await active(carousel) == paused
        checks += 1
        await carousel.screenshot(path=str(OUT / '390-paused.png'))
        await carousel.get_by_role('button', name='Resume promotions', exact=True).click()
        await page.mouse.move(0,0)
        await page.evaluate('document.activeElement.blur()')
        await page.wait_for_timeout(4500)
        assert await active(carousel) != paused
        checks += 1
        print(f'{checks} carousel behavior checks PASS; no financial interactions')
        await browser.close()


asyncio.run(main())