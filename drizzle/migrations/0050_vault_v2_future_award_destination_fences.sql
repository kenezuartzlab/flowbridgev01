ALTER TABLE public.reward_vault_v2_config ADD COLUMN financial_enabled boolean NOT NULL DEFAULT false, ADD COLUMN cutover_accepted boolean NOT NULL DEFAULT false, ADD COLUMN authorized_by uuid, ADD COLUMN publisher text, ADD COLUMN batch_cap_wei numeric(78,0) NOT NULL DEFAULT 0, ADD COLUMN daily_cap_wei numeric(78,0) NOT NULL DEFAULT 0, ADD COLUMN deployment_verified boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.reward_vault_v2_config.enabled IS 'DEPRECATED: original hard-disabled preview flag; financial_enabled is the separately authorized runtime gate.';
CREATE TABLE public.reward_award_destinations (ledger_id uuid PRIMARY KEY REFERENCES public.flow_points_ledger(id),economic_award_id text NOT NULL UNIQUE,destination text NOT NULL CHECK(destination IN ('LEGACY','VAULT_V2')),cutover_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.reward_award_destinations TO service_role;
ALTER TABLE public.reward_award_destinations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.route_new_reward_award() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; economic text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 SELECT * INTO c FROM reward_vault_v2_config WHERE id=true;
 IF c IS NULL OR NOT c.cutover_accepted OR c.cutover_at IS NULL OR NEW.created_at<=c.cutover_at OR NEW.points<=0 THEN RETURN NEW; END IF;
 IF NEW.program_id='CORE_SWAP' AND NEW.chain_id=677 AND NEW.reason IN ('CORE_SWAP','CORE_SWAP_V2') AND NEW.policy_version='FLOW_POINTS_V2' AND NEW.tx_hash IS NOT NULL AND NEW.source_log_index IS NOT NULL THEN economic:='677:swap:'||lower(NEW.tx_hash)||':'||NEW.source_log_index;
 ELSIF (NEW.chain_id IS NULL OR NEW.chain_id=677) AND NEW.program_id='SIGNUP_BONUS' AND NEW.policy_version='FUNDED_SIGNUP_BONUS_V1' AND NEW.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') THEN economic:=NEW.activity_key;
 ELSE RETURN NEW; END IF;
 IF economic IS NULL OR economic='' THEN RAISE EXCEPTION 'canonical economic ID missing'; END IF;
 INSERT INTO reward_award_destinations(ledger_id,economic_award_id,destination,cutover_at) VALUES(NEW.id,economic,'VAULT_V2',c.cutover_at);
 RETURN NEW;
END $$;
CREATE TRIGGER route_new_reward_award AFTER INSERT ON public.flow_points_ledger FOR EACH ROW EXECUTE FUNCTION public.route_new_reward_award();
CREATE FUNCTION public.guard_reward_destination() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='reward_award_destinations' THEN RAISE EXCEPTION 'reward destination immutable'; END IF;
 IF NEW.destination='VAULT_V2' AND NOT EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=NEW.ledger_id AND d.economic_award_id=NEW.economic_award_id AND d.destination='VAULT_V2') THEN RAISE EXCEPTION 'V2 destination missing'; END IF;
 IF NEW.destination='LEGACY' AND EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=NEW.ledger_id AND d.destination='VAULT_V2') THEN RAISE EXCEPTION 'award fenced to V2'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_reward_destination BEFORE INSERT ON public.reward_economic_award_allocations FOR EACH ROW EXECUTE FUNCTION public.guard_reward_destination();
CREATE FUNCTION public.guard_legacy_reward_destination() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c reward_vault_v2_config; w text; funded numeric; settled numeric; required numeric; leaf jsonb;
BEGIN
 SELECT * INTO c FROM reward_vault_v2_config WHERE id=true;
 IF c IS NULL OR NOT c.cutover_accepted THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='reward_publish_attempts' THEN
 IF EXISTS(SELECT 1 FROM reward_settlement_batches WHERE id=NEW.batch_id AND created_at<=c.cutover_at) THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME<>'reward_publish_attempts' AND (to_jsonb(NEW)->>'created_at')::timestamptz<=c.cutover_at THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
 IF TG_TABLE_NAME='reward_payout_approvals' THEN
  IF NEW.status NOT IN ('PROPOSED','APPROVED','CONFIRMED') OR (TG_OP='UPDATE' AND NEW.settlement_batch_id IS NOT NULL) THEN RETURN NEW; END IF;
  w:=lower(NEW.wallet);required:=NEW.points;
  SELECT coalesce(sum((x->>'amount')::numeric/1e18),0) INTO settled FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND b.publication_verified_at IS NOT NULL AND lower(x->>'account')=w;
  SELECT coalesce(sum(l.points),0) INTO funded FROM flow_points_ledger l JOIN reward_reservations r ON r.ledger_id=l.id AND r.reservation_id=l.reservation_id AND r.points=l.points AND r.user_id=l.user_id AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.funding_verified AND b.status='ACTIVE' AND b.reserved_points<=b.total_points WHERE lower(l.wallet_address)=w AND l.funding_state='FUNDED' AND l.points>0 AND NOT EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=l.id AND d.destination='VAULT_V2');
  IF required>funded-settled THEN RAISE EXCEPTION 'V1 amount includes V2-fenced awards'; END IF;
 ELSE
  IF TG_TABLE_NAME='reward_publish_attempts' THEN SELECT leaves INTO leaf FROM reward_settlement_batches WHERE id=NEW.batch_id; ELSE leaf:=NEW.leaves; END IF;
  FOR w,required IN SELECT lower(x->>'account'),(x->>'amount')::numeric/1e18 FROM jsonb_array_elements(leaf) x LOOP
   SELECT coalesce(sum(l.points),0) INTO funded FROM flow_points_ledger l JOIN reward_reservations r ON r.ledger_id=l.id AND r.reservation_id=l.reservation_id AND r.points=l.points AND r.user_id=l.user_id AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.funding_verified AND b.status='ACTIVE' AND b.reserved_points<=b.total_points WHERE lower(l.wallet_address)=w AND l.funding_state='FUNDED' AND l.points>0 AND NOT EXISTS(SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id=l.id AND d.destination='VAULT_V2');
   SELECT coalesce(sum((x->>'amount')::numeric/1e18),0) INTO settled FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND b.publication_verified_at IS NOT NULL AND lower(x->>'account')=w AND b.id IS DISTINCT FROM CASE WHEN TG_TABLE_NAME='reward_publish_attempts' THEN (to_jsonb(NEW)->>'batch_id')::uuid ELSE (to_jsonb(NEW)->>'id')::uuid END;
   IF required>funded-settled THEN RAISE EXCEPTION 'V1 batch includes V2-fenced awards'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_approval_destination BEFORE INSERT OR UPDATE ON public.reward_payout_approvals FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_reward_destination();
CREATE TRIGGER legacy_batch_destination BEFORE INSERT ON public.reward_settlement_batches FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_reward_destination();
CREATE TRIGGER legacy_publish_destination BEFORE INSERT OR UPDATE ON public.reward_publish_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_reward_destination();
CREATE FUNCTION public.vault_v2_source_rows() RETURNS TABLE(id uuid,economic_award_id text,wallet text,points integer,program_id text,destination text,created_at timestamptz,policy_version text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,d.economic_award_id,lower(l.wallet_address),l.points,l.program_id,d.destination,l.created_at,l.policy_version FROM flow_points_ledger l JOIN reward_award_destinations d ON d.ledger_id=l.id AND d.destination='VAULT_V2' JOIN profiles p ON p.id=l.user_id AND lower(p.wallet_address)=lower(l.wallet_address) JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<now()) JOIN reward_reservations r ON r.reservation_id=l.reservation_id AND r.ledger_id=l.id AND r.user_id=l.user_id AND r.points=l.points AND r.program_id=l.program_id AND lower(r.wallet_address)=lower(l.wallet_address) JOIN reward_budgets b ON b.program_id=l.program_id AND b.status='ACTIVE' AND b.funding_verified AND b.reserved_points<=b.total_points JOIN reward_vault_v2_config c ON c.id AND c.cutover_accepted AND l.created_at>c.cutover_at
 WHERE l.points>0 AND l.funding_state='FUNDED' AND lower(l.wallet_address) ~ '^0x[0-9a-f]{40}$' AND lower(l.wallet_address)<>'0x0000000000000000000000000000000000000000' AND NOT EXISTS(SELECT 1 FROM reward_economic_award_allocations a WHERE a.ledger_id=l.id OR a.economic_award_id=d.economic_award_id)
 AND ((l.program_id='CORE_SWAP' AND l.policy_version='FLOW_POINTS_V2' AND l.chain_id=677 AND l.provenance_state='VERIFIED' AND l.verified_usd>=5 AND l.points<=floor(l.verified_usd) AND l.points<=1000 AND EXISTS(SELECT 1 FROM verified_activities v WHERE v.activity_id=l.verified_activity_id AND v.status='CONFIRMED' AND v.source_chain_id=677 AND lower(v.source_tx_hash)=lower(l.tx_hash) AND v.source_log_index=l.source_log_index AND lower(v.user_wallet)=lower(l.wallet_address))) OR (l.program_id='SIGNUP_BONUS' AND l.policy_version='FUNDED_SIGNUP_BONUS_V1' AND l.points=100 AND (l.chain_id IS NULL OR l.chain_id=677) AND l.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') AND EXISTS(SELECT 1 FROM flow_points_ledger q JOIN profiles qp ON qp.id=q.user_id JOIN auth.users qu ON qu.id=q.user_id AND qu.email_confirmed_at IS NOT NULL AND (qu.banned_until IS NULL OR qu.banned_until<now()) WHERE q.reason='SIGNUP_BONUS_REFEREE' AND q.policy_version='FUNDED_SIGNUP_BONUS_V1' AND q.points=100 AND qp.created_at>='2026-10-04T01:00:00Z' AND lower(qp.wallet_address)=lower(q.wallet_address) AND q.user_id=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN l.user_id ELSE (l.metadata->>'refereeId')::uuid END AND l.activity_key=CASE WHEN l.reason='SIGNUP_BONUS_REFEREE' THEN 'signup:'||q.user_id::text ELSE 'signup-ref:'||q.user_id::text END AND (SELECT count(*) FROM flow_points_ledger z WHERE z.reason='SIGNUP_BONUS_REFEREE' AND lower(z.wallet_address)=lower(q.wallet_address))=1)))
 ORDER BY l.id LIMIT 1000
$$;
REVOKE ALL ON FUNCTION public.vault_v2_source_rows() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vault_v2_source_rows() TO service_role;
CREATE FUNCTION public.vault_v2_source_hash(p_ids uuid[]) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(to_jsonb(l),d.economic_award_id) ORDER BY l.id),'[]')::text,'UTF8')),'hex') FROM flow_points_ledger l JOIN reward_award_destinations d ON d.ledger_id=l.id WHERE l.id=ANY(p_ids) $$;
REVOKE ALL ON FUNCTION public.vault_v2_source_hash(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vault_v2_source_hash(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.route_new_reward_award(),public.guard_reward_destination(),public.guard_legacy_reward_destination() FROM PUBLIC,anon,authenticated;