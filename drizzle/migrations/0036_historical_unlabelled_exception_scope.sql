DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='reward_exception_evidence';
 IF position('l.program_id IS DISTINCT FROM ''CORE_SWAP''' in d)=0 THEN RAISE EXCEPTION 'Expected historical scope guard missing'; END IF;
 d:=replace(d,'l.program_id IS DISTINCT FROM ''CORE_SWAP''','(l.program_id IS NOT NULL AND l.program_id<>''CORE_SWAP'')');
 EXECUTE d;
END $$;