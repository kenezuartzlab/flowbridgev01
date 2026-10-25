DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='assert_publication_provenance';
 IF position('l.provenance_state=''VERIFIED''' in d)=0 THEN RAISE EXCEPTION 'Expected publication provenance guard missing'; END IF;
 d:=replace(d,'l.provenance_state=''VERIFIED''','(l.provenance_state=''VERIFIED'' OR (l.provenance_state=''EXCEPTION_APPROVED'' AND EXISTS(SELECT 1 FROM public.reward_evidence_reviews er WHERE er.ledger_id=l.id AND er.points=l.points AND er.status=''APPROVED'' AND er.policy_id=''HISTORICAL_PRICING_EXCEPTION_V1'' AND er.decided_by IS NOT NULL AND er.decided_at IS NOT NULL AND er.decided_by<>er.proposed_by AND lower(er.decided_by_email)<>lower(er.proposed_by_email))))');
 EXECUTE d;
END $$;