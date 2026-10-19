import subprocess,concurrent.futures
cmd=['psql','-X','-h','/tmp/publisher-local-pg','-p','55432','-U','supabase-postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq']
def query(sql):
 r=subprocess.run(cmd+['-c',sql],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
query("INSERT INTO reward_settlement_batches(id,chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves) VALUES('00000000-0000-0000-0000-000000000004',677,'local-concurrency',99997,'root',1,1,2,'fingerprint','[]');")
def lock(_):
 sql="INSERT INTO reward_publish_attempts(batch_id,distributor,epoch_id,root,fingerprint,operator_id,tx_hash) VALUES('00000000-0000-0000-0000-000000000004','local-concurrency',99997,'root','fingerprint','00000000-0000-0000-0000-000000000001','hash-local-99997') ON CONFLICT(chain_id,distributor,epoch_id) DO NOTHING RETURNING id;"
 return query(sql)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:r=list(pool.map(lock,range(8)))
assert len([x for x in r if x])==1,r
attempt=[x for x in r if x][0]
def confirm(_):return query("SELECT confirm_reward_publication('"+attempt+"','hash-local-99997','block',10,'00000000-0000-0000-0000-000000000001','test@example.invalid','super_admin');")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:r=list(pool.map(confirm,range(8)))
assert r.count('t')==1 and r.count('f')==7,r
assert query("SELECT count(*) FROM admin_audit_events WHERE object_id='677:99997'")=='1'
print('PASS: 8 concurrent attempts yield one lock; 8 concurrent confirmations yield one confirmation and one audit.')
