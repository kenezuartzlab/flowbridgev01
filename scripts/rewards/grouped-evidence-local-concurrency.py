#!/usr/bin/env python3
"""Disposable local PostgreSQL behavioral test for migrations 0033, 0036, 0037, 0038."""
import pathlib, subprocess, tempfile, secrets, shutil, os, concurrent.futures, pwd
P=pathlib.Path('/dev-server/drizzle/migrations')
M=[P/'0033_historical_valuation_review_safeguards.sql',P/'0036_historical_unlabelled_exception_scope.sql',P/'0037_atomic_grouped_reward_evidence_review.sql',P/'0038_enforce_group_only_evidence_decisions.sql']
assert all(x.is_file() for x in M)
assert os.geteuid()==0, 'Run as root to use local OS user lovable'
for x in ('initdb','pg_ctl','psql'): assert shutil.which(x), f'missing {x}'
base=pathlib.Path(tempfile.mkdtemp(prefix='group-review-')); data=base/'data'; sock=base/'sock'; sock.mkdir(); port=secrets.randbelow(14000)+44000
U='lovable'
def demote():
 u=pwd.getpwnam(U); os.setgroups([]); os.setgid(u.pw_gid); os.setuid(u.pw_uid)
def runuser(*a, check=True, **kw): return subprocess.run(list(map(str,a)),preexec_fn=demote,check=check,**kw)
def sql(q,check=True): return subprocess.run(['psql','-X','-h',str(sock),'-p',str(port),'-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],capture_output=True,text=True,check=check)
fixture=r'''
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE profiles(id uuid primary key,email text,wallet_address text);
CREATE TABLE app_admins(email text,role text,disabled boolean default false);
CREATE TABLE admin_audit_events(actor_user_id uuid,actor_email text,actor_role text,object_type text,object_id text,action text,old_value jsonb,new_value jsonb,reason text);
CREATE TABLE verified_activities(activity_id uuid primary key,source_chain_id int,source_tx_hash text,source_log_index int,user_wallet text,status text,kind text,evidence_source text,amount_raw text,occurred_at timestamptz,token text);
CREATE TABLE reservations(reservation_id uuid primary key,ledger_id uuid,user_id uuid,wallet_address text,points int,program_id text);
CREATE TABLE reward_reservations(reservation_id uuid primary key,ledger_id uuid,user_id uuid,wallet_address text,points int,program_id text);
CREATE TABLE flow_points_ledger(id uuid primary key,user_id uuid,wallet_address text,reason text,points int,chain_id int,provenance_state text,tx_hash text,verified_activity_id uuid,source_log_index int,verified_usd numeric,base_points int,policy_version text,created_at timestamptz,day_key text,program_id text,funding_state text,reservation_id uuid);
'''
# First 21 lines define the reviewed table and indexes/grants/RLS; use only its table declaration.
review=(P/'0031_reward_evidence_exception_review.sql').read_text().splitlines()[:21]
review_sql='\n'.join(review)
try:
 subprocess.run(['chown','-R',f'{U}:{U}',str(base)],check=True); base.chmod(0o755)
 runuser('initdb','-D',data,'-A','trust','--no-locale',stdout=subprocess.DEVNULL)
 runuser('pg_ctl','-D',data,'-o',f"-F -k {sock} -p {port} -c listen_addresses=''",'-w','start',stdout=subprocess.DEVNULL)
 # Database role lovable for socket connections; local cluster superuser is OS role.
 # initdb already creates the local superuser matching OS user lovable
 sql(fixture+review_sql)
 for m in M:
  r=subprocess.run(['psql','-X','-h',str(sock),'-p',str(port),'-U',U,'-d','postgres','-v','ON_ERROR_STOP=1','-f',str(m)],capture_output=True,text=True)
  if r.returncode: raise RuntimeError(f'{m.name}: {r.stderr}')
 print('MIGRATIONS_APPLIED:',', '.join(x.name for x in M))
 # Users, eight distinct supervisors and a non-super proposer.
 proposer='10000000-0000-4000-8000-000000000001'; wallet='0xfake000000000000000000000000000000000001'
 for i in range(1,10):
  actor=f'20000000-0000-4000-8000-{i:012d}'
  sql(f"INSERT INTO profiles VALUES('{actor}','admin{i}@test','{wallet}'); INSERT INTO app_admins(email,role) VALUES('admin{i}@test','super_admin');")
 sql(f"INSERT INTO profiles VALUES('{proposer}','proposal@test','{wallet}'); INSERT INTO app_admins(email,role) VALUES('proposal@test','admin');")
 ids=[]
 for i in range(9):
  lid=f'30000000-0000-4000-8000-{i+1:012d}'; aid=f'40000000-0000-4000-8000-{i+1:012d}'; tx=f'0x{i+1:064x}'; day=f'2026-08-{21+i:02d}'
  ids.append(lid); pts=118 if i==0 else 113; rid=f'60000000-0000-4000-8000-{i+1:012d}'
  sql(f"INSERT INTO verified_activities VALUES('{aid}',677,'{tx}',{i},'{wallet}','CONFIRMED','SWAP_EXECUTED','ROUTER_V3_RECEIPT','1000000000000000000','{day} 16:00:00+00','T'); INSERT INTO flow_points_ledger VALUES('{lid}','{proposer}','{wallet}','CORE_SWAP',{pts},677,'PENDING','{tx}','{aid}',{i},{pts},{pts},'FLOW_POINTS_V2','2026-08-21 16:00:00+00','{day}','CORE_SWAP','FUNDED','{rid}'); INSERT INTO reward_reservations VALUES('{rid}','{lid}','{proposer}','{wallet}',{pts},'CORE_SWAP');")
 idlist='ARRAY['+','.join("'"+x+"'::uuid" for x in ids)+']'
 group=sql(f"SELECT propose_reward_evidence_group({idlist},'{proposer}','proposal@test','Historical source unavailable','Historical valuation cannot be reproduced for this set.');").stdout.strip()
 assert sql(f"SELECT count(*) FROM reward_evidence_reviews WHERE group_id='{group}' AND status='PROPOSED';").stdout.strip()=='9'
 assert sql(f"SELECT points FROM reward_evidence_groups WHERE id='{group}';").stdout.strip()=='1022'
 print('GROUP_PROPOSAL: PASS group='+group+' child_records=9')
 # Proposer and non-super forbidden; direct child approval blocked by 0038.
 def fails(q):
  r=sql(q,False); return r.returncode!=0
 assert fails(f"SELECT decide_reward_evidence_group('{group}','{proposer}','proposal@test','APPROVED','approve');")
 sql("UPDATE app_admins SET role='internal_operator' WHERE email='admin9@test'"); assert fails(f"SELECT decide_reward_evidence_group('{group}','20000000-0000-4000-8000-000000000009','admin9@test','APPROVED','approve');")
 sql("UPDATE app_admins SET role='super_admin' WHERE email='proposal@test'"); assert fails(f"SELECT decide_reward_evidence_group('{group}','{proposer}','proposal@test','APPROVED','approve');")
 child=sql(f"SELECT id FROM reward_evidence_reviews WHERE group_id='{group}' LIMIT 1;").stdout.strip()
 assert fails(f"SELECT decide_reward_evidence_exception('{child}','20000000-0000-4000-8000-000000000001','admin1@test','APPROVED','direct');")
 print('INDEPENDENCE_AND_CHILD_BLOCK: PASS')
 # Concurrency separate super-admin sessions; serialize around group lock.
 def decide(i):
  actor=f'20000000-0000-4000-8000-{i:012d}'
  return sql(f"SELECT decide_reward_evidence_group('{group}','{actor}','admin{i}@test','APPROVED','group approval');").stdout.strip()
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: results=list(ex.map(decide,range(1,9)))
 assert results.count('APPROVED')==1 and results.count('ALREADY_APPROVED')==7,results
 assert sql(f"SELECT count(*) FROM admin_audit_events WHERE object_type='reward_evidence_group' AND object_id='{group}' AND action='GROUP_APPROVED';").stdout.strip()=='1'
 assert sql(f"SELECT count(*) FROM flow_points_ledger WHERE id=ANY({idlist}) AND provenance_state='EXCEPTION_APPROVED';").stdout.strip()=='9'
 assert sql("SELECT count(*) FROM reward_reservations r JOIN flow_points_ledger l ON l.reservation_id=r.reservation_id WHERE r.points=l.points AND l.funding_state='FUNDED';").stdout.strip()=='9'
 assert sql("SELECT sum(points) FROM reward_reservations").stdout.strip()=='1022'
 print('CONCURRENT_APPROVALS:',results)
 print('ONE_GROUP_AUDIT_AND_RESERVATIONS_UNCHANGED: PASS')
 sql("TRUNCATE reward_evidence_reviews,reward_evidence_groups; UPDATE flow_points_ledger SET provenance_state='PENDING';")
 # stale evidence after proposing: update confirmed activity source timestamp, approval must fail and leave all child rows pending.
 g2=sql(f"SELECT propose_reward_evidence_group({idlist[:0]+'ARRAY['+','.join(chr(39)+x+chr(39)+'::uuid' for x in ids[:2])+']'},'{proposer}','proposal@test','Historical source unavailable','Another valid long rationale for stale record test.');").stdout.strip()
 stale=ids[0]; sql(f"UPDATE verified_activities SET token='CHANGED' WHERE activity_id=(SELECT verified_activity_id FROM flow_points_ledger WHERE id='{stale}');")
 assert fails(f"SELECT decide_reward_evidence_group('{g2}','20000000-0000-4000-8000-000000000001','admin1@test','APPROVED','stale test');")
 assert sql(f"SELECT status FROM reward_evidence_groups WHERE id='{g2}';").stdout.strip()=='PROPOSED'
 assert sql(f"SELECT count(*) FROM reward_evidence_reviews WHERE group_id='{g2}' AND status='PROPOSED';").stdout.strip()=='2'
 print('STALE_EVIDENCE_ATOMIC_ROLLBACK: PASS')
 # Invalid policy group rollback and duplicate block.
 g3=sql(f"SELECT propose_reward_evidence_group(ARRAY['{ids[2]}'::uuid],'{proposer}','proposal@test','Historical source unavailable','Valid rationale for invalid policy rollback test.');").stdout.strip()
 sql(f"UPDATE reward_evidence_groups SET policy_id='BAD' WHERE id='{g3}';")
 assert fails(f"SELECT decide_reward_evidence_group('{g3}','20000000-0000-4000-8000-000000000002','admin2@test','APPROVED','bad policy');")
 before=sql('SELECT count(*) FROM reward_evidence_groups;').stdout.strip()
 # duplicate fake award is detected against same transaction before proposing.
 dup='50000000-0000-4000-8000-000000000001'; sql(f"INSERT INTO flow_points_ledger SELECT '{dup}',user_id,wallet_address,reason,1,chain_id,'PENDING',tx_hash,verified_activity_id,source_log_index,verified_usd,base_points,policy_version,created_at,day_key,program_id,'UNFUNDED',NULL FROM flow_points_ledger WHERE id='{ids[3]}';")
 assert fails(f"SELECT propose_reward_evidence_group(ARRAY['{ids[3]}'::uuid],'{proposer}','proposal@test','Historical source unavailable','Valid rationale duplicate transaction test.');")
 assert sql('SELECT count(*) FROM reward_evidence_groups;').stdout.strip()==before
 policy_before=sql('SELECT count(*) FROM reward_evidence_groups;').stdout.strip()
 sql(f"UPDATE flow_points_ledger SET policy_version='INVALID' WHERE id='{ids[5]}';")
 assert fails(f"SELECT propose_reward_evidence_group(ARRAY['{ids[4]}'::uuid,'{ids[5]}'::uuid],'{proposer}','proposal@test','Historical source unavailable','Valid rationale invalid policy rollback test.');")
 assert sql('SELECT count(*) FROM reward_evidence_groups;').stdout.strip()==policy_before
 assert sql(f"SELECT count(*) FROM reward_evidence_reviews WHERE ledger_id='{ids[4]}';").stdout.strip()=='0'
 assert sql('SELECT sum(points) FROM reward_reservations').stdout.strip()=='1022'
 print('INVALID_POLICY_AND_DUPLICATE: PASS atomic proposal rollback, reservations preserved')
finally:
 runuser('pg_ctl','-D',str(data),'-m','immediate','stop',check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(base,ignore_errors=True)
