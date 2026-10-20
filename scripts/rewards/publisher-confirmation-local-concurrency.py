import concurrent.futures,subprocess
cmd=['psql','-X','-h','/tmp/publisher-db','-p','55433','-U','nobody','-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
def q(sql):
 r=subprocess.run(cmd+['-c',sql],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
a='00000000-0000-0000-0000-000000000001';b='00000000-0000-0000-0000-000000000005';h='0x'+'b'*64
q(f"INSERT INTO reward_settlement_batches(id,chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves) VALUES('{b}',677,'confirm-local',4,'root',1122000000000000000000,1,2,'f','[]');")
op=q(f"SELECT acquire_reward_publication('{b}','{a}','sender',42,'0x1234',100)");attempt=q(f"SELECT id FROM reward_publish_attempts WHERE batch_id='{b}'")
q(f"SELECT transition_reward_publication('{attempt}','{op}','{a}','RECOVERY_REQUIRED',NULL,false)")
q(f"SELECT transition_reward_publication('{attempt}','{op}','{a}','CONFIRMING','{h}',false)")
def confirm(_):return q(f"SELECT confirm_reward_publication('{attempt}','{h}','block',101,'{a}','test@example.invalid','super_admin')")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:r=list(pool.map(confirm,range(8)))
assert r.count('t')==1 and r.count('f')==7,r
assert q("SELECT count(*) FROM admin_audit_events WHERE object_id='677:4' AND action='PUBLISH_CONFIRMED_VERIFIED'")=='1'
assert q(f"SELECT phase FROM reward_publish_attempts WHERE id='{attempt}'")=='CONFIRMED_VERIFIED'
print('PASS recovered hash: eight confirmations -> one confirmation, one confirmed audit, immutable published batch')
