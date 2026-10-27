"""Isolated PostgreSQL acceptance only. Never reads production credentials."""
import subprocess,concurrent.futures,json,uuid
CMD=['psql','-X','-h','/tmp/rewards-isolated-socket','-p','55439','-U','postgres','-v','ON_ERROR_STOP=1','-Atq']
def q(sql):
 r=subprocess.run(CMD+['-c',sql],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
a=str(uuid.uuid4())
q(f"insert into profiles values('{a}','operator@local.invalid','admin'); insert into app_admins values('operator@local.invalid','super_admin',false); update reward_auto_approval_config set enabled=true,acceptance_confirmed=true,policy_revision=2,updated_by='{a}'; insert into reward_budgets values('SIGNUP_BONUS',1000000,1000000,'ACTIVE',true);")
def user(points=100):
 u,l,r=[str(uuid.uuid4()) for _ in range(3)];w='0x'+uuid.uuid4().hex+'a'*8
 q(f"insert into profiles values('{u}',null,'{w}'); insert into flow_points_ledger values('{l}','{u}',{points},'SIGNUP_BONUS','{r}','{w}','FUNDED'); insert into reward_reservations values('{r}','{l}','{u}',{points},'SIGNUP_BONUS','{w}');")
 return u,w
def call(u,w,n=100,back=100,fence='local-test-fence',at='now()'):
 return json.loads(q(f"select auto_approve_funded_payout('{u}','{w}',{n},{n},{n},0,'{{\"SIGNUP_BONUS\":{n}}}','{{}}','hash',{back},{at},'{fence}');"))
x=user();
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:call(*x),range(8)))
assert sum(r.get('ok') is True for r in results)==1,results
assert q('select sum(points) from reward_payout_approvals')=='100'
print('PASS eight simultaneous repeated jobs: one approval, one commitment')
q('delete from reward_payout_approvals;')
users=[user() for _ in range(8)]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda x:call(*x,back=300),users))
assert sum(r.get('ok') is True for r in results)==3,results
assert q('select sum(points) from reward_payout_approvals')=='300'
print('PASS eight simultaneous users: backing never exceeds 300 FLOW')
q('delete from reward_payout_approvals;')
x=user();assert call(*x,fence='stale')['reason']=='BACKING_UNAVAILABLE'
assert call(*x,at="now()-interval '60 seconds'")['reason']=='BACKING_UNAVAILABLE'
assert call(x[0],'wrong')['reason']=='WALLET_CHANGED'
q('update reward_auto_approval_config set suspended=true;');assert call(*x)['reason']=='AUTOMATION_OFF'
q('update reward_auto_approval_config set suspended=false;')
print('PASS stale evidence, stale RPC observations, wallet change and suspension fail closed')
u,w=user();q(f"insert into reward_settlement_batches(chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves,publication_verified_at) values(677,'local',3,'root',100000000000000000000,1,2,'fp','[{{\"account\":\"{w}\",\"amount\":\"100000000000000000000\"}}]',now());")
assert call(u,w)['reason']=='INVALID_AMOUNT'
print('PASS published/claimed entitlement cannot enter a new payout')
x=user(1);assert call(*x,n=1,back=1)['ok'] is True
print('PASS one positive FLOW Point with zero extra configured budget')
q('delete from reward_payout_approvals;')
x=user();q(f"insert into reward_payout_approvals(user_id,wallet,points,available_points,funded_points,already_settled_points,evidence,evidence_hash,proposed_by,proposed_by_email,status,confirmed_at,settlement_batch_id) values('{uuid.uuid4()}','other',499950,499950,499950,0,'{{}}','h','{a}','local','CONFIRMED',now(),'{uuid.uuid4()}');")
assert call(*x,back=1000)['reason']=='DAILY_BUDGET_EXHAUSTED'
print('PASS existing 500000 FLOW rolling-day cap')
q('delete from reward_payout_approvals;')
b=str(uuid.uuid4());root='0xe2af18b23c702ddf6d0bd32e717ca4f8a997deb0dbf4f3df508096d8be2065a5'
leaves=json.dumps([{'account':'local','amount':'1'}]*12)
q(f"insert into reward_settlement_batches(id,chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves) values('{b}',677,'local',4,'{root}',1190000000000000000000,1,2,'old-fingerprint','{leaves}');")
assert q(f"select retire_unapproved_reward_draft('{b}',extract(epoch from now())::bigint,86400,3)")=='t'
assert q(f"select retire_unapproved_reward_draft('{b}',extract(epoch from now())::bigint,86400,3)")=='f'
assert q(f"select count(*) from reward_settlement_batches where id='{b}' and root='{root}' and total_wei=1190000000000000000000")=='1'
try:q(f"insert into reward_publish_attempts values('{b}','AWAITING_WALLET',false)")
except RuntimeError as e:assert 'retired unapproved draft' in str(e)
else:raise AssertionError('retired draft publication was allowed')
print('PASS audited retirement once, original allocation preserved, publication blocked')
# Fresh authorized batches: one identity per epoch; stale roots cannot overlap.
u,w=user(25);assert call(u,w,n=25,back=25)['ok'] is True
root2='0x'+'a'*64;leaf=json.dumps([{'index':0,'account':w,'amount':str(25*10**18),'proof':[]}])
def prepare(root=root2):
 return q(f"select persist_funded_reward_batch(5,'{root}',25000000000000000000,extract(epoch from now())::bigint+90000,extract(epoch from now())::bigint+2682000,'fresh','{leaf}','[]','local-test-fence')")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: ids=list(pool.map(lambda _:prepare(),range(8)))
assert len(set(ids))==1,ids
try:prepare('0x'+'b'*64)
except RuntimeError as e:assert 'active batch already exists' in str(e)
else:raise AssertionError('overlapping batch created')
print('PASS concurrent batch preparation produces one identity; different root cannot overlap')
batch=ids[0]
q(f"update reward_settlement_batches set claim_start=1,claim_end=2592001 where id='{batch}'")
refresh=q(f"select refresh_funded_batch_schedule('{batch}',extract(epoch from now())::bigint+90000,extract(epoch from now())::bigint+2682000,'renewed',extract(epoch from now())::bigint,86400,'local-test-fence')")
assert refresh=='t'
assert q(f"select count(*) from reward_schedule_renewals where batch_id='{batch}' and status='APPROVED'")=='1'
assert q(f"select root from reward_settlement_batches where id='{batch}'")==root2
print('PASS expired approved batch renews under master policy; original root and schedule remain immutable')
