import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/publisher-final');live=json.loads(Path('/tmp/publisher-acceptance/live.json').read_text());s=live['report']['settlement'];wallet=s['signer']['address'];HASH='0x'+'a'*64
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);ctx=await b.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: auth=json.load(f)
  await page.goto('http://localhost:8080');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[auth['storage_key'],json.dumps(auth['session'])]);await page.reload(wait_until='domcontentloaded');await page.wait_for_timeout(4000);page.on('pageerror',lambda e:print('PAGEERROR',str(e)))
  state={'attempt':None,'phase':'BROADCAST_PENDING','sends':0,'audits':0,'scenario':'reject','generation':0}
  async def api(route):
   req=route.request;method=req.method;body=json.loads(req.post_data or '{}');a=state['attempt'];j={}
   if method=='GET':j={'attempts':[a] if a else [],'history':[{'object_id':'677:3','action':'PUBLISH_CONFIRMED_VERIFIED','new_value':{},'created_at':'2026-10-20T01:00:00Z'}]*state['audits']}
   elif method=='PUT':
    if a and not a['retry_safe']:await route.fulfill(status=409,json={'error':'locked'});return
    state['generation']+=1;a={'id':'attempt','operation_id':str(state['generation']),'epoch_id':3,'root':s['root'],'fingerprint':s['fingerprint'],'tx_hash':None,'phase':'AWAITING_WALLET','retry_safe':False};state['attempt']=a;j={'attemptId':a['id'],'operationId':a['operation_id'],'nonce':42}
   elif method=='PATCH':
    if body.get('action')=='cancel' and a['phase']=='AWAITING_WALLET' and not a['tx_hash']:a.update(phase='CANCELLED',retry_safe=True)
    elif state['phase']=='CONFIRMED_VERIFIED':
     if a['phase']!='CONFIRMED_VERIFIED':state['audits']+=1
     a.update(phase='CONFIRMED_VERIFIED',tx_hash=HASH)
    else:a.update(phase='RECOVERY_REQUIRED')
    j={'phase':a['phase'],'retrySafe':a['retry_safe']}
   elif method=='POST':
    a.update(tx_hash=body['txHash'],phase=state['phase'],retry_safe=state['phase']=='REVERTED')
    if state['phase']=='CONFIRMED_VERIFIED' and not state['audits']:state['audits']=1
    j={'phase':a['phase'],'retrySafe':a['retry_safe']}
   await route.fulfill(json=j)
  await page.route('**/api/admin/rewards-publish-verify',api)
  async def mount():
   await page.evaluate('''async([s,w])=>{const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=ReactDOM;const {PublishBatchPanel}=await import('/src/components/ops/PublishBatchPanel.tsx');if(window.testRoot)window.testRoot.unmount();const el=document.createElement('main');document.body.replaceChildren(el);window.testRoot=createRoot(el);window.ethereum={on(){},removeListener(){},request:async({method})=>{if(method==='eth_accounts')return [w];if(method==='eth_chainId')return '0x2a5';if(method==='eth_sendTransaction'){window.sendCount=(window.sendCount||0)+1;if(window.scenario==='reject')throw {code:4001};if(window.scenario==='nested')throw {cause:{code:'ACTION_REJECTED'}};if(window.scenario==='disconnect')throw {code:4900};if(window.scenario==='timeout')throw {code:-32603};if(window.scenario==='close')throw {message:'window closed'};if(window.scenario==='invalid')return '0x';return '0x'+'a'.repeat(64)}}};window.testRoot.render(React.createElement(PublishBatchPanel,{s,wallet:w,stale:false,rebuild:async()=>({data:{settlement:s}})}))}''',[s,wallet]);await page.wait_for_timeout(700)
  async def begin(scenario):
   state.update(attempt=None,audits=0,phase='BROADCAST_PENDING');await page.evaluate('(x)=>{localStorage.removeItem("flowbridge.publisher.pending.v1:"+x.toLowerCase());window.sendCount=0}',wallet);await mount();await page.evaluate('(x)=>window.scenario=x',scenario);await page.get_by_role('button',name='Review & Publish',exact=True).click();await page.get_by_role('button',name='Revalidate & open wallet').click()
  for scenario in ['reject','nested']:
   await begin(scenario);await page.get_by_text('Wallet request cancelled.',exact=False).wait_for();assert state['attempt']['retry_safe'];await mount();await page.get_by_role('button',name='Review & Publish',exact=True).click();assert await page.get_by_role('button',name='Retry Publication').is_enabled();await page.evaluate("()=>window.scenario='reject'");await page.get_by_role('button',name='Retry Publication').click();await page.get_by_text('Wallet request cancelled.',exact=False).wait_for();assert state['generation']>=2;print('PASS cancellation -> restored server state -> operator retry',scenario)
  for scenario in ['disconnect','timeout','close','invalid']:
   await begin(scenario);await page.get_by_role('button',name='Recover Stuck Batch').wait_for();await mount();assert await page.get_by_role('button',name='Review & Publish',exact=True).is_disabled();before=await page.evaluate('()=>window.sendCount');await page.get_by_role('button',name='Recover Stuck Batch').click();await page.wait_for_timeout(150);assert before==await page.evaluate('()=>window.sendCount');assert not state['attempt']['retry_safe'];print('PASS uncertain lock survives refresh without resend',scenario)
  await begin('pending');await page.get_by_role('button',name='Recover Stuck Batch').wait_for();await mount();before=await page.evaluate('()=>window.sendCount');await page.get_by_role('button',name='Re-check Transaction').click();assert not state['attempt']['retry_safe'];assert before==await page.evaluate('()=>window.sendCount');state['phase']='CONFIRMED_VERIFIED';await page.get_by_role('button',name='Recover Stuck Batch').click();await page.get_by_text('Confirmed on chain and verified:',exact=False).wait_for();assert state['audits']==1;await mount();assert state['audits']==1;print('PASS pending -> delayed recovery -> one confirmation audit; no resend')
  await begin('pending');await page.get_by_role('button',name='Recover Stuck Batch').wait_for();await page.wait_for_timeout(200);state['phase']='REVERTED';await mount();await page.get_by_role('button',name='Re-check Transaction').click();await page.get_by_role('button',name='Review & Publish',exact=True).click();assert await page.get_by_role('button',name='Retry Publication').is_enabled();print('PASS reconciled revert enables operator retry')
  state['attempt']=None;await page.evaluate('(x)=>localStorage.removeItem("flowbridge.publisher.pending.v1:"+x.toLowerCase())',wallet);await mount()
  for width in [320,390,430,1280]:
   await page.set_viewport_size({'width':width,'height':1800});await page.get_by_role('button',name='Review & Publish',exact=True).click();await page.screenshot(path=str(OUT/f'panel-{width}.png'));assert await page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth');await page.get_by_role('button',name='Cancel',exact=True).click();print('PASS publisher review layout',width)
  await b.close()
asyncio.run(main())
