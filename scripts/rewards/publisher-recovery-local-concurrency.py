"""Disposable /tmp/publisher-db only: load exact migrations and synthetic fixture first. Never managed PG variables."""
import subprocess,concurrent.futures
cmd=['psql','-X','-h','/tmp/publisher-db','-p','55433','-U','nobody','-d','postgres','-v','ON_ERROR_STOP=1','-Atq']
def q(sql,fail=False):
 r=subprocess.run(cmd+['-c',sql],capture_output=True,text=True)
 if fail: assert r.returncode!=0; return ''
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
a='00000000-0000-0000-0000-000000000001';b='00000000-0000-0000-0000-000000000004'
def acquire(_):
 try:return q(f"SELECT acquire_reward_publication('{b}','{a}','sender',42,'0x1234',100)")
 except RuntimeError:return None
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:ops=list(pool.map(acquire,range(8)))
assert len([x for x in ops if x])==1,ops
op=next(x for x in ops if x); attempt=q('SELECT id FROM reward_publish_attempts')
def transition(phase,hash='NULL',safe=False,operation=op):return q(f"SELECT transition_reward_publication('{attempt}','{operation}','{a}','{phase}',{hash},{str(safe).lower()})")
assert transition('CANCELLED',safe=True)=='t'
assert transition('CANCELLED',safe=True)=='f'
q(f"SELECT acquire_reward_publication('{b}','{a}','sender',43,'0x1234',100)",True)
q(f"SELECT acquire_reward_publication('{b}','{a}','sender',42,'0x5678',100)",True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:ops=list(pool.map(acquire,range(8)))
assert len([x for x in ops if x])==1,ops
newop=next(x for x in ops if x)
q(f"SELECT transition_reward_publication('{attempt}','{op}','{a}','CANCELLED',NULL,true)",True)
h="'0x"+'a'*64+"'"
assert transition('CONFIRMING',h,operation=newop)=='t'
q(f"SELECT transition_reward_publication('{attempt}','{newop}','{a}','CANCELLED',{h},true)",True)
assert transition('BROADCAST_PENDING',h,operation=newop)=='t'
assert all(x is None for x in map(acquire,range(8)))
assert transition('REVERTED',h,True,newop)=='t'
assert acquire(0)
q(f"UPDATE reward_settlement_batches SET publication_verified_at=now() WHERE id='{b}'")
assert acquire(0) is None
assert q("SELECT count(*) FROM admin_audit_events WHERE action='PUBLISH_CANCELLED'")=='1'
print('PASS: eight initial/retry acquires produce one winner; stale generation rejected; pending locked; cancellation audit idempotent; exact revert permits retry; published batch immutable.')
