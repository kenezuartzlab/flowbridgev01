"""Actual hook/card regression; synthetic read-only wallet and chain evidence.

No account request, signature or transaction is allowed. Only the RPC client
factory is replaced; the real polling, evaluation and review effects run.
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/claim-monitoring')
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(1280, 1800), (384, 575)]:
            page = await browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))

            async def hook(route):
                response = await route.fetch()
                body = await response.text()
                original = 'const client = createPublicClient('
                assert original in body, 'RPC factory instrumentation no longer matches'
                await route.fulfill(response=response, body=body.replace(original, 'const client = window.claimReadClient('))

            async def discovery(route):
                await page.evaluate('window.discoveryCount++')
                await page.wait_for_function('!window.holdRead')
                failed = await page.evaluate('window.failDiscovery')
                rounds = await page.evaluate('window.fixtureRound ? [window.fixtureRound] : []')
                await route.fulfill(status=503 if failed else 200, content_type='application/json', body=json.dumps({'rounds': rounds}))

            await page.route('**/src/lib/rewards/useMainnetFlowClaim.ts*', hook)
            await page.route('**/api/public/reward-rounds?*', discovery)
            await page.goto('http://localhost:8080/home', wait_until='domcontentloaded')
            await page.wait_for_timeout(2500)
            await page.evaluate('''async () => {
              const {default:React}=await import('/node_modules/.vite/deps/react.js');
              const dom=await import('/node_modules/.vite/deps/react-dom_client.js');
              const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js');
              const {WagmiProvider}=await import('/node_modules/.vite/deps/wagmi.js');
              const {wagmiConfig}=await import('/src/lib/wagmi.ts');
              const {merkleClaimLeafHash}=await import('/src/lib/rewards/merkleClaim.ts');
              const {getFlowRewardsChainConfig}=await import('/src/lib/rewards/flowRewardsRegistry.ts');
              const {MainnetFlowClaimCard}=await import('/src/components/rewards/MainnetFlowClaimCard.tsx');
              const {RewardProgressPanel}=await import('/src/components/rewards/RewardProgressPanel.tsx');
              const {computeRewardProgression}=await import('/src/lib/rewards/rewardProgression.ts');
              const {RouterProvider,Outlet,createRootRoute,createRoute,createRouter}=await import('/node_modules/@tanstack/react-router/dist/esm/index.js');
              window.testAccount='0x2222222222222222222222222222222222222222';
              window.walletAccount=window.testAccount; window.walletWrites=0;
              window.ethereum={request:async({method})=>{
                if(method==='eth_accounts') return window.walletAccount ? [window.walletAccount] : [];
                window.walletWrites++; throw Error('Wallet operation prohibited: '+method);
              }};
              window.discoveryCount=0; window.holdRead=false; window.failDiscovery=false; window.paused=false;
              const now=2000000000, config=getFlowRewardsChainConfig(677);
              const leaf={epochId:4,index:0,account:window.testAccount,amount:'50000000000000000000'};
              const root=merkleClaimLeafHash({chainId:677,distributor:config.distributor,leaf});
              window.fixtureRound={epochId:4,root,allocationWei:leaf.amount,claimStart:now-100,claimEnd:now+1000,distributor:config.distributor,leaf:{...leaf,proof:[]}};
              window.claimReadClient=()=>({
                getBlock:async()=>({timestamp:BigInt(now)}),
                readContract:async({functionName})=>{
                  if(functionName==='epochCount')return 5n;
                  if(functionName==='paused')return window.paused;
                  if(functionName==='totalReserved'||functionName==='balanceOf')return 10000000000000000000000n;
                  if(functionName==='isClaimed')return false;
                  if(functionName==='getEpoch')return {root,claimStart:BigInt(now-100),claimEnd:BigInt(now+1000),cancelled:false,released:false};
                  throw Error('Unexpected read: '+functionName);
                }
              });
              const progression=computeRewardProgression({ledger:[{points:50,chainId:677,fundingState:'FUNDED',programId:'CORE_SWAP'}],reconciledPoints:50,reviewHeldPoints:0,historicalNonclaimable:0,reconciliationOk:true,storedFlowPoints:50,walletBound:true,allocations:[{epochId:4,amountFlow:50,walletMatches:true,proofValid:true,onChain:true,claimed:false,claimStart:0,claimEnd:4000000000}],nowSec:now});
              const parent=createRootRoute({component:Outlet});
              const home=createRoute({getParentRoute:()=>parent,path:'/home',component:()=>React.createElement(RewardProgressPanel,{p:progression,area:'home'})});
              const earn=createRoute({getParentRoute:()=>parent,path:'/earn',component:MainnetFlowClaimCard});
              const router=createRouter({routeTree:parent.addChildren([home,earn])});
              document.body.replaceChildren();const el=document.createElement('div');document.body.append(el);
              (dom.createRoot??dom.default.createRoot)(el).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(WagmiProvider,{config:wagmiConfig},React.createElement(RouterProvider,{router}))));
            }''')
            link = page.get_by_role('link', name='Claim in wallet', exact=True)
            await page.wait_for_timeout(1200)
            await page.screenshot(path=str(OUT / f'{width}-home.png'))
            assert await link.get_attribute('href') == '/earn#mainnet-flow-claim'
            await link.click()
            await page.wait_for_url('**/earn#mainnet-flow-claim')
            await page.locator('#mainnet-flow-claim').wait_for()
            claim = page.get_by_role('button', name='Claim FLOW', exact=True)
            await page.wait_for_function("document.querySelector('#mainnet-flow-claim') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Claim FLOW'&&!b.disabled)")
            await claim.click()
            review = page.get_by_role('region', name='Confirm FLOW recipient')
            await review.wait_for()
            await page.screenshot(path=str(OUT / f'{width}-review.png'))

            # Exercise the actual 30-second timer, not a mocked hook state.
            count = await page.evaluate('window.discoveryCount')
            await page.evaluate('window.holdRead=true')
            await page.wait_for_function(f'window.discoveryCount > {count}', timeout=35000)
            assert await review.is_visible()
            assert await review.get_by_role('button', name='Continue in wallet').is_disabled()
            assert await review.get_by_text('50 FLOW · BOT Mainnet', exact=True).is_visible()
            assert await page.locator('#mainnet-flow-claim').get_by_text('50 FLOW', exact=True).is_visible()
            await page.evaluate('window.holdRead=false')
            await page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent==='Continue in wallet'&&!b.disabled)")
            assert await review.is_visible()
            await review.screenshot(path=str(OUT / f'{width}-after-poll.png'))

            # A changed completed read must still discard the reviewed selection.
            await page.evaluate('window.paused=true')
            await page.get_by_role('button', name='Re-check live state').click()
            await review.wait_for(state='hidden')
            assert await claim.is_disabled()
            await page.evaluate('window.paused=false')
            await page.get_by_role('button', name='Re-check live state').click()
            await page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent==='Claim FLOW'&&!b.disabled)")
            await claim.click()
            await review.wait_for()

            # Failed refresh blocks claims and clears review (fail-closed).
            await page.evaluate('window.failDiscovery=true')
            await page.get_by_role('button', name='Re-check live state').click()
            await review.wait_for(state='hidden')
            assert await claim.is_disabled()
            await page.evaluate('window.failDiscovery=false')
            await page.get_by_role('button', name='Re-check live state').click()
            await page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent==='Claim FLOW'&&!b.disabled)")
            await claim.click()
            await review.wait_for()
            await page.evaluate("window.walletAccount='0x3333333333333333333333333333333333333333'; window.fixtureRound=null")
            await review.wait_for(state='hidden')
            assert await claim.is_disabled()
            assert await page.evaluate('window.walletWrites') == 0
            assert not errors, errors
            print(width, 'PASS: Home navigation, actual 30s poll, totals, pause/failure/wallet invalidation; zero wallet writes')
            await page.close()
        await browser.close()

asyncio.run(main())