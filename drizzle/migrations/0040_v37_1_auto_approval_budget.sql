CREATE TABLE public.reward_auto_approval_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  acceptance_confirmed boolean NOT NULL DEFAULT false,
  daily_budget_flow bigint NOT NULL DEFAULT 0 CHECK (daily_budget_flow >= 0 AND daily_budget_flow <= 500000),
  per_wallet_daily_cap bigint NOT NULL DEFAULT 0 CHECK (per_wallet_daily_cap >= 0),
  enabled_programs text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_auto_approval_config TO service_role;
ALTER TABLE public.reward_auto_approval_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.reward_auto_approval_config (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.reward_payout_approvals ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS reward_payout_approvals_one_unbatched_confirmed
  ON public.reward_payout_approvals(user_id) WHERE status = 'CONFIRMED' AND settlement_batch_id IS NULL;

CREATE OR REPLACE FUNCTION public.auto_approve_payout(
  p_user uuid, p_wallet text, p_points integer, p_available integer, p_funded integer, p_settled integer,
  p_evidence jsonb, p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.reward_auto_approval_config; used bigint; wallet_used bigint; new_id uuid; day_start timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reward_auto_approval'));
  SELECT * INTO c FROM public.reward_auto_approval_config WHERE id = 1;
  IF c IS NULL OR NOT c.enabled OR c.suspended OR NOT c.acceptance_confirmed OR c.daily_budget_flow <= 0 OR c.updated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'AUTOMATION_OFF'); END IF;
  IF p_points <= 0 OR p_points > p_available THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_AMOUNT'); END IF;
  IF EXISTS (SELECT 1 FROM public.reward_payout_approvals WHERE user_id = p_user
      AND (status IN ('PROPOSED','APPROVED') OR (status = 'CONFIRMED' AND settlement_batch_id IS NULL))) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COMMITTED'); END IF;
  day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT coalesce(sum(points),0) INTO used FROM public.reward_payout_approvals WHERE auto_approved AND status = 'CONFIRMED' AND created_at >= day_start;
  IF used + p_points > c.daily_budget_flow THEN RETURN jsonb_build_object('ok', false, 'reason', 'DAILY_BUDGET_EXHAUSTED'); END IF;
  SELECT coalesce(sum(points),0) INTO wallet_used FROM public.reward_payout_approvals WHERE auto_approved AND status = 'CONFIRMED' AND created_at >= day_start AND lower(wallet) = lower(p_wallet);
  IF c.per_wallet_daily_cap > 0 AND wallet_used + p_points > c.per_wallet_daily_cap THEN RETURN jsonb_build_object('ok', false, 'reason', 'WALLET_DAILY_CAP'); END IF;
  INSERT INTO public.reward_payout_approvals (user_id, wallet, points, available_points, funded_points, already_settled_points,
    evidence, evidence_hash, status, proposed_by, proposed_by_email, decided_by, decided_by_email, decided_at,
    confirmed_by, confirmed_by_email, confirmed_at, decision_note, auto_approved)
  VALUES (p_user, lower(p_wallet), p_points, p_available, p_funded, p_settled, p_evidence, p_hash, 'CONFIRMED',
    c.updated_by, 'auto-budget:' || coalesce(c.updated_by_email,''), NULL, NULL, now(), NULL, 'auto-budget', now(),
    'Automatically approved within the super-admin configured daily budget', true)
  RETURNING id INTO new_id;
  INSERT INTO public.admin_audit_events (actor_user_id, actor_email, actor_role, object_type, object_id, action, new_value)
  VALUES (c.updated_by, 'auto-budget:' || coalesce(c.updated_by_email,''), 'automation', 'reward_payout_approval', new_id::text, 'AUTO_APPROVED',
    jsonb_build_object('points', p_points, 'dailyUsedBefore', used, 'dailyBudget', c.daily_budget_flow));
  RETURN jsonb_build_object('ok', true, 'id', new_id, 'dailyUsed', used + p_points);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COMMITTED');
END $$;
REVOKE ALL ON FUNCTION public.auto_approve_payout(uuid,text,integer,integer,integer,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_payout(uuid,text,integer,integer,integer,integer,jsonb,text) TO service_role;