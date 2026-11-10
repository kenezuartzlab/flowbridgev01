"""Disposable database identity regression; never reads hosted credentials."""
import pathlib,subprocess,tempfile,pwd,os,concurrent.futures,shutil
base=pathlib.Path(tempfile.mkdtemp(prefix='identity-db-'));data=base/'data';sock=base/'sock';sock.mkdir();port=55479
u=pwd.getpwnam('lovable')
def demote():os.setgroups([]);os.setgid(u.pw_gid);os.setuid(u.pw_uid)
def local(*args):return subprocess.run(list(map(str,args)),preexec_fn=demote,check=True,stdout=subprocess.DEVNULL)
def sql(q,check=True):return subprocess.run(['psql','-X','-h',str(sock),'-p',str(port),'-U','lovable','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',q],capture_output=True,text=True,check=check)
try:
 subprocess.run(['chown','-R','lovable:lovable',str(base)],check=True);base.chmod(0o755)
 local('initdb','-D',data,'-A','trust','--no-locale');local('pg_ctl','-D',data,'-o',f"-F -k {sock} -p {port} -c listen_addresses=''",'-w','start')
 sql("CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE TABLE profiles(id uuid PRIMARY KEY,email text,wallet_address text,created_at timestamptz DEFAULT now(),last_binding_change timestamptz,binding_changes_count int DEFAULT 0);CREATE TABLE app_admins(email text,role text,disabled bool);CREATE TABLE siwe_nonces(id uuid DEFAULT gen_random_uuid(),wallet_address text,nonce text,used_at timestamptz,expires_at timestamptz,created_at timestamptz DEFAULT now());CREATE TABLE admin_audit_events(actor_user_id uuid,actor_email text,actor_role text,object_type text,object_id text,action text,old_value jsonb,new_value jsonb,reason text);CREATE UNIQUE INDEX wallet_ci ON profiles(lower(wallet_address)) WHERE wallet_address IS NOT NULL;")
 sql(pathlib.Path('drizzle/migrations/0059_permanent_identity_and_scoped_recovery.sql').read_text())
 ids=[f'00000000-0000-0000-0000-{i:012}' for i in range(1,12)];wallets=['0x'+str(i)*40 for i in range(1,10)]
 for i,id in enumerate(ids):sql(f"INSERT INTO auth.users VALUES('{id}','u{i}@example.test',now());INSERT INTO profiles(id,email) VALUES('{id}','u{i}@example.test');")
 def bind(id,w,nonce):return sql(f"SELECT bind_verified_identity('{id}','{w}','{nonce}');",False)
 def nonce(n,w):sql(f"INSERT INTO siwe_nonces(wallet_address,nonce,expires_at) VALUES('{w}','{n}',now()+interval '1 hour');")
 nonce('first',wallets[0]);assert bind(ids[0],wallets[0],'first').returncode==0
 assert bind(ids[0],wallets[0],'first').returncode!=0
 nonce('second',wallets[1]);assert bind(ids[0],wallets[1],'second').returncode!=0
 assert sql(f"UPDATE profiles SET wallet_address='{wallets[1]}' WHERE id='{ids[0]}';",False).returncode!=0
 assert sql(f"UPDATE profiles SET email='other@test' WHERE id='{ids[0]}';",False).returncode!=0
 print('First bind, second rejection, nonce replay, privileged direct bypass and immutable email PASS')
 for i in range(1,9):nonce(f'race{i}',wallets[2])
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:r=list(ex.map(lambda i:bind(ids[i],wallets[2],f'race{i}'),range(1,9)))
 assert sum(x.returncode==0 for x in r)==1
 print('8 concurrent competing accounts: exactly one wallet owner PASS')
 sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{ids[9]}';");nonce('unverified',wallets[3]);assert bind(ids[9],wallets[3],'unverified').returncode!=0
 sql("INSERT INTO app_admins VALUES('u0@example.test','super_admin',false);")
 def grant(exp="now()+interval '1 hour'",revoke='false'):
  return sql(f"SELECT set_identity_recovery('{ids[0]}','{wallets[0]}','{ids[0]}','{wallets[4]}','Verified recovery reason','Verified ownership reference',{exp},{revoke});",False)
 assert grant().returncode==0;nonce('recovery',wallets[4]);assert grant(revoke='true').returncode==0;assert bind(ids[0],wallets[4],'recovery').returncode!=0
 assert grant().returncode==0
 sql("UPDATE identity_recovery_grants SET expires_at=now()-interval '1 second';");assert bind(ids[0],wallets[4],'recovery').returncode!=0
 assert grant().returncode==0;nonce('fresh-recovery',wallets[4]);assert bind(ids[0],wallets[4],'fresh-recovery').returncode==0
 assert grant().returncode!=0
 assert sql(f"SELECT original_wallet FROM identity_pairs WHERE user_id='{ids[0]}';").stdout.strip()==wallets[0]
 assert sql("SELECT has_function_privilege('authenticated','bind_verified_identity(uuid,text,text)','EXECUTE');").stdout.strip()=='f'
 assert sql("SELECT has_table_privilege('anon','identity_pairs','SELECT');").stdout.strip()=='f'
 print('Verified email, expiry, revoke, one recovery maximum, original recipient history, RPC/table access PASS')
finally:
 if data.exists():subprocess.run(['pg_ctl','-D',str(data),'-m','immediate','stop'],preexec_fn=demote,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(base,ignore_errors=True)
