DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='decide_reward_evidence_exception';
 IF position('IF r.proposed_by=p_actor' in d)=0 THEN RAISE EXCEPTION 'Expected independent decision guard missing'; END IF;
 d:=replace(d,'IF r.proposed_by=p_actor','IF r.group_id IS NOT NULL AND current_setting(''flowbridge.evidence_group'',true) IS DISTINCT FROM r.group_id::text THEN RAISE EXCEPTION ''Grouped reviews require one atomic group decision''; END IF; IF r.proposed_by=p_actor');
 EXECUTE d;
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='decide_reward_evidence_group';
 IF position('FOR r IN SELECT * FROM reward_evidence_reviews' in d)=0 THEN RAISE EXCEPTION 'Expected atomic group decision missing'; END IF;
 d:=replace(d,'FOR r IN SELECT * FROM reward_evidence_reviews','PERFORM set_config(''flowbridge.evidence_group'',g.id::text,true); FOR r IN SELECT * FROM reward_evidence_reviews');
 EXECUTE d;
END $$;