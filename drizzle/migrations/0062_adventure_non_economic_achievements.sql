CREATE TABLE public.adventure_config (id boolean PRIMARY KEY DEFAULT true CHECK(id), preview_enabled boolean NOT NULL DEFAULT false, cooldown_seconds integer NOT NULL DEFAULT 60 CHECK(cooldown_seconds BETWEEN 30 AND 3600), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.adventure_config TO service_role;
ALTER TABLE public.adventure_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_config FROM anon, authenticated;
CREATE TABLE public.adventure_completions (user_id uuid NOT NULL, quest_id text NOT NULL, period_id text NOT NULL, evidence_key text NOT NULL, chain_id bigint, tx_hash text, event_index integer, completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,quest_id,period_id), UNIQUE(quest_id,evidence_key), CHECK(quest_id IN ('email','binding','basics','ecosystem','safety','swap','referral','campaign','daily_badge','weekly_badge')));
GRANT ALL ON public.adventure_completions TO service_role;
ALTER TABLE public.adventure_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_completions FROM anon, authenticated;
CREATE UNIQUE INDEX adventure_transaction_once ON public.adventure_completions(chain_id,lower(tx_hash),event_index) WHERE tx_hash IS NOT NULL;
CREATE TABLE public.adventure_quiz_challenges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, topic text NOT NULL CHECK(topic IN ('basics','ecosystem','safety')), period_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz);
GRANT ALL ON public.adventure_quiz_challenges TO service_role;
ALTER TABLE public.adventure_quiz_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_quiz_challenges FROM anon, authenticated;
CREATE FUNCTION public.adventure_assert_preview(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT coalesce((SELECT preview_enabled FROM public.adventure_config WHERE id),false) THEN RAISE EXCEPTION 'Adventure preview is paused'; END IF;
IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.app_admins a ON lower(a.email)=lower(u.email) WHERE u.id=p_user AND u.email_confirmed_at IS NOT NULL AND a.role='super_admin' AND NOT a.disabled) THEN RAISE EXCEPTION 'Adventure remains restricted to approved preview accounts'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.adventure_assert_preview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adventure_assert_preview(uuid) TO service_role;
CREATE FUNCTION public.adventure_quiz(p_user uuid,p_topic text,p_challenge uuid DEFAULT NULL,p_answers jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.adventure_quiz_challenges; d text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'); expected jsonb; seconds integer; BEGIN
PERFORM public.adventure_assert_preview(p_user); PERFORM pg_advisory_xact_lock(hashtextextended('adventure:'||p_user::text,0));
IF p_topic NOT IN ('basics','ecosystem','safety') THEN RAISE EXCEPTION 'Unknown quiz'; END IF;
IF EXISTS(SELECT 1 FROM public.adventure_completions WHERE user_id=p_user AND quest_id=p_topic AND period_id=d) THEN RETURN jsonb_build_object('complete',true); END IF;
IF p_challenge IS NULL THEN
seconds:=coalesce((SELECT cooldown_seconds FROM public.adventure_config WHERE id),60);
IF EXISTS(SELECT 1 FROM public.adventure_quiz_challenges WHERE user_id=p_user AND created_at>now()-make_interval(secs=>seconds)) THEN RAISE EXCEPTION 'Wait before starting another quiz'; END IF;
INSERT INTO public.adventure_quiz_challenges(user_id,topic,period_id) VALUES(p_user,p_topic,d) RETURNING * INTO c; RETURN jsonb_build_object('challenge',c.id,'period',d);
END IF;
SELECT * INTO c FROM public.adventure_quiz_challenges WHERE id=p_challenge AND user_id=p_user AND topic=p_topic FOR UPDATE;
IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.period_id<>d OR c.created_at<now()-interval '10 minutes' OR c.created_at>now()-interval '5 seconds' THEN RAISE EXCEPTION 'Quiz expired, reused or submitted too quickly'; END IF;
UPDATE public.adventure_quiz_challenges SET consumed_at=now() WHERE id=c.id;
expected:=CASE p_topic WHEN 'basics' THEN '[1,0,2]'::jsonb WHEN 'ecosystem' THEN '[2,1,0]'::jsonb ELSE '[0,2,1]'::jsonb END;
IF p_answers IS DISTINCT FROM expected THEN RETURN jsonb_build_object('complete',false,'message','Review the lesson and try again after the cooldown.'); END IF;
INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,p_topic,d,c.id::text) ON CONFLICT DO NOTHING;
RETURN jsonb_build_object('complete',true); END $$;
REVOKE ALL ON FUNCTION public.adventure_quiz(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adventure_quiz(uuid,text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.adventure_sync(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'); w text:=to_char(date_trunc('week',now() AT TIME ZONE 'UTC'),'YYYY-MM-DD'); pair public.identity_pairs; a record; r record; n integer; BEGIN
PERFORM public.adventure_assert_preview(p_user); PERFORM pg_advisory_xact_lock(hashtextextended('adventure:'||p_user::text,0));
SELECT * INTO pair FROM public.identity_pairs WHERE user_id=p_user;
IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL AND email IS NOT NULL) THEN
INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'email','once',p_user::text) ON CONFLICT DO NOTHING;
END IF;
IF pair.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL AND lower(email)=pair.email) AND NOT EXISTS(SELECT 1 FROM public.identity_review_cases WHERE user_id=p_user) THEN
INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'binding','once',p_user::text) ON CONFLICT DO NOTHING;
SELECT v.* INTO a FROM public.verified_activities v JOIN public.flow_points_ledger l ON l.activity_id=v.activity_id AND l.user_id=p_user AND l.reward_type='CORE_SWAP' AND l.points>0 WHERE lower(v.user_wallet)=pair.original_wallet AND v.kind='SWAP_EXECUTED' AND v.status='CONFIRMED' AND v.source_chain_id=677 AND v.evidence_source='ROUTER_V4_SWAP_ACTIVITY' AND v.occurred_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND v.occurred_at<=now() AND NOT EXISTS(SELECT 1 FROM public.adventure_completions c WHERE c.evidence_key=v.activity_id) ORDER BY v.occurred_at LIMIT 1;
IF FOUND THEN INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key,chain_id,tx_hash,event_index) VALUES(p_user,'swap',d,a.activity_id,677,lower(a.source_tx_hash),a.source_log_index) ON CONFLICT DO NOTHING; END IF;
FOR r IN SELECT ra.user_id,ra.attributed_at FROM public.referral_attributions ra JOIN public.identity_pairs ip ON ip.user_id=ra.user_id JOIN auth.users u ON u.id=ip.user_id WHERE ra.referrer_id=p_user AND ra.user_id<>p_user AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=ip.email AND ip.email<>pair.email AND ip.original_wallet<>pair.original_wallet AND NOT EXISTS(SELECT 1 FROM public.identity_review_cases WHERE user_id=ip.user_id) AND EXISTS(SELECT 1 FROM public.referral_milestone_awards m WHERE m.referrer_id=p_user AND m.referee_id=ra.user_id) AND ra.attributed_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND ra.attributed_at<=now() LOOP
INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'referral',d,r.user_id::text) ON CONFLICT DO NOTHING; EXIT; END LOOP;
SELECT cc.completion_id INTO r FROM public.campaign_completions cc JOIN public.campaign_tasks ct ON ct.task_id=cc.task_id AND ct.campaign_id=cc.campaign_id JOIN public.campaigns ca ON ca.campaign_id=cc.campaign_id WHERE lower(cc.user_wallet)=pair.original_wallet AND ca.review_state='published' AND ct.rules->>'type'='VERIFIED_ACTIVITY' AND cc.completed_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND cc.completed_at<=now() ORDER BY cc.completed_at LIMIT 1;
IF FOUND THEN INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'campaign',d,r.completion_id) ON CONFLICT DO NOTHING; END IF;
END IF;
SELECT count(DISTINCT quest_id) INTO n FROM public.adventure_completions WHERE user_id=p_user AND quest_id NOT IN ('daily_badge','weekly_badge') AND completed_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
IF n>=3 THEN INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'daily_badge',d,p_user::text||':'||d) ON CONFLICT DO NOTHING; END IF;
SELECT count(DISTINCT quest_id) INTO n FROM public.adventure_completions WHERE user_id=p_user AND quest_id NOT IN ('daily_badge','weekly_badge') AND completed_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
IF n>=5 THEN INSERT INTO public.adventure_completions(user_id,quest_id,period_id,evidence_key) VALUES(p_user,'weekly_badge',w,p_user::text||':'||w) ON CONFLICT DO NOTHING; END IF;
RETURN jsonb_build_object('day',d,'week',w,'now',now(),'completions',coalesce((SELECT jsonb_agg(x ORDER BY x.completed_at DESC) FROM (SELECT quest_id,period_id,completed_at FROM public.adventure_completions WHERE user_id=p_user ORDER BY completed_at DESC LIMIT 250) x),'[]'::jsonb)); END $$;
REVOKE ALL ON FUNCTION public.adventure_sync(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adventure_sync(uuid) TO service_role;
CREATE FUNCTION public.adventure_preview_setting(p_actor uuid,p_wallet text,p_enabled boolean,p_cooldown integer,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.app_admins a ON lower(a.email)=lower(u.email) JOIN public.identity_pairs i ON i.user_id=u.id WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND a.role='super_admin' AND NOT a.disabled AND i.current_wallet=lower(p_wallet)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF p_cooldown NOT BETWEEN 30 AND 3600 OR length(trim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'Cooldown and reason required'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('adventure:config',0));
INSERT INTO public.admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,old_value,new_value,reason) SELECT p_actor,u.email,'super_admin','adventure','preview','CONFIGURE_PREVIEW',(SELECT to_jsonb(c) FROM public.adventure_config c WHERE id),jsonb_build_object('preview_enabled',p_enabled,'cooldown_seconds',p_cooldown),trim(p_reason) FROM auth.users u WHERE u.id=p_actor;
INSERT INTO public.adventure_config(id,preview_enabled,cooldown_seconds) VALUES(true,p_enabled,p_cooldown) ON CONFLICT(id) DO UPDATE SET preview_enabled=excluded.preview_enabled,cooldown_seconds=excluded.cooldown_seconds,updated_at=now(); END $$;
REVOKE ALL ON FUNCTION public.adventure_preview_setting(uuid,text,boolean,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adventure_preview_setting(uuid,text,boolean,integer,text) TO service_role;
COMMENT ON TABLE public.adventure_completions IS 'Non-economic achievement evidence only; no XP balance, FLOW liability, funding or payout authority.';