CREATE TABLE public.reward_evidence_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_id text NOT NULL DEFAULT 'HISTORICAL_PRICING_EXCEPTION_V1',
 status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','REJECTED')),
 ledger_ids uuid[] NOT NULL, points bigint NOT NULL CHECK(points>0), rationale text NOT NULL, uncertainty text NOT NULL,
 proposed_by uuid NOT NULL, proposed_by_email text NOT NULL, decided_by uuid, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_evidence_groups TO service_role;
ALTER TABLE public.reward_evidence_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_evidence_reviews ADD COLUMN group_id uuid REFERENCES public.reward_evidence_groups(id);
CREATE INDEX reward_evidence_reviews_group_idx ON public.reward_evidence_reviews(group_id);
CREATE OR REPLACE FUNCTION public.propose_reward_evidence_group(p_ids uuid[],p_actor uuid,p_email text,p_uncertainty text,p_rationale text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lid uuid; rid uuid; gid uuid; total bigint:=0; evidence jsonb; condition text; current_condition text;
BEGIN
 IF cardinality(p_ids) IS NULL OR cardinality(p_ids)<1 OR cardinality(p_ids)>50 OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION 'Select 1–50 distinct records'; END IF;
 -- Stable day-lock ordering across overlapping groups and ordinary award writers.
 FOR condition IN SELECT DISTINCT 'reward-day:'||lower(wallet_address)||':'||day_key FROM flow_points_ledger WHERE id=ANY(p_ids) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(condition,0));
 END LOOP;
 condition:=NULL;
 FOR lid IN SELECT x FROM unnest(p_ids) x ORDER BY x LOOP
  evidence:=public.reward_exception_evidence(lid);
  current_condition:=(evidence->>'policyVersion')||'|'||(evidence->>'evidenceSource')||'|ORIGINAL_VALUATION_NOT_REPRODUCIBLE';
  IF condition IS NOT NULL AND condition<>current_condition THEN RAISE EXCEPTION 'One shared historical valuation condition required'; END IF;
  condition:=current_condition; total:=total+(evidence->>'points')::bigint;
 END LOOP;
 INSERT INTO reward_evidence_groups(ledger_ids,points,rationale,uncertainty,proposed_by,proposed_by_email) VALUES(p_ids,total,trim(p_rationale),trim(p_uncertainty),p_actor,lower(p_email)) RETURNING id INTO gid;
 FOR lid IN SELECT x FROM unnest(p_ids) x ORDER BY x LOOP
  rid:=public.propose_reward_evidence_exception(lid,p_actor,p_email,jsonb_build_object('policy','HISTORICAL_PRICING_EXCEPTION_V1','sourceUnavailable',true,'groupId',gid),p_uncertainty,p_rationale);
  UPDATE reward_evidence_reviews SET group_id=gid WHERE id=rid;
 END LOOP;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,lower(p_email),'operator','reward_evidence_group',gid::text,'GROUP_PROPOSED',jsonb_build_object('records',cardinality(p_ids),'points',total,'policy','HISTORICAL_PRICING_EXCEPTION_V1'));
 RETURN gid;
END $$;
CREATE OR REPLACE FUNCTION public.decide_reward_evidence_group(p_group uuid,p_actor uuid,p_email text,p_decision text,p_note text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g reward_evidence_groups%ROWTYPE; r reward_evidence_reviews%ROWTYPE; outcome text; daylock text;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_admins WHERE email=lower(p_email) AND role='super_admin' AND NOT disabled) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'Current super admin required'; END IF;
 SELECT * INTO g FROM reward_evidence_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Group not found'; END IF;
 IF g.proposed_by=p_actor OR lower(g.proposed_by_email)=lower(p_email) THEN RAISE EXCEPTION 'A different approver is required'; END IF;
 IF g.status=p_decision THEN RETURN 'ALREADY_'||p_decision; END IF;
 IF g.status<>'PROPOSED' OR g.policy_id<>'HISTORICAL_PRICING_EXCEPTION_V1' THEN RAISE EXCEPTION 'Group is not an open approved-policy proposal'; END IF;
 IF (SELECT count(*) FROM reward_evidence_reviews WHERE group_id=g.id AND status='PROPOSED')<>cardinality(g.ledger_ids) OR EXISTS(SELECT 1 FROM reward_evidence_reviews WHERE group_id=g.id AND (NOT ledger_id=ANY(g.ledger_ids) OR proposed_by<>g.proposed_by)) OR (SELECT coalesce(sum(points),0) FROM reward_evidence_reviews WHERE group_id=g.id)<>g.points THEN RAISE EXCEPTION 'Group membership changed'; END IF;
 FOR daylock IN SELECT DISTINCT 'reward-day:'||lower(wallet_address)||':'||day_key FROM flow_points_ledger WHERE id=ANY(g.ledger_ids) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(daylock,0));
 END LOOP;
 FOR r IN SELECT * FROM reward_evidence_reviews WHERE group_id=g.id ORDER BY ledger_id LOOP
  outcome:=public.decide_reward_evidence_exception(r.id,p_actor,p_email,p_decision,p_note);
  IF outcome<>p_decision THEN RAISE EXCEPTION 'Group evidence changed'; END IF;
 END LOOP;
 UPDATE reward_evidence_groups SET status=p_decision,decided_by=p_actor,decided_at=now() WHERE id=g.id;
 INSERT INTO admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value) VALUES(p_actor,lower(p_email),'super_admin','reward_evidence_group',g.id::text,'GROUP_'||p_decision,jsonb_build_object('records',cardinality(g.ledger_ids),'points',g.points,'reservationsUnchanged',true));
 RETURN p_decision;
END $$;
REVOKE ALL ON FUNCTION public.propose_reward_evidence_group(uuid[],uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.decide_reward_evidence_group(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.propose_reward_evidence_group(uuid[],uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_reward_evidence_group(uuid,uuid,text,text,text) TO service_role;