CREATE TABLE public.reward_vault_v2_identity_approvals(id bigserial PRIMARY KEY, contract_address text NOT NULL CHECK(contract_address ~ '^0x[0-9a-f]{40}$'), owner text NOT NULL CHECK(owner ~ '^0x[0-9a-f]{40}$'), publisher text NOT NULL CHECK(publisher ~ '^0x[0-9a-f]{40}$' AND publisher<>owner), batch_cap_wei numeric(78,0) NOT NULL CHECK(batch_cap_wei>0), daily_cap_wei numeric(78,0) NOT NULL CHECK(daily_cap_wei>=batch_cap_wei), evidence jsonb NOT NULL, actor_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.reward_vault_v2_identity_approvals TO service_role;
GRANT USAGE ON SEQUENCE public.reward_vault_v2_identity_approvals_id_seq TO service_role;
ALTER TABLE public.reward_vault_v2_identity_approvals ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.guard_vault_identity_approvals() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'identity approvals are append-only'; END $$;
CREATE TRIGGER vault_identity_approvals_append_only BEFORE UPDATE OR DELETE ON public.reward_vault_v2_identity_approvals FOR EACH ROW EXECUTE FUNCTION public.guard_vault_identity_approvals();

CREATE OR REPLACE FUNCTION public.guard_vault_cutover_config() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.cutover_accepted THEN RAISE EXCEPTION 'cutover history immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.cutover_accepted THEN
  IF coalesce(current_setting('flowbridge.vault_settings_sync',true),'')='on' THEN
   IF (to_jsonb(NEW)-ARRAY['financial_enabled','updated_at','publisher','batch_cap_wei','daily_cap_wei']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['financial_enabled','updated_at','publisher','batch_cap_wei','daily_cap_wei']) THEN RAISE EXCEPTION 'only verified publisher/limits may change'; END IF;
  ELSIF (to_jsonb(NEW)-ARRAY['financial_enabled','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['financial_enabled','updated_at']) THEN RAISE EXCEPTION 'accepted cutover identity immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_vault_v2_cutover(p_actor uuid,p_wallet text,p_cutover timestamptz,p_contract text,p_code text,p_publisher text,p_batch_cap numeric,p_daily_cap numeric,p_evidence jsonb,p_state_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; email text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT p.email INTO email FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) WHERE p.id=p_actor AND lower(p.wallet_address)=lower(p_wallet) AND a.role='super_admin' AND NOT coalesce(a.disabled,false);
 IF email IS NULL THEN RAISE EXCEPTION 'authorized bound super admin required'; END IF;
 SELECT * INTO c FROM reward_vault_v2_config WHERE id FOR UPDATE;
 IF c.cutover_accepted THEN RAISE EXCEPTION 'cutover is immutable'; END IF;
 IF p_cutover IS NULL OR p_cutover<=now() OR p_state_hash IS DISTINCT FROM reward_payout_evidence_hash() OR coalesce(p_contract,'') !~ '^0x[0-9a-f]{40}$' OR p_contract='0x0000000000000000000000000000000000000000' OR coalesce(p_code,'') !~ '^0x[0-9a-f]{64}$' OR coalesce(p_publisher,'') !~ '^0x[0-9a-f]{40}$' OR p_publisher=lower(p_wallet) OR p_batch_cap IS NULL OR p_batch_cap<=0 OR p_daily_cap IS NULL OR p_daily_cap<p_batch_cap THEN RAISE EXCEPTION 'future cutover and verified authorized deployment required'; END IF;
 IF coalesce(p_evidence->>'verification','') NOT IN ('VERIFIED_MAINNET_DEPLOYMENT','FROZEN_RUNTIME_CANONICAL_TOKEN_APPROVED_SAFE','FROZEN_RUNTIME_CANONICAL_TOKEN_OWNER_EOA_EXCEPTION','FROZEN_RUNTIME_CANONICAL_TOKEN_APPROVED_OWNER') OR p_evidence->>'codeHash' IS DISTINCT FROM p_code OR p_evidence->>'contract' IS DISTINCT FROM p_contract OR p_evidence->>'publisher' IS DISTINCT FROM p_publisher OR coalesce(p_evidence->>'chainId','')<>'677' OR coalesce((p_evidence->>'freeWei')::numeric,0)<=0 OR (p_evidence->>'batchCapWei')::numeric IS DISTINCT FROM p_batch_cap OR (p_evidence->>'dailyCapWei')::numeric IS DISTINCT FROM p_daily_cap THEN RAISE EXCEPTION 'canonical deployment evidence required'; END IF;
 IF EXISTS(SELECT 1 FROM reward_publish_attempts WHERE phase<>'CONFIRMED_VERIFIED' AND NOT retry_safe) THEN RAISE EXCEPTION 'unresolved legacy publication'; END IF;
 INSERT INTO reward_vault_v2_config(id,financial_enabled,cutover_accepted,authorized_by,publisher,batch_cap_wei,daily_cap_wei,deployment_verified,contract_address,code_hash,cutover_at,cutover_evidence) VALUES(true,true,true,p_actor,p_publisher,p_batch_cap,p_daily_cap,true,p_contract,p_code,p_cutover,p_evidence) ON CONFLICT(id) DO UPDATE SET financial_enabled=true,cutover_accepted=true,authorized_by=p_actor,publisher=p_publisher,batch_cap_wei=p_batch_cap,daily_cap_wei=p_daily_cap,deployment_verified=true,contract_address=p_contract,code_hash=p_code,cutover_at=p_cutover,cutover_evidence=p_evidence;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,email,'super_admin','reward_vault_v2','cutover','FUTURE_NEW_AWARDS_CUTOVER_AUTHORIZED',jsonb_build_object('cutoverAt',p_cutover,'evidence',p_evidence,'legacyStateHash',p_state_hash));
 RETURN true;
END $$;

CREATE FUNCTION public.sync_vault_v2_settings(p_actor uuid,p_wallet text,p_contract text,p_owner text,p_publisher text,p_batch_cap numeric,p_daily_cap numeric,p_evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; email text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT p.email INTO email FROM profiles p JOIN app_admins a ON lower(a.email)=lower(p.email) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) WHERE p.id=p_actor AND lower(p.wallet_address)=lower(p_wallet) AND a.role='super_admin' AND NOT coalesce(a.disabled,false);
 IF email IS NULL THEN RAISE EXCEPTION 'authorized bound super admin required'; END IF;
 IF coalesce(p_evidence->>'contract','') IS DISTINCT FROM p_contract OR coalesce(p_evidence->>'owner','') IS DISTINCT FROM p_owner OR coalesce(p_evidence->>'publisher','') IS DISTINCT FROM p_publisher OR (p_evidence->>'batchCapWei')::numeric IS DISTINCT FROM p_batch_cap OR (p_evidence->>'dailyCapWei')::numeric IS DISTINCT FROM p_daily_cap OR coalesce(p_evidence->>'chainId','')<>'677' THEN RAISE EXCEPTION 'settings must equal live on-chain evidence'; END IF;
 SELECT * INTO c FROM reward_vault_v2_config WHERE id FOR UPDATE;
 IF c.contract_address IS NOT NULL AND c.contract_address<>p_contract THEN RAISE EXCEPTION 'registered vault address cannot change'; END IF;
 IF c.publisher IS DISTINCT FROM p_publisher AND (EXISTS(SELECT 1 FROM reward_vault_v2_batches WHERE state<>'CREDITED') OR EXISTS(SELECT 1 FROM reward_vault_v2_signing_attempts WHERE phase NOT IN ('CONFIRMED','CANCELLED','REVERTED','CREDITED'))) THEN RAISE EXCEPTION 'resolve open batches before changing publisher'; END IF;
 INSERT INTO reward_vault_v2_identity_approvals(contract_address,owner,publisher,batch_cap_wei,daily_cap_wei,evidence,actor_user_id) VALUES(p_contract,p_owner,p_publisher,p_batch_cap,p_daily_cap,p_evidence,p_actor);
 IF c.cutover_accepted THEN
  PERFORM set_config('flowbridge.vault_settings_sync','on',true);
  UPDATE reward_vault_v2_config SET publisher=p_publisher,batch_cap_wei=p_batch_cap,daily_cap_wei=p_daily_cap WHERE id;
  PERFORM set_config('flowbridge.vault_settings_sync','off',true);
 END IF;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,old_value,new_value) VALUES(p_actor,email,'super_admin','reward_vault_v2',p_contract,'VAULT_SETTINGS_SYNCED_FROM_CHAIN',jsonb_build_object('publisher',c.publisher,'batchCapWei',c.batch_cap_wei,'dailyCapWei',c.daily_cap_wei),p_evidence);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.sync_vault_v2_settings(uuid,text,text,text,text,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_vault_v2_settings(uuid,text,text,text,text,numeric,numeric,jsonb) TO service_role;