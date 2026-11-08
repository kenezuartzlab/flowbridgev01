#!/usr/bin/env python3
"""Isolated disposable PostgreSQL: no hosted financial writes or credentials."""
import pathlib, subprocess, tempfile, shutil, os, concurrent.futures, pwd
P=pathlib.Path('/dev-server'); base=pathlib.Path(tempfile.mkdtemp(prefix='vault-db-')); data=base/'data'; sock=base/'sock';sock.mkdir();port=55461;U='lovable'
def demote():
 u=pwd.getpwnam(U);os.setgroups([]);os.setgid(u.pw_gid);os.setuid(u.pw_uid)
def local(*args,**kw):return subprocess.run(list(map(str,args)),preexec_fn=demote,**kw)
def sql(q,check=True):return subprocess.run(['psql','-X','-h',str(sock),'-p',str(port),'-U',U,'-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],capture_output=True,text=True,check=check)
fixture='''CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
CREATE TABLE profiles(id uuid PRIMARY KEY,email text,wallet_address text,created_at timestamptz,flow_points int,points_self int,points_referral_signup int);
CREATE TABLE app_admins(email text,role text,disabled bool);
CREATE TABLE flow_points_ledger(id uuid PRIMARY KEY,user_id uuid,policy_version text,reason text,points int,base_points int,verified_usd numeric,chain_id int,tx_hash text,source_log_index int,activity_key text,wallet_address text,day_key text,metadata jsonb,created_at timestamptz DEFAULT now(),verified_activity_id text,program_id text,reservation_id uuid,funding_state text,referrer_id uuid,provenance_state text);
CREATE TABLE verified_activities(activity_id text,status text,source_chain_id int,source_tx_hash text,source_log_index int,user_wallet text);
CREATE TABLE reward_reservations(reservation_id uuid,ledger_id uuid,user_id uuid,wallet_address text,points int,program_id text);
CREATE TABLE referral_milestone_awards(referrer_id uuid,referee_id uuid,milestone text,points int);
CREATE TABLE reward_evidence_reviews(id uuid,ledger_id uuid,points int,status text,policy_id text,decided_by uuid,proposed_by uuid,decided_by_email text,proposed_by_email text);
CREATE TABLE reward_budgets(program_id text,total_points bigint,reserved_points bigint,status text,funding_verified bool);
CREATE TABLE reward_retired_drafts(batch_id uuid);
CREATE TABLE reward_settlement_batches(id uuid PRIMARY KEY,epoch_id int,root text,chain_id int,leaves jsonb,total_wei numeric,publication_verified_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE reward_payout_approvals(id uuid,user_id uuid,wallet text,points int,status text,settlement_batch_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE reward_publish_attempts(batch_id uuid,phase text,retry_safe bool);
CREATE TABLE admin_audit_events(actor_user_id uuid,actor_email text,actor_role text,object_type text,object_id text,action text,new_value jsonb,reason text);
CREATE FUNCTION reward_payout_evidence_hash() RETURNS text LANGUAGE sql AS $$SELECT 'evidence'::text$$;
'''
try:
 subprocess.run(['chown','-R',f'{U}:{U}',str(base)],check=True);base.chmod(0o755)
 local('initdb','-D',data,'-A','trust','--no-locale',check=True,stdout=subprocess.DEVNULL)
 local('pg_ctl','-D',data,'-o',f"-F -k {sock} -p {port} -c listen_addresses=''",'-w','start',check=True,stdout=subprocess.DEVNULL)
 sql(fixture)
 sql((P/'drizzle/migrations/0048_rewards_vault_v2_disabled_ledger.sql').read_text())
 for migration in ['0050_vault_v2_future_award_destination_fences.sql','0051_vault_v2_atomic_reserve_and_credit.sql','0052_vault_v2_liability_and_receipt_binding.sql','0053_vault_v2_publisher_intent_fences.sql']: sql((P/'drizzle/migrations'/migration).read_text())
 extra=[pathlib.Path(os.environ['VAULT_EXTRA_SQL'])] if os.environ.get('VAULT_EXTRA_SQL') else sorted((P/'drizzle/migrations').glob('*_vault_v2_scale_and_hash_recovery.sql'))
 assert extra,'scale/hash recovery migration missing'
 for f in extra: r=sql(f.read_text(),False); assert r.returncode==0,r.stderr
 sql((P/'drizzle/migrations/0056_legacy_carryover_v2_20261108.sql').read_text())
 sql((P/'drizzle/migrations/0057_legacy_carryover_completion.sql').read_text())
 sql((P/'drizzle/migrations/0058_carryover_acceptance_hardening.sql').read_text())
 print('SQL install PASS')
 w='0x'+'1'*40;pub='0x'+'2'*40;contract='0x'+'3'*40;code='0x'+'4'*64;u='00000000-0000-0000-0000-000000000001';l='00000000-0000-0000-0000-000000000002';r='00000000-0000-0000-0000-000000000003';batch='0x'+'a'*64
 sql(f"INSERT INTO profiles VALUES('{u}','fixture@test','{w}','2026-11-02T00:00:00Z',100,0,0);INSERT INTO auth.users VALUES('{u}',now(),NULL);INSERT INTO app_admins VALUES('fixture@test','super_admin',false);INSERT INTO reward_budgets VALUES('SIGNUP_BONUS',1000,100,'ACTIVE',true);")
 disabled=sql(f"SELECT reserve_vault_v2_new_awards('{batch}',ARRAY['{l}'::uuid],'hash',ARRAY['{w}'],ARRAY['100000000000000000000'],100000000000000000000,'evidence','[]',1,now(),1,'{code}');",False);assert disabled.returncode and 'DISABLED' in disabled.stderr
 print('Disabled DB gate PASS')
 sql(f"INSERT INTO reward_vault_v2_config(financial_enabled,cutover_accepted,authorized_by,publisher,batch_cap_wei,daily_cap_wei,deployment_verified,contract_address,code_hash,cutover_at) VALUES(true,true,'{u}','{pub}',1000000000000000000000,2000000000000000000000,true,'{contract}','{code}',now()-interval '1 second');")
 sql(f"INSERT INTO flow_points_ledger(id,user_id,policy_version,reason,points,wallet_address,activity_key,program_id,reservation_id,funding_state) VALUES('{l}','{u}','FUNDED_SIGNUP_BONUS_V1','SIGNUP_BONUS_REFEREE',100,'{w}','signup:{u}','SIGNUP_BONUS','{r}','FUNDED');INSERT INTO reward_reservations VALUES('{r}','{l}','{u}','{w}',100,'SIGNUP_BONUS');")
 assert sql('SELECT count(*) FROM reward_award_destinations;').stdout.strip()=='1'
 def call(b=batch):return f"SELECT reserve_vault_v2_new_awards('{b}',ARRAY['{l}'::uuid],vault_v2_source_hash(ARRAY['{l}'::uuid]),ARRAY['{w}'],ARRAY['100000000000000000000'],100000000000000000000,'evidence','[{{\"userId\":\"{u}\",\"classification\":\"MATCH\",\"wallet\":\"{w}\",\"eligibleRowIds\":[\"{l}\"]}}]',1000000000000000000000,now(),10,'{code}');"
 sql("UPDATE reward_budgets SET funding_verified=false;");assert sql(call(),False).returncode;sql("UPDATE reward_budgets SET funding_verified=true;")
 sql(f"UPDATE profiles SET wallet_address='{pub}';");assert sql(call(),False).returncode;sql(f"UPDATE profiles SET wallet_address='{w}';")
 assert sql(call().replace('1000000000000000000000,now()','0,now()'),False).returncode
 assert sql(call().replace("'classification'", "'classification'" ).replace('MATCH','REVIEWED_NONCLAIMABLE_HISTORICAL'),False).returncode
 print('Funding, stale identity, backing, reconciliation gates PASS')
 def reserve(i):return sql(call(),False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: results=list(ex.map(reserve,range(8)))
 assert all(x.returncode==0 for x in results),[x.stderr for x in results]
 assert sql('SELECT count(*) FROM reward_vault_v2_batches;').stdout.strip()=='1'
 assert sql('SELECT count(*) FROM reward_economic_award_allocations;').stdout.strip()=='1'
 assert sql(call('0x'+'b'*64),False).returncode
 print('8 concurrent idempotent reservations, one batch/award PASS')
 v1=sql(f"INSERT INTO reward_payout_approvals VALUES(gen_random_uuid(),'{u}','{w}',100,'CONFIRMED',NULL,now());",False);assert v1.returncode
 b1=sql(f"INSERT INTO reward_settlement_batches(id,chain_id,leaves,publication_verified_at,created_at) VALUES(gen_random_uuid(),677,'[{{\"account\":\"{w}\",\"amount\":\"100000000000000000000\"}}]',NULL,now());",False);assert b1.returncode,b1.stderr
 assert sql(f"UPDATE reward_award_destinations SET destination='LEGACY';",False).returncode
 assert sql(f"UPDATE flow_points_ledger SET points=101 WHERE id='{l}';",False).returncode
 print('V1 approval/batch fences and immutable economic sources PASS')
 # Publisher is a distinct bound Ops account, not merely the cutover administrator.
 pu='00000000-0000-0000-0000-000000000008'
 sql(f"INSERT INTO profiles VALUES('{pu}','publisher@test','{pub}',now(),0,0,0);INSERT INTO auth.users VALUES('{pu}',now(),NULL);INSERT INTO app_admins VALUES('publisher@test','internal_operator',false);")
 def acquire():return f"SELECT acquire_vault_v2_signing('{batch}','{pu}','{pub}',7,10,'0x1234',vault_v2_source_hash(ARRAY['{l}'::uuid]),1000000000000000000000,2000000000000000000000,now());"
 sql('UPDATE reward_vault_v2_config SET financial_enabled=false;');assert sql(acquire(),False).returncode;sql('UPDATE reward_vault_v2_config SET financial_enabled=true;')
 assert sql(acquire().replace(pu,u),False).returncode
 sql('UPDATE reward_budgets SET funding_verified=false;');assert sql(acquire(),False).returncode;sql('UPDATE reward_budgets SET funding_verified=true;')
 sql(f"UPDATE profiles SET wallet_address='{pub}' WHERE id='{u}';");assert sql(acquire(),False).returncode;sql(f"UPDATE profiles SET wallet_address='{w}' WHERE id='{u}';")
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: attempts=list(ex.map(lambda _:sql(acquire(),False),range(8)))
 assert sum(x.returncode==0 for x in attempts)==1,[x.stderr for x in attempts]
 assert sql('SELECT count(*) FROM reward_vault_v2_signing_attempts;').stdout.strip()=='1'
 op=sql('SELECT operation_id FROM reward_vault_v2_signing_attempts;').stdout.strip()
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{u}','{pub}','CANCELLED',NULL,'{{}}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','CANCELLED',NULL,'{{}}');",False).returncode
 print('Publisher DB disabled/admin/funding/wallet gates and 8-way single signing intent PASS')
 # Fix B: RPC non-visibility of a dismissed signature can never release the intent.
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','CANCELLED',NULL,'{{\"verification\":\"EXPLICIT_4001_NO_SEND\",\"nonce\":\"7\"}}');",False).returncode
 sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','UNKNOWN',NULL,'{{\"verification\":\"WALLET_REPORTED_REJECTION_UNRESOLVED\"}}');")
 assert sql(acquire(),False).returncode
 print('Dismissed signature stays UNKNOWN and locked PASS')
 # Fix C: wrong candidate is journaled, never authoritative; exact candidate locks the hash.
 tx='0x'+'c'*64;wrong='0x'+'d'*64;exact='{\"verification\":\"EXACT_TRANSACTION_IDENTITY\",\"nonce\":\"7\"}'
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: recs=list(ex.map(lambda _:sql(f"SELECT record_vault_v2_hash_candidate('{op}','{pu}','{pub}','{wrong}','MANUAL');",False),range(8)))
 assert all(x.returncode==0 for x in recs) and len({x.stdout.strip() for x in recs})==1
 assert sql(f"SELECT count(*) FROM reward_vault_v2_hash_candidates WHERE operation_id='{op}';").stdout.strip()=='1'
 assert sql(f"SELECT record_vault_v2_hash_candidate('{op}','{u}','{pub}','{tx}','MANUAL');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{tx}','{exact}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{wrong}','{{}}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{wrong}','{exact.replace('7','8')}');",False).returncode
 assert sql(f"SELECT reject_vault_v2_hash_candidate('{op}','{pu}','{pub}','{wrong}','{{\"verification\":\"IDENTITY_MISMATCH\"}}');").stdout.strip()=='t'
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{wrong}','{exact}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','CREDITED','{tx}','{{}}');",False).returncode
 sql(f"SELECT record_vault_v2_hash_candidate('{op}','{pu}','{pub}','{tx}','MANUAL');")
 sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{tx}','{exact}');")
 assert sql(f"SELECT tx_hash FROM reward_vault_v2_signing_attempts WHERE operation_id='{op}';").stdout.strip()==tx
 assert sql(f"SELECT status FROM reward_vault_v2_hash_candidates WHERE operation_id='{op}' ORDER BY created_at;").stdout.split()==['REJECTED','VERIFIED']
 other='0x'+'e'*64;sql(f"SELECT record_vault_v2_hash_candidate('{op}','{pu}','{pub}','{other}','MANUAL');")
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{other}','{exact}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','UNKNOWN',NULL,'{{}}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','CANCELLED',NULL,'{{\"verification\":\"CANONICAL_NONCE_CONSUMED_UNPROCESSED\",\"nonce\":\"7\",\"confirmedNonce\":\"8\",\"processedBatch\":\"false\",\"blockHash\":\"{code}\"}}');",False).returncode
 print('Wrong candidate then exact verified hash; authoritative hash immutable PASS')
 assert sql(f"SELECT confirm_vault_v2_credit('{batch}','{tx}',vault_v2_source_hash(ARRAY['{l}'::uuid]),10,'{code}',11,'{{\"verification\":\"EXACT_CANONICAL_CREDIT\"}}');",False).returncode
 import json
 evidence=json.dumps({'verification':'EXACT_CANONICAL_CREDIT','transactionHash':tx,'snapshotHash':sql(f"SELECT vault_v2_source_hash(ARRAY['{l}'::uuid]);").stdout.strip(),'contract':contract,'publisher':pub,'codeHash':code,'chainId':677,'blockHash':code,'blockNumber':'10','headNumber':'12','sourceIds':[l],'logs':[{},{}]})
 q=f"SELECT confirm_vault_v2_credit('{batch}','{tx}',vault_v2_source_hash(ARRAY['{l}'::uuid]),10,'{code}',12,'{evidence}');"
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex: out=list(ex.map(lambda _:sql(q).stdout.strip(),range(6)))
 assert out.count('t')==1 and out.count('f')==5,out
 assert sql("SELECT count(*) FROM reward_vault_v2_credit_evidence;").stdout.strip()=='1'
 print('6 concurrent exact confirmations, one credit/audit PASS')
 sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','CREDITED','{tx}','{{}}');")
 assert sql(f"SELECT transition_vault_v2_signing('{op}','{pu}','{pub}','SUBMITTED','{tx}','{{}}');",False).returncode
 print('Credited signing operation cannot be reopened PASS')
 # Historical data is never routed or rewritten.
 old='00000000-0000-0000-0000-000000000004'
 sql(f"INSERT INTO flow_points_ledger(id,user_id,points,created_at,program_id,policy_version,reason,activity_key) VALUES('{old}','{u}',100,now()-interval '1 year','SIGNUP_BONUS','FUNDED_SIGNUP_BONUS_V1','SIGNUP_BONUS_REFEREE','old');")
 assert sql(f"SELECT count(*) FROM reward_award_destinations WHERE ledger_id='{old}';").stdout.strip()=='0'
 print('Pre-cutover historical awards remain V1 PASS')
 # Same economic ID cannot be inserted into another V2 earning row.
 duplicate='00000000-0000-0000-0000-000000000005'
 assert sql(f"INSERT INTO flow_points_ledger(id,user_id,policy_version,reason,points,wallet_address,activity_key,program_id,funding_state) VALUES('{duplicate}','{u}','FUNDED_SIGNUP_BONUS_V1','SIGNUP_BONUS_REFEREE',100,'{w}','signup:{u}','SIGNUP_BONUS','FUNDED');",False).returncode
 # Legacy rows lack a V2 destination but their obligations are protected globally.
 sql(f"UPDATE flow_points_ledger SET wallet_address='{w}',funding_state='FUNDED',reservation_id='00000000-0000-0000-0000-000000000006' WHERE id='{old}';INSERT INTO reward_reservations VALUES('00000000-0000-0000-0000-000000000006','{old}','{u}','{w}',100,'SIGNUP_BONUS');")
 def approve(_):return sql(f"INSERT INTO reward_payout_approvals VALUES(gen_random_uuid(),'{u}','{w}',100,'CONFIRMED',NULL,now());",False).returncode
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: wins=list(ex.map(approve,range(8)))
 assert wins.count(0)==1,wins
 print('Concurrent V1 approvals cannot consume the same legacy balance PASS')
 # Pre-cutover unpublished obligations can still be tracked after cutover.
 historic='00000000-0000-0000-0000-000000000007'
 sql(f"INSERT INTO reward_settlement_batches(id,chain_id,leaves,publication_verified_at,created_at) VALUES('{historic}',677,'[{{\"account\":\"{w}\",\"amount\":\"100000000000000000000\"}}]',NULL,now()-interval '1 year');INSERT INTO reward_publish_attempts VALUES('{historic}','BROADCAST_PENDING',false);")
 print('Pre-cutover unpublished V1 obligation preserved PASS')
 # Fix D: deterministic keyset pages; no first-1000 starvation.
 sql("INSERT INTO reward_budgets VALUES('CORE_SWAP',100000,10000,'ACTIVE',true);")
 sql("""WITH g AS (SELECT i,md5('u'||i)::uuid uid,md5('l'||i)::uuid lid,md5('r'||i)::uuid rid,'0x'||lpad(to_hex(4096+i),40,'0') w FROM generate_series(1,1200) i)
 , a AS (INSERT INTO profiles SELECT uid,'u'||i||'@test',w,now(),0,0,0 FROM g RETURNING 1)
 , b AS (INSERT INTO auth.users SELECT uid,now(),NULL FROM g RETURNING 1)
 , c AS (INSERT INTO verified_activities SELECT 'act'||i,'CONFIRMED',677,'0x'||md5('t'||i)||md5('x'||i),0,w FROM g RETURNING 1)
 , d AS (INSERT INTO reward_reservations SELECT rid,lid,uid,w,5,'CORE_SWAP' FROM g RETURNING 1)
 SELECT count(*) FROM g""")
 sql("""INSERT INTO flow_points_ledger(id,user_id,policy_version,reason,points,verified_usd,chain_id,tx_hash,source_log_index,activity_key,wallet_address,program_id,reservation_id,funding_state,provenance_state,verified_activity_id) SELECT md5('l'||i)::uuid,md5('u'||i)::uuid,'FLOW_POINTS_V2','CORE_SWAP',5,6,677,'0x'||md5('t'||i)||md5('x'||i),0,'swap:'||i,'0x'||lpad(to_hex(4096+i),40,'0'),'CORE_SWAP',md5('r'||i)::uuid,'FUNDED','VERIFIED','act'||i FROM generate_series(1,1200) i""")
 total=int(sql('SELECT source_count FROM vault_v2_source_summary();').stdout.strip())
 assert total==1200,total
 assert sql('SELECT count(*) FROM vault_v2_source_rows();').stdout.strip()=='1000'
 seen=[];after='NULL'
 while True:
  page=sql(f"SELECT id FROM vault_v2_source_rows_scan({after},NULL,500);").stdout.split()
  if not page: break
  seen+=page;after=f"'{page[-1]}'::uuid"
 assert len(seen)==1200 and len(set(seen))==1200 and seen==sorted(seen)
 last=seen[-1];lu,lw=sql(f"SELECT user_id,wallet_address FROM flow_points_ledger WHERE id='{last}';").stdout.strip().split('|')
 b2='0x'+'f'*64
 rec=json.dumps([{'userId':lu,'classification':'MATCH','wallet':lw,'eligibleRowIds':[last]}])
 r2=sql(f"SELECT reserve_vault_v2_new_awards('{b2}',ARRAY['{last}'::uuid],vault_v2_source_hash(ARRAY['{last}'::uuid]),ARRAY['{lw}'],ARRAY['5000000000000000000'],5000000000000000000,'evidence','{rec}',1000000000000000000000,now(),11,'{code}');",False)
 assert r2.returncode==0,r2.stderr
 assert sql('SELECT source_count FROM vault_v2_source_summary();').stdout.strip()=='1199'
 print('1,200 sources: keyset pages complete, row beyond first 1000 reservable PASS')
 def acq2(n):return f"SELECT acquire_vault_v2_signing('{b2}','{pu}','{pub}',{n},11,'0x1234',vault_v2_source_hash(ARRAY['{last}'::uuid]),1000000000000000000000,2000000000000000000000,now());"
 op2=sql(acq2(8)).stdout.strip()
 bad='{\"verification\":\"CANONICAL_NONCE_CONSUMED_UNPROCESSED\",\"nonce\":\"8\",\"confirmedNonce\":\"8\",\"processedBatch\":\"false\",\"blockHash\":\"'+code+'\"}'
 assert sql(f"SELECT transition_vault_v2_signing('{op2}','{pu}','{pub}','CANCELLED',NULL,'{bad}');",False).returncode
 assert sql(f"SELECT transition_vault_v2_signing('{op2}','{pu}','{pub}','CANCELLED',NULL,'{bad.replace('false','true').replace('\"confirmedNonce\":\"8','\"confirmedNonce\":\"9')}');",False).returncode
 assert sql(acq2(9),False).returncode
 sql(f"SELECT transition_vault_v2_signing('{op2}','{pu}','{pub}','CANCELLED',NULL,'{bad.replace('\"confirmedNonce\":\"8','\"confirmedNonce\":\"9')}');")
 assert sql(acq2(9),False).returncode==0
 print('Release only on canonical consumed nonce with unprocessed batch PASS')

 # One-time legacy partial carryover: fixture source 1314, V1 commitment 1122.
 cu='00000000-0000-0000-0000-000000000099';cl='00000000-0000-0000-0000-000000000098';cw='0x'+'9'*40
 sql(f"INSERT INTO profiles VALUES('{cu}','carry@test','{cw}',now(),1314,0,0);INSERT INTO auth.users VALUES('{cu}',now(),NULL);INSERT INTO app_admins VALUES('carry@test','super_admin',false);INSERT INTO flow_points_ledger(id,user_id,policy_version,reason,points,wallet_address,activity_key,program_id,funding_state,provenance_state,created_at) VALUES('{cl}','{cu}','LEGACY','CORE_SWAP',1314,'{cw}','legacy:carry','CORE_SWAP','UNFUNDED','UNVERIFIED',now()-interval '1 year');INSERT INTO reward_settlement_batches(id,chain_id,leaves,publication_verified_at,created_at) VALUES(gen_random_uuid(),677,'[{{\"account\":\"{cw}\",\"amount\":\"1122000000000000000000\"}}]',now(),now()-interval '1 year');")
 preview=json.loads(sql('SELECT legacy_carryover_preview();').stdout)
 assert any(x['ledgerId']==cl and x['points']==192 and x['source']=='OWNER_GOODWILL' for x in preview['items'])
 ph=preview['snapshotHash']
 assert sql(f"SELECT stage_legacy_carryover('{ph}','{pu}','{pub}');",False).returncode
 sid=sql(f"SELECT stage_legacy_carryover('{ph}','{cu}','{cw}');").stdout.strip()
 assert sql(f"SELECT stage_legacy_carryover('{ph}','{cu}','{cw}');").stdout.strip()==sid
 verified=preview['verifiedPoints'];goodwill=preview['goodwillPoints']
 e=json.dumps({'verification':'FROZEN_RUNTIME_CANONICAL_TOKEN_OWNER_EOA_EXCEPTION','chainId':677,'contract':contract,'codeHash':code,'publisher':pub,'freeWei':'1000000000000000000000000','batchCapWei':'1000000000000000000000','dailyCapWei':'2000000000000000000000','blockHash':code,'v1':{'chainId':677,'blockHash':code,'epochCount':0,'epochs':[]}})
 # unresolved existing V1 publication blocks confirmation, then resolved fixture permits exact approval.
 q=f"SELECT confirm_legacy_carryover('{sid}','{ph}',{verified},{goodwill},'{cu}','{cw}',1000000000000000000000000,'{e}',now());"
 assert sql(q,False).returncode
 sql("UPDATE reward_publish_attempts SET phase='CONFIRMED_VERIFIED',retry_safe=true;")
 assert sql(q,False).returncode # stale commitment hash
 preview=json.loads(sql('SELECT legacy_carryover_preview();').stdout);ph=preview['snapshotHash'];sid=sql(f"SELECT stage_legacy_carryover('{ph}','{cu}','{cw}');").stdout.strip()
 q=f"SELECT confirm_legacy_carryover('{sid}','{ph}',{preview['verifiedPoints']},{preview['goodwillPoints']},'{cu}','{cw}',1000000000000000000000000,'{e}',now());"
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: approvals=list(ex.map(lambda _:sql(q,False),range(8)))
 assert sum(x.returncode==0 for x in approvals)==1,[x.stderr for x in approvals]
 assert sql(f"SELECT points FROM vault_v2_canonical_sources(ARRAY['{cl}'::uuid],false);").stdout.strip()=='192'
 assert sql(f"UPDATE flow_points_ledger SET provenance_state='VERIFIED' WHERE id='{cl}';",False).returncode
 assert sql(f"INSERT INTO reward_payout_approvals VALUES(gen_random_uuid(),'{cu}','{cw}',1,'CONFIRMED',NULL,now()-interval '2 years');",False).returncode
 print('Carryover exact partial 192, operator denial, staging replay, stale V1 hash, eight-way single approval, immutable provenance and V1 fence PASS')
finally:
 local('pg_ctl','-D',data,'-m','immediate','stop',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(base,ignore_errors=True)
