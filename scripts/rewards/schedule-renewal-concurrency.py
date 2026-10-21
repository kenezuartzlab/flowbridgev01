"""Disposable loopback database only; no managed connection or financial rows."""
import concurrent.futures, subprocess
CMD=['psql','-X','-h','/tmp/publisher-db','-p','55433','-U','nobody','-d','postgres','-v','ON_ERROR_STOP=1','-Atq']
def q(sql):
 r=subprocess.run(CMD+['-c',sql],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
actor='00000000-0000-0000-0000-000000000001'
batch='00000000-0000-0000-0000-000000000005'
q(f"INSERT INTO reward_settlement_batches(id,chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves) VALUES('{batch}',677,'renewal-fixture',4,'unchanged-root',1122000000000000000000,1,2,'original-fingerprint','[]')")
evidence=q('SELECT reward_payout_evidence_hash()')
renewal=q(f"INSERT INTO reward_schedule_renewals(batch_id,original_fingerprint,fingerprint,claim_start,claim_end,min_publish_delay,evidence_hash) VALUES('{batch}','original-fingerprint','renewed-fingerprint',200000,2792000,86400,'{evidence}') RETURNING id")
def approve(_):
 return q(f"SELECT approve_reward_schedule('{renewal}','{actor}','operator@example.invalid','sender','{evidence}',100000,86400)")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(approve,range(8)))
assert results.count('t')==1 and results.count('f')==7,results
assert q(f"SELECT fingerprint||':'||claim_start||':'||claim_end FROM reward_settlement_batches WHERE id='{batch}'")=='original-fingerprint:1:2'
assert q("SELECT count(*) FROM admin_audit_events WHERE action='SCHEDULE_RENEWAL_APPROVED'")=='1'
print('PASS eight concurrent approvals: one winner, one audit, original fingerprint/window/allocation preserved')