import asyncio
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w in [320,390,430,1280]:
   page=await b.new_page(viewport={'width':w,'height':844 if w<600 else 1800},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080/trade');await page.wait_for_timeout(8000)
   await page.evaluate('''async()=>{
    const ReactModule=await import('/node_modules/.vite/deps/react.js');const React=ReactModule.default??ReactModule;const RootModule=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js');
    const {WagmiProvider}=await import('/node_modules/.vite/deps/wagmi.js');const {wagmiConfig}=await import('/src/lib/wagmi.ts');
    window.ethereum={request:async({method})=>{if(method==='eth_accounts')return ['0x2222222222222222222222222222222222222222'];throw Error('Forbidden wallet operation in read-only fixture: '+method)}};
    const {MainnetFlowClaimCard}=await import('/src/components/rewards/MainnetFlowClaimCard.tsx');
    document.body.replaceChildren(); const el=document.createElement('div');document.body.append(el);(RootModule.createRoot??RootModule.default.createRoot)(el).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(WagmiProvider,{config:wagmiConfig},React.createElement(MainnetFlowClaimCard))));
   }''')
   await page.wait_for_timeout(6000);assert await page.get_by_role('button',name='Claim FLOW',exact=True).is_disabled();assert not errors,errors
   await page.screenshot(path=f'/tmp/browser/release-gate/{w}-isolated-claim.png');print(w,'real claim component no-entitlement disabled; no signing');await page.close()
  await b.close()
asyncio.run(main())
