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
CREATE TABLE reward_budgets(program_id text,total_points bigint,reserved_points bigint,status text,funding_verified bool);
CREATE TABLE reward_retired_drafts(batch_id uuid);
CREATE TABLE reward_settlement_batches(id uuid PRIMARY KEY,chain_id int,leaves jsonb,total_wei numeric,publication_verified_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE reward_payout_approvals(id uuid,user_id uuid,wallet text,points int,status text,settlement_batch_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE reward_publish_attempts(batch_id uuid,phase text,retry_safe bool);
CREATE TABLE admin_audit_events(actor_user_id uuid,actor_email text,actor_role text,object_type text,object_id text,action text,new_value jsonb);
CREATE FUNCTION reward_payout_evidence_hash() RETURNS text LANGUAGE sql AS $$SELECT 'evidence'::text$$;
'''
try:
 subprocess.run(['chown','-R',f'{U}:{U}',str(base)],check=True);base.chmod(0o755)
 local('initdb','-D',data,'-A','trust','--no-locale',check=True,stdout=subprocess.DEVNULL)
 local('pg_ctl','-D',data,'-o',f"-F -k {sock} -p {port} -c listen_addresses=''",'-w','start',check=True,stdout=subprocess.DEVNULL)
 sql(fixture)
 sql((P/'drizzle/migrations/0048_rewards_vault_v2_disabled_ledger.sql').read_text())
 for migration in ['0050_vault_v2_future_award_destination_fences.sql','0051_vault_v2_atomic_reserve_and_credit.sql','0052_vault_v2_liability_and_receipt_binding.sql']: sql((P/'drizzle/migrations'/migration).read_text())
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
 tx='0x'+'c'*64
 assert sql(f"SELECT confirm_vault_v2_credit('{batch}','{tx}',vault_v2_source_hash(ARRAY['{l}'::uuid]),10,'{code}',11,'{{\"verification\":\"EXACT_CANONICAL_CREDIT\"}}');",False).returncode
 import json
 evidence=json.dumps({'verification':'EXACT_CANONICAL_CREDIT','transactionHash':tx,'snapshotHash':sql(f"SELECT vault_v2_source_hash(ARRAY['{l}'::uuid]);").stdout.strip(),'contract':contract,'publisher':pub,'codeHash':code,'chainId':677,'blockHash':code,'blockNumber':'10','headNumber':'12','sourceIds':[l],'logs':[{},{}]})
 q=f"SELECT confirm_vault_v2_credit('{batch}','{tx}',vault_v2_source_hash(ARRAY['{l}'::uuid]),10,'{code}',12,'{evidence}');"
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex: out=list(ex.map(lambda _:sql(q).stdout.strip(),range(6)))
 assert out.count('t')==1 and out.count('f')==5,out
 assert sql("SELECT count(*) FROM reward_vault_v2_credit_evidence;").stdout.strip()=='1'
 print('6 concurrent exact confirmations, one credit/audit PASS')
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

finally:
 local('pg_ctl','-D',data,'-m','immediate','stop',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(base,ignore_errors=True)
