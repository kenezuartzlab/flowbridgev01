"""Disposable PostgreSQL Adventure regression; no hosted writes or credentials."""
import pathlib,subprocess,tempfile,pwd,os,concurrent.futures,shutil
base=pathlib.Path(tempfile.mkdtemp(prefix='adventure-db-'));data=base/'data';sock=base/'sock';sock.mkdir();port=55481
u=pwd.getpwnam('lovable')
def demote():os.setgroups([]);os.setgid(u.pw_gid);os.setuid(u.pw_uid)
def local(*args):subprocess.run(list(map(str,args)),preexec_fn=demote,check=True,stdout=subprocess.DEVNULL)
def sql(q,check=True):return subprocess.run(['psql','-X','-h',str(sock),'-p',str(port),'-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],capture_output=True,text=True,check=check)
try:
 subprocess.run(['chown','-R','lovable:lovable',str(base)],check=True);base.chmod(0o755)
 local('initdb','-D',data,'-A','trust','--no-locale');local('pg_ctl','-D',data,'-o',f"-F -k {sock} -p {port} -c listen_addresses=''",'-w','start')
 sql("CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE TABLE app_admins(email text,role text,disabled bool);CREATE TABLE identity_pairs(user_id uuid,email text,original_wallet text,current_wallet text);CREATE TABLE identity_review_cases(user_id uuid);CREATE TABLE verified_activities(activity_id text,user_wallet text,kind text,status text,source_chain_id bigint,evidence_source text,source_tx_hash text,source_log_index int,occurred_at timestamptz);CREATE TABLE flow_points_ledger(user_id uuid,verified_activity_id text,reason text,program_id text,points int,verified_usd numeric,provenance_state text);CREATE TABLE referral_attributions(user_id uuid,referrer_id uuid,attributed_at timestamptz);CREATE TABLE referral_milestone_awards(referrer_id uuid,referee_id uuid);CREATE TABLE campaign_completions(completion_id text,user_wallet text,task_id text,campaign_id text,completed_at timestamptz);CREATE TABLE campaign_tasks(task_id text,campaign_id text,rules jsonb);CREATE TABLE campaigns(campaign_id text,review_state text);CREATE TABLE admin_audit_events(actor_user_id uuid,actor_email text,actor_role text,object_type text,object_id text,action text,old_value jsonb,new_value jsonb,reason text);")
 for name in ['0062_adventure_non_economic_achievements.sql','0063_adventure_canonical_evidence_fields.sql','0064_adventure_verified_program_filter.sql']:sql(pathlib.Path('drizzle/migrations',name).read_text())
 me='00000000-0000-0000-0000-000000000001'; other='00000000-0000-0000-0000-000000000002';wallet='0x'+'1'*40;tx='0x'+'a'*64
 sql(f"INSERT INTO auth.users VALUES('{me}','preview@example.test',now()),('{other}','friend@example.test',now());INSERT INTO app_admins VALUES('preview@example.test','super_admin',false);INSERT INTO identity_pairs VALUES('{me}','preview@example.test','{wallet}','{wallet}');")
 assert sql(f"SELECT adventure_sync('{me}');",False).returncode!=0
 sql("INSERT INTO adventure_config(id,preview_enabled) VALUES(true,true);")
 assert sql(f"SELECT adventure_sync('{other}');",False).returncode!=0
 sql(f"SELECT adventure_sync('{me}');SELECT adventure_sync('{me}');")
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='binding';").stdout.strip()=='1'
 for topic,answers in [('basics','[1,0,2]'),('ecosystem','[2,1,0]'),('safety','[0,2,1]')]:
  c=sql(f"INSERT INTO adventure_quiz_challenges(user_id,topic,period_id,created_at) VALUES('{me}','{topic}',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),now()-interval '10 seconds') RETURNING id;").stdout.splitlines()[0]
  assert sql(f"SELECT adventure_quiz('{me}','{topic}','{c}','{answers}');").returncode==0
  assert sql(f"SELECT adventure_quiz('{other}','{topic}','{c}','{answers}');",False).returncode!=0
 sql(f"SELECT adventure_sync('{me}');")
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='daily_badge';").stdout.strip()=='1'
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='weekly_badge';").stdout.strip()=='1'
 sql(f"INSERT INTO verified_activities VALUES('activity','{wallet}','SWAP_EXECUTED','CONFIRMED',677,'ROUTER_V4_SWAP_ACTIVITY','{tx}',0,now());INSERT INTO flow_points_ledger VALUES('{me}','activity','CORE_SWAP_V2','CORE_SWAP',5,5,'VERIFIED');")
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:list(ex.map(lambda _:sql(f"SELECT adventure_sync('{me}');"),range(8)))
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='swap';").stdout.strip()=='1'
 assert sql(f"INSERT INTO adventure_completions(user_id,quest_id,period_id,evidence_key,chain_id,tx_hash,event_index) VALUES('{other}','swap','tomorrow','duplicate',677,'{tx.upper()}',0);",False).returncode!=0
 assert sql("SELECT count(*) FROM flow_points_ledger;").stdout.strip()=='1'
 assert sql("SELECT sum(points) FROM flow_points_ledger;").stdout.strip()=='5'
 # Replayed, wrong, stale and other-account quiz challenges fail closed.
 sql(f"DELETE FROM adventure_completions WHERE quest_id='basics';")
 c=sql(f"INSERT INTO adventure_quiz_challenges(user_id,topic,period_id,created_at) VALUES('{me}','basics',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),now()-interval '10 seconds') RETURNING id;").stdout.splitlines()[0]
 assert 'false' in sql(f"SELECT adventure_quiz('{me}','basics','{c}','[0,0,0]');").stdout
 assert sql(f"SELECT adventure_quiz('{me}','basics','{c}','[1,0,2]');",False).returncode!=0
 c=sql(f"INSERT INTO adventure_quiz_challenges(user_id,topic,period_id,created_at) VALUES('{me}','basics','2000-01-01',now()-interval '10 seconds') RETURNING id;").stdout.splitlines()[0]
 assert sql(f"SELECT adventure_quiz('{me}','basics','{c}','[1,0,2]');",False).returncode!=0
 # Referral requires BOTH verified unique identity and existing milestone evidence.
 sql(f"INSERT INTO referral_attributions VALUES('{other}','{me}',now());SELECT adventure_sync('{me}');")
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='referral';").stdout.strip()=='0'
 sql(f"INSERT INTO identity_pairs VALUES('{other}','friend@example.test','0x{'2'*40}','0x{'2'*40}');INSERT INTO referral_milestone_awards VALUES('{me}','{other}');SELECT adventure_sync('{me}');SELECT adventure_sync('{me}');")
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='referral';").stdout.strip()=='1'
 # A second activity below the original CORE_SWAP threshold does not count.
 sql("UPDATE adventure_completions SET period_id='2000-01-01',completed_at='2000-01-01' WHERE quest_id='swap';")
 sql(f"INSERT INTO verified_activities VALUES('small','{wallet}','SWAP_EXECUTED','CONFIRMED',677,'ROUTER_V4_SWAP_ACTIVITY','0x{'b'*64}',0,now());INSERT INTO flow_points_ledger VALUES('{me}','small','CORE_SWAP_V2','CORE_SWAP',1,1,'VERIFIED');SELECT adventure_sync('{me}');")
 assert sql("SELECT count(*) FROM adventure_completions WHERE quest_id='swap';").stdout.strip()=='1'
 # Browser acceptance uses the real isolated SQL flow, never enables hosted settings.
 import asyncio,json
 from playwright.async_api import async_playwright
 async def browser_check():
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800},reduced_motion='reduce');page=await context.new_page()
   async def route_api(route):
    body=route.request.post_data_json if route.request.method=='POST' else None
    if body and body.get('action') in ['start','answer']:
     t=body['topic']; cid=body.get('challenge');args=f"'{me}','{t}'"+(f",'{cid}','{json.dumps(body['answers'])}'" if cid else '')
     result=sql(f"SELECT adventure_quiz({args});",False)
    else:result=sql(f"SELECT adventure_sync('{me}');",False)
    await route.fulfill(status=200 if result.returncode==0 else 409,content_type='application/json',body=result.stdout.strip() if result.returncode==0 else '{"error":"Quiz is cooling down or expired."}')
   await page.route('**/api/adventure',route_api)
   await page.goto('http://localhost:8080/adventure');await page.get_by_role('heading',name='Your guaranteed chest').wait_for()
   # Start the remaining basics quiz through the visible UI.
   sql("UPDATE adventure_quiz_challenges SET created_at=now()-interval '1 hour';")
   await page.get_by_role('button',name='Start knowledge check').click()
   await page.get_by_label('BOT',exact=True).check();await page.get_by_label('Practice',exact=True).check();await page.get_by_label('Never',exact=True).check()
   sql("UPDATE adventure_quiz_challenges SET created_at=now()-interval '10 seconds' WHERE consumed_at IS NULL;")
   await page.get_by_role('button',name='Check answers').click();await page.get_by_text('Knowledge check verified.',exact=True).wait_for()
   await page.get_by_role('button',name='Reveal badge',exact=True).click();await page.get_by_role('button',name='Badge revealed').wait_for()
   pathlib.Path('/tmp/browser/adventure').mkdir(parents=True,exist_ok=True)
   for width in [320,390,430,1280]:
    await page.set_viewport_size({'width':width,'height':1800})
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.screenshot(path=f'/tmp/browser/adventure/verified-{width}.png')
   await browser.close()
 asyncio.run(browser_check())
 for table in ['adventure_config','adventure_completions','adventure_quiz_challenges']:
  for role in ['anon','authenticated']:assert sql(f"SELECT has_table_privilege('{role}','{table}','SELECT,INSERT,UPDATE,DELETE');").stdout.strip()=='f'
 sql(f"SELECT adventure_preview_setting('{me}','{wallet}',false,60,'Pause isolated test preview');")
 assert sql(f"SELECT adventure_sync('{me}');",False).returncode!=0
 assert sql("SELECT count(*) FROM admin_audit_events;").stdout.strip()=='1'
 print('PASS: OFF/auth negatives, once-only binding, three nonfinancial quizzes, fixed daily/weekly badges, eight-way sync, duplicate transaction, economic rows untouched, private grants and audited pause (disposable DB).')
finally:
 if data.exists():subprocess.run(['pg_ctl','-D',str(data),'-m','immediate','stop'],preexec_fn=demote,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(base,ignore_errors=True)