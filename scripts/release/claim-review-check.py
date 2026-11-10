import asyncio
from playwright.async_api import async_playwright
HOOK='''import React from '/node_modules/.vite/deps/react.js';
export function useMainnetFlowClaim(){const [state,setState]=React.useState(window.claimFixture);React.useEffect(()=>{const id=setInterval(()=>setState(window.claimFixture),100);return()=>clearInterval(id)},[]);return {...state,refresh:async()=>{}};}'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for w in [320,390,430,1280]:
   page=await b.new_page(viewport={'width':w,'height':844 if w<600 else 1800},reduced_motion='reduce'); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('**/src/lib/rewards/useMainnetFlowClaim.ts*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=HOOK))
   await page.goto('http://localhost:8080/trade');await page.wait_for_timeout(6500)
   await page.evaluate('''async()=>{
    const {default:React}=await import('/node_modules/.vite/deps/react.js');const root=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {QueryClient,QueryClientProvider}=await import('/node_modules/.vite/deps/@tanstack_react-query.js');const {WagmiProvider}=await import('/node_modules/.vite/deps/wagmi.js');const {wagmiConfig}=await import('/src/lib/wagmi.ts');
    window.testAccount='0x2222222222222222222222222222222222222222'; window.ethereum={request:async({method})=>{if(method==='eth_accounts')return [window.testAccount];throw Error('Wallet operation prohibited: '+method)}};
    window.claimFixture={status:'READ_FAILED',message:'Live reads unavailable',loading:false,rounds:{active:[],history:[],claimable:[],totalClaimableWei:'0'}};
    const {MainnetFlowClaimCard}=await import('/src/components/rewards/MainnetFlowClaimCard.tsx');document.body.replaceChildren(); const el=document.createElement('div');document.body.append(el);(root.createRoot??root.default.createRoot)(el).render(React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(WagmiProvider,{config:wagmiConfig},React.createElement(MainnetFlowClaimCard))));
   }''')
   await page.wait_for_timeout(1700);await page.get_by_role('button',name='Claim FLOW',exact=True).is_disabled()
   await page.evaluate('''()=>{const p={claimable:true,chainId:677,distributor:'0x1111111111111111111111111111111111111111',epochId:4,index:0,account:window.testAccount,amount:'50000000000000000000',proof:[],claimEnd:2000000000};window.claimFixture={status:'CLAIMABLE',loading:false,rounds:{active:[{...p,status:'CLAIMABLE',message:'Claimable now',preparation:p,claimStart:1700000000}],history:[],claimable:[p],totalClaimableWei:p.amount}}}''')
   await page.get_by_role('button',name='Claim FLOW',exact=True).click();review=page.get_by_role('region',name='Confirm FLOW recipient');await review.wait_for();assert await review.get_by_text('0x2222222222222222222222222222222222222222',exact=True).is_visible();await review.screenshot(path=f'/tmp/browser/release-gate/{w}-claim-review.png')
   await page.evaluate('''()=>{window.claimFixture={...window.claimFixture,rounds:{...window.claimFixture.rounds,claimable:[],totalClaimableWei:'0'}}}''');await review.wait_for(state='hidden');assert await page.get_by_role('button',name='Claim FLOW',exact=True).is_disabled();assert not errors,errors;print(w,'read failure/recipient review/stale selection invalidation PASS, no wallet send');await page.close()
  await b.close()
asyncio.run(main())
