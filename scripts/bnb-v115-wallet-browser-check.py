"""V1.15 non-funded EIP-1193 browser dry-run. Simulated providers only; no signing or transaction transport."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/bnb-v115-wallet')
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        page = await context.new_page()
        page.set_default_timeout(30000)
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append({'method': request.method, 'url': request.url, 'body': request.post_data or ''}))
        await page.goto('http://localhost:8080/trade', wait_until='domcontentloaded')
        await page.get_by_role('button', name='Select swap chain, BOT Mainnet', exact=True).wait_for()
        await page.wait_for_timeout(3500)
        results = await page.evaluate('''async()=>{
          const m=await import('/src/lib/bnb/walletDryRun.ts');
          const E=10n**18n,A='0x00000000000000000000000000000000000000a1';
          const context={chainId:56,account:A,tokenIn:'WBNB',tokenOut:'USDT',poolFee:500,amountIn:E/100n};
          const gross=6n*E,fee=gross*5n/10000n,net=gross-fee;
          const quote={...context,source:'PANCAKE_V3_QUOTER',quotedGrossOut:gross,quotedAtSec:1000,quoteBlock:500};
          const output=[];
          for(const wallet of m.SUPPORTED_DRY_RUN_WALLETS){
            const simulated=m.createSimulatedInjectedProvider({wallet,account:A,chainId:56,blockNumber:500});
            const account=await m.connectDryRunWallet(simulated.provider);
            const result=await m.reviewInjectedWalletDryRun({provider:simulated.provider,quote,current:context,nowSec:1010,currentBlock:520,approvedMinNetOut:(net*9950n)/10000n,slippageBps:50,slippageAcknowledged:true,feeBps:5});
            let signError='',sendError='';
            try{await simulated.provider.request({method:'personal_sign',params:['0x00',A]})}catch(e){signError=String(e.message)}
            try{await simulated.provider.request({method:'eth_sendTransaction',params:[]})}catch(e){sendError=String(e.message)}
            output.push({wallet,account,calls:simulated.calls,mode:result.mode,reasons:result.reasons,canSign:result.canSign,canSubmit:result.canSubmit,fee:String(result.fee.feeAmount),net:String(result.fee.netOut),gas:result.gas.status,signError,sendError});
          }
          return output;
        }''')
        assert len(results) == 3
        for result in results:
            assert result['calls'] == ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'personal_sign', 'eth_sendTransaction'], result
            assert result['mode'] == 'NON_EXECUTABLE_REVIEW' and result['reasons'] == ['EXECUTION_DISABLED'], result
            assert result['canSign'] is False and result['canSubmit'] is False
            assert result['fee'] == '3000000000000000' and result['net'] == '5997000000000000000'
            assert result['gas'] == 'UNAVAILABLE'
            assert 'DRY_RUN_FORBIDS_personal_sign' in result['signError']
            assert 'DRY_RUN_FORBIDS_eth_sendTransaction' in result['sendError']

        picker = page.get_by_role('button', name='Select swap chain, BOT Mainnet', exact=True)
        await picker.click()
        dialog = page.get_by_role('dialog', name='Swap chain selection')
        await dialog.wait_for()
        await dialog.get_by_role('button', name='BNB Mainnet · 56').click()
        await page.get_by_role('region', name='BNB read-only trading view').wait_for()
        assert await page.get_by_role('button', name='Swap', exact=True).count() == 0
        assert await page.get_by_role('button', name='Approve', exact=True).count() == 0
        assert await page.get_by_role('button', name='Connect Wallet', exact=True).count() == 0
        assert await page.locator('[data-swap-heading]').evaluate('(element)=>element.getBoundingClientRect().height') == 32
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        await page.screenshot(path=str(OUT / '390-bnb-no-execution.png'))
        await page.wait_for_timeout(500)
        forbidden_network = [r for r in requests if any(marker in r['url'].lower() for marker in ('dist-bbememwr', 'apicontroller-cbrb2bro', 'relay.walletconnect', '@walletconnect', 'reown'))]
        forbidden_writes = [r for r in requests if any(method in r['body'] for method in ('eth_sendTransaction', 'personal_sign', 'eth_sendRawTransaction', 'wallet_switchEthereumChain'))]
        assert not forbidden_network, forbidden_network
        assert not forbidden_writes, forbidden_writes
        assert not errors, errors
        evidence = {'status': 'PASS', 'viewport': [390, 844], 'wallets': results, 'walletConnectSdkRequests': forbidden_network, 'walletWriteRequests': forbidden_writes, 'pageErrors': errors, 'physicalDevices': 'UNVERIFIED', 'screenshot': str(OUT / '390-bnb-no-execution.png')}
        (OUT / 'results.json').write_text(json.dumps(evidence, indent=2))
        print(json.dumps(evidence, indent=2))
        await browser.close()

asyncio.run(main())
