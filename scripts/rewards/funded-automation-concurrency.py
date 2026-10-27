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
