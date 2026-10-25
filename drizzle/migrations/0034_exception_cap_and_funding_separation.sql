DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='reward_v366_insert_guard';
 IF position('provenance_state=''VERIFIED''' in d)=0 THEN RAISE EXCEPTION 'Expected daily cap guard not found'; END IF;
 d:=replace(d,'provenance_state=''VERIFIED''','provenance_state IN (''VERIFIED'',''EXCEPTION_APPROVED'')'); EXECUTE d;
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='confirm_reward_funding_snapshot';
 IF position('IF s.status <> ''APPROVED''' in d)=0 THEN RAISE EXCEPTION 'Expected confirmation guard not found'; END IF;
 d:=replace(d,'IF s.status <> ''APPROVED''','IF s.approved_by IS NULL OR s.approved_by=s.proposed_by OR lower(s.approved_by_email)=lower(s.proposed_by_email) OR NOT EXISTS(SELECT 1 FROM public.app_admins WHERE email=lower(s.approved_by_email) AND role=''super_admin'' AND NOT disabled) THEN RAISE EXCEPTION ''Independent current super admin approval required''; END IF; IF s.status <> ''APPROVED'''); EXECUTE d;
END $$;