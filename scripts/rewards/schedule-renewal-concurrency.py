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
second=q(f"INSERT INTO reward_schedule_renewals(batch_id,original_fingerprint,previous_fingerprint,fingerprint,claim_start,claim_end,min_publish_delay,evidence_hash) VALUES('{batch}','original-fingerprint','renewed-fingerprint','second-fingerprint',400000,2992000,86400,'{evidence}') RETURNING id")
assert q(f"SELECT approve_reward_schedule('{second}','{actor}','operator@example.invalid','sender','{evidence}',300000,86400)")=='t'
assert q(f"SELECT status FROM reward_schedule_renewals WHERE id='{renewal}'")=='SUPERSEDED'
assert q(f"SELECT fingerprint FROM reward_settlement_batches WHERE id='{batch}'")=='original-fingerprint'
root='0x'+'c'*64
q(f"UPDATE reward_settlement_batches SET root='{root}' WHERE id='{batch}'")
data=q(f"SELECT '0x34b7fe84'||substr(root,3)||reward_uint256_hex(total_wei)||lpad(to_hex(400000::bigint),64,'0')||lpad(to_hex(2992000::bigint),64,'0') FROM reward_settlement_batches WHERE id='{batch}'")
def must_fail(sql):
 r=subprocess.run(CMD+['-c',sql],capture_output=True,text=True)
 assert r.returncode!=0,r.stdout
must_fail(f"SELECT acquire_reviewed_reward_publication('{batch}','{actor}','sender',42,'{data}',100,'renewed-fingerprint')")
must_fail(f"SELECT acquire_reviewed_reward_publication('{batch}','{actor}','sender',42,'0x1234',100,'second-fingerprint')")
op=q(f"SELECT acquire_reviewed_reward_publication('{batch}','{actor}','sender',42,'{data}',100,'second-fingerprint')")
attempt=q(f"SELECT id FROM reward_publish_attempts WHERE batch_id='{batch}'")
q("UPDATE app_admins SET disabled=true")
hash='0x'+'d'*64;block='0x'+'e'*64
def confirm(_):return q(f"SELECT reconcile_reward_publication('{attempt}','{op}','{hash}','{block}',101)")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:confirmed=list(pool.map(confirm,range(8)))
assert confirmed.count('t')==1 and confirmed.count('f')==7,confirmed
assert q(f"SELECT count(*) FROM admin_audit_events WHERE action='PUBLISH_CONFIRMED_VERIFIED' AND actor_role='system' AND actor_user_id IS NULL AND new_value->>'operationId'='{op}'")=='1'
assert q(f"SELECT fingerprint||':'||claim_start||':'||claim_end FROM reward_settlement_batches WHERE id='{batch}'")=='original-fingerprint:1:2'
print('PASS repeat renewal, stale fingerprint/calldata rejection and eight interrupted-session confirmations: one system audit even with disabled original operator')