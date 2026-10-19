CREATE OR REPLACE FUNCTION public.transition_reward_publication(p_attempt uuid,p_operation uuid,p_actor uuid,p_phase text,p_hash text DEFAULT NULL,p_retry_safe boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; r text;
BEGIN
 SELECT * INTO a FROM public.reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.operation_id<>p_operation OR a.operator_id<>p_actor THEN RAISE EXCEPTION 'operation ownership mismatch'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' THEN RETURN false; END IF;
 IF p_phase NOT IN ('CANCELLED','BROADCAST_PENDING','CONFIRMING','REVERTED','RECOVERY_REQUIRED','CONFIRMED_MISMATCH') THEN RAISE EXCEPTION 'invalid phase'; END IF;
 IF a.retry_safe THEN RETURN false; END IF;
 IF a.tx_hash IS NOT NULL AND p_hash IS DISTINCT FROM a.tx_hash THEN RAISE EXCEPTION 'original hash required'; END IF;
 IF p_hash IS NOT NULL AND p_hash !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid hash'; END IF;
 IF p_retry_safe AND NOT ((p_phase='CANCELLED' AND a.tx_hash IS NULL AND p_hash IS NULL) OR (p_phase='REVERTED' AND p_hash IS NOT NULL)) THEN RAISE EXCEPTION 'unsafe release'; END IF;
 IF a.phase=p_phase AND a.tx_hash IS NOT DISTINCT FROM p_hash AND a.retry_safe=p_retry_safe THEN RETURN false; END IF;
 SELECT role INTO r FROM public.app_admins WHERE email=(SELECT email FROM public.profiles WHERE id=p_actor) AND NOT disabled;
 IF r IS NULL THEN RAISE EXCEPTION 'authorized operator required'; END IF;
 UPDATE public.reward_publish_attempts SET phase=p_phase,tx_hash=coalesce(tx_hash,p_hash),retry_safe=p_retry_safe,updated_at=now() WHERE id=a.id;
 INSERT INTO public.admin_audit_events(actor_user_id,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,r,'reward_round','677:'||a.epoch_id,'PUBLISH_'||p_phase,jsonb_build_object('operationId',p_operation,'txHash',p_hash,'retrySafe',p_retry_safe),'authorized fenced recovery');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.transition_reward_publication(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_reward_publication(uuid,uuid,uuid,text,text,boolean) TO service_role;