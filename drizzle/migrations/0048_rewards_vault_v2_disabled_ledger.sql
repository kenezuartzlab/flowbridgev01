CREATE TABLE public.reward_vault_v2_config (id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false CHECK (NOT enabled), chain_id integer NOT NULL DEFAULT 677 CHECK(chain_id=677), contract_address text, code_hash text, cutover_at timestamptz, cutover_evidence jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.reward_vault_v2_config TO authenticated;
GRANT ALL ON public.reward_vault_v2_config TO service_role;
ALTER TABLE public.reward_vault_v2_config ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.reward_vault_v2_config IS 'V2 release is hard disabled. Separate audited financial authorization and cross-system reconciliation required before a later activation migration.';
CREATE TABLE public.reward_vault_v2_batches (batch_id text PRIMARY KEY CHECK(batch_id ~ '^0x[0-9a-f]{64}$'), snapshot_hash text NOT NULL, contract_address text NOT NULL, publisher text NOT NULL, source_ids uuid[] NOT NULL, wallets text[] NOT NULL, amounts_wei text[] NOT NULL, total_wei numeric(78,0) NOT NULL CHECK(total_wei>0), state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN ('RESERVED','SUBMITTED','CREDITED','REVERTED')), tx_hash text UNIQUE, receipt_block bigint, receipt_block_hash text, created_at timestamptz NOT NULL DEFAULT now(), CHECK(cardinality(wallets) BETWEEN 1 AND 100), CHECK(cardinality(wallets)=cardinality(amounts_wei)));
GRANT ALL ON public.reward_vault_v2_batches TO service_role;
ALTER TABLE public.reward_vault_v2_batches ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.reward_economic_award_allocations (ledger_id uuid PRIMARY KEY REFERENCES public.flow_points_ledger(id), economic_award_id text NOT NULL UNIQUE, user_id uuid NOT NULL, wallet text NOT NULL, program_id text NOT NULL, points integer NOT NULL CHECK(points>0), destination text NOT NULL CHECK(destination IN ('LEGACY','VAULT_V2')), vault_batch_id text REFERENCES public.reward_vault_v2_batches(batch_id), legacy_evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(), CHECK ((destination='VAULT_V2' AND vault_batch_id IS NOT NULL) OR (destination='LEGACY' AND legacy_evidence IS NOT NULL)));
GRANT ALL ON public.reward_economic_award_allocations TO service_role;
ALTER TABLE public.reward_economic_award_allocations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.guard_vault_v2_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Vault allocation history is immutable'; END IF;
 IF TG_TABLE_NAME='reward_economic_award_allocations' THEN RAISE EXCEPTION 'Award allocation is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','tx_hash','receipt_block','receipt_block_hash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','tx_hash','receipt_block','receipt_block_hash']) THEN RAISE EXCEPTION 'Batch snapshot is immutable'; END IF;
 IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN RAISE EXCEPTION 'Submitted transaction identity is immutable'; END IF;
 IF OLD.state='CREDITED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Credited batch is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER vault_v2_batch_immutable BEFORE UPDATE OR DELETE ON public.reward_vault_v2_batches FOR EACH ROW EXECUTE FUNCTION public.guard_vault_v2_snapshot();
CREATE TRIGGER vault_v2_award_immutable BEFORE UPDATE OR DELETE ON public.reward_economic_award_allocations FOR EACH ROW EXECUTE FUNCTION public.guard_vault_v2_snapshot();
CREATE FUNCTION public.reserve_vault_v2_awards(p_batch_id text,p_snapshot_hash text,p_ids uuid[],p_contract text,p_publisher text,p_wallets text[],p_amounts text[],p_total numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.reward_vault_v2_config; l public.flow_points_ledger; r public.reward_reservations; b public.reward_budgets; prof public.profiles; total_points bigint:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reward-economic-allocation-v2'));
 SELECT * INTO cfg FROM public.reward_vault_v2_config WHERE id=true FOR UPDATE;
 IF NOT FOUND OR NOT cfg.enabled OR cfg.cutover_at IS NULL OR cfg.cutover_evidence IS NULL OR cfg.contract_address IS DISTINCT FROM p_contract OR cfg.code_hash IS NULL THEN RAISE EXCEPTION 'VAULT_V2_DISABLED_OR_UNRECONCILED'; END IF;
 IF cardinality(p_ids)=0 OR cardinality(p_ids)>1000 OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION 'Invalid award IDs'; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_vault_v2_batches WHERE batch_id=p_batch_id) THEN RAISE EXCEPTION 'Batch already reserved'; END IF;
 FOR l IN SELECT * FROM public.flow_points_ledger WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE LOOP
 SELECT * INTO r FROM public.reward_reservations WHERE ledger_id=l.id;
 SELECT * INTO b FROM public.reward_budgets WHERE program_id=l.program_id FOR UPDATE;
 SELECT * INTO prof FROM public.profiles WHERE id=l.user_id;
 IF l.created_at<cfg.cutover_at OR l.funding_state<>'FUNDED' OR l.points<=0 OR NOT coalesce(b.funding_verified,false) OR b.status<>'ACTIVE' OR l.program_id NOT IN ('SIGNUP_BONUS','CORE_SWAP','REFERRAL_MILESTONE') OR r.reservation_id IS DISTINCT FROM l.reservation_id OR r.points IS DISTINCT FROM l.points OR r.user_id IS DISTINCT FROM l.user_id OR r.program_id IS DISTINCT FROM l.program_id OR lower(r.wallet_address) IS DISTINCT FROM lower(l.wallet_address) OR lower(prof.wallet_address) IS DISTINCT FROM lower(l.wallet_address) OR l.wallet_address IS NULL THEN RAISE EXCEPTION 'Award funding or binding invalid'; END IF;
 IF l.program_id='CORE_SWAP' AND (l.chain_id IS DISTINCT FROM 677 OR l.provenance_state<>'VERIFIED' OR l.verified_activity_id IS NULL) THEN RAISE EXCEPTION 'Swap provenance invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_economic_award_allocations WHERE ledger_id=l.id OR economic_award_id=coalesce(l.activity_key,l.id::text)) THEN RAISE EXCEPTION 'Award already allocated'; END IF;
 total_points:=total_points+l.points;
 END LOOP;
 IF (SELECT count(*) FROM public.flow_points_ledger WHERE id=ANY(p_ids))<>cardinality(p_ids) OR p_total<>total_points*1000000000000000000::numeric THEN RAISE EXCEPTION 'Snapshot total mismatch'; END IF;
 INSERT INTO public.reward_vault_v2_batches(batch_id,snapshot_hash,contract_address,publisher,source_ids,wallets,amounts_wei,total_wei) VALUES(p_batch_id,p_snapshot_hash,p_contract,p_publisher,p_ids,p_wallets,p_amounts,p_total);
 INSERT INTO public.reward_economic_award_allocations(ledger_id,economic_award_id,user_id,wallet,program_id,points,destination,vault_batch_id) SELECT id,coalesce(activity_key,id::text),user_id,lower(wallet_address),program_id,points,'VAULT_V2',p_batch_id FROM public.flow_points_ledger WHERE id=ANY(p_ids);
END $$;
REVOKE ALL ON FUNCTION public.reserve_vault_v2_awards(text,text,uuid[],text,text,text[],text[],numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_vault_v2_awards(text,text,uuid[],text,text,text[],text[],numeric) TO service_role;
COMMENT ON FUNCTION public.reserve_vault_v2_awards(text,text,uuid[],text,text,text[],text[],numeric) IS 'Hard-disabled staging RPC. Activation requires canonical reconciliation plus legacy publication fences; never call from client or enable by settings.';