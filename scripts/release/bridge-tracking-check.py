"""Read-only actual tracker regression using two externally supplied public receipt pairs.

Usage: python3 scripts/release/bridge-tracking-check.py /tmp/BOT_TO_BNB.json /tmp/BNB_TO_BOT.json
Pairs contain source/destination receipts. Never commit wallet-bearing captures.
Only public RPC reads occur; wallet requests/signatures/broadcasts are prohibited.
"""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/bridge-tracking')
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    pairs = [json.loads(Path(path).read_text()) for path in sys.argv[1:]]
    assert len(pairs) == 2, 'Supply BOT_TO_BNB and BNB_TO_BOT receipt pairs'
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(384, 575), (1280, 1800)]:
            for direction, pair in zip(['BOT_TO_BNB', 'BNB_TO_BOT'], pairs):
                page = await browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                fault = {'lag': False, 'stale': False}

                async def hook(route):
                    response = await route.fetch()
                    body = await response.text()
                    old = 'const stored = storedDestinationFor(txHash);'
                    assert old in body
                    await route.fulfill(response=response, body=body.replace(old, 'const stored = window.bridgeStaleHash;'))

                async def rpc(route):
                    payload = route.request.post_data_json
                    if isinstance(payload, dict):
                        method = payload.get('method')
                        if method in ['eth_sendTransaction', 'eth_sendRawTransaction', 'personal_sign']:
                            raise AssertionError('Financial operation forbidden')
                        if method == 'eth_getTransactionReceipt' and payload.get('params') == ['0x' + 'ff' * 32]:
                            fault['stale'] = True
                            await route.fulfill(content_type='application/json', body=json.dumps({'jsonrpc': '2.0', 'id': payload['id'], 'result': None}))
                            return
                        if method == 'eth_getLogs' and not fault['lag']:
                            fault['lag'] = True
                            await route.fulfill(content_type='application/json', body=json.dumps({'jsonrpc': '2.0', 'id': payload['id'], 'result': []}))
                            return
                    await route.continue_()

                await page.route('**/src/lib/bridge/useBridgeTracking.ts*', hook)
                await page.route('https://rpc.botchain.ai/**', rpc)
                await page.route('https://bsc-rpc.publicnode.com/**', rpc)
                await page.goto('http://localhost:8080/trade', wait_until='domcontentloaded')
                await page.wait_for_timeout(2000)
                await page.evaluate('''async ({hash,direction}) => {
                    const {default:React}=await import('/node_modules/.vite/deps/react.js');
                    const dom=await import('/node_modules/.vite/deps/react-dom_client.js');
                    const {RealtimeBridgeTrackerModal}=await import('/src/modals/RealtimeBridgeTrackerModal.tsx');
                    window.bridgeStaleHash='0x'+'ff'.repeat(32);
                    window.bridgeWrites=0;
                    window.ethereum={request:async()=>{window.bridgeWrites++;throw Error('Wallet requests prohibited');}};
                    const mount=document.createElement('div');document.body.append(mount);
                    (dom.createRoot??dom.default.createRoot)(mount).render(React.createElement(RealtimeBridgeTrackerModal,{
                        isOpen:true,fromChain:direction==='BOT_TO_BNB'?'BOT':'BNB',toChain:direction==='BOT_TO_BNB'?'BNB':'BOT',
                        amount:'',symbol:'USDT',recipientAddress:'',txHash:hash,bridgeDirection:direction,isMainnet:true,
                        onClose:()=>{},onReset:()=>{},onComplete:()=>{}
                    }));
                }''', {'hash': pair['source']['transactionHash'], 'direction': direction})
                try:
                    await page.get_by_text('Completed — USDT received', exact=True).wait_for(timeout=150000)
                except Exception:
                    print(direction, width, 'FAIL', fault, await page.get_by_role('status').all_text_contents())
                    await page.screenshot(path=str(OUT / 'failure.png'))
                    raise
                link = page.get_by_role('link', name='View delivery transaction')
                assert (await link.get_attribute('href')).endswith(pair['destination']['transactionHash'])
                assert await page.evaluate('window.bridgeWrites') == 0
                assert fault == {'lag': True, 'stale': True}, fault
                assert not errors, errors
                await page.screenshot(path=str(OUT / f'{direction}-{width}.png'))
                print(direction, width, 'PASS: stale receipt + delayed indexing recover to exact confirmed release; zero wallet calls')
                await page.close()
        await browser.close()

asyncio.run(main())