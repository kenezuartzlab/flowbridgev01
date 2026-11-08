DO $migration$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.legacy_carryover_state_hash()'::regprocedure) INTO def;
def:=replace(def,'jsonb_build_array(', 'jsonb_build_array(');
def:=replace(def,'(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),''[]'') FROM flow_points_ledger l)', '(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY referrer_id,referee_id,milestone),''[]'') FROM referral_milestone_awards m),(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),''[]'') FROM flow_points_ledger l)');
EXECUTE def;
SELECT pg_get_functiondef('public.legacy_carryover_preview()'::regprocedure) INTO def;
def:=replace(def,'state:=legacy_carryover_state_hash();','IF EXISTS(SELECT 1 FROM reward_settlement_batches b CROSS JOIN LATERAL jsonb_array_elements(b.leaves) x WHERE b.chain_id=677 AND mod((x->>''amount'')::numeric,1e18)<>0) THEN RAISE EXCEPTION ''fractional V1 commitment cannot be rounded''; END IF; state:=legacy_carryover_state_hash();');
EXECUTE def;
SELECT pg_get_functiondef('public.confirm_legacy_carryover(uuid,text,bigint,bigint,uuid,text,numeric,jsonb,timestamptz)'::regprocedure) INTO def;
def:=replace(def,'LOCK TABLE flow_points_ledger,profiles,','LOCK TABLE referral_milestone_awards,verified_activities,reward_evidence_reviews,flow_points_ledger,profiles,');
def:=replace(def,'preview:=legacy_carryover_preview();','IF p_evidence->''v1''->>''chainId'' IS DISTINCT FROM ''677'' OR coalesce(p_evidence->''v1''->>''blockHash'','''') !~ ''^0x[0-9a-f]{64}$'' OR jsonb_typeof(p_evidence->''v1''->''epochs'') IS DISTINCT FROM ''array'' OR jsonb_array_length(p_evidence->''v1''->''epochs'') IS DISTINCT FROM (p_evidence->''v1''->>''epochCount'')::integer THEN RAISE EXCEPTION ''complete canonical V1 round evidence required''; END IF; IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence->''v1''->''epochs'') e WHERE NOT EXISTS(SELECT 1 FROM reward_settlement_batches b WHERE b.chain_id=677 AND b.epoch_id=(e->>''id'')::integer AND b.root=e->>''root'' AND b.total_wei=(e->>''allocation'')::numeric)) THEN RAISE EXCEPTION ''V1 commitment evidence changed''; END IF; preview:=legacy_carryover_preview();');
EXECUTE def;
END $migration$;