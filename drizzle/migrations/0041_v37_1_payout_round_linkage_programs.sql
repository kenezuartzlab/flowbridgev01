ALTER TABLE public.reward_payout_approvals
  ADD COLUMN IF NOT EXISTS program_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_epoch_id integer,
  ADD COLUMN IF NOT EXISTS publication_tx_hash text,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS reward_payout_approvals_one_per_batch_wallet
  ON public.reward_payout_approvals (settlement_batch_id, lower(wallet)) WHERE settlement_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reward_payout_approval_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.wallet IS DISTINCT FROM OLD.wallet
      OR NEW.points IS DISTINCT FROM OLD.points OR NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash
      OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by OR NEW.program_breakdown IS DISTINCT FROM OLD.program_breakdown
      OR NEW.auto_approved IS DISTINCT FROM OLD.auto_approved THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_IMMUTABLE: amount, wallet, account, programs and evidence cannot change after proposal';
    END IF;
    IF OLD.settlement_batch_id IS NOT NULL AND (NEW.settlement_batch_id IS DISTINCT FROM OLD.settlement_batch_id
      OR NEW.linked_epoch_id IS DISTINCT FROM OLD.linked_epoch_id OR NEW.publication_tx_hash IS DISTINCT FROM OLD.publication_tx_hash
      OR NEW.linked_at IS DISTINCT FROM OLD.linked_at) THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_LINK_FINAL: a published round link cannot change';
    END IF;
    IF NEW.settlement_batch_id IS NOT NULL AND NEW.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_LINK_STATUS: only confirmed approvals can be linked';
    END IF;
    IF OLD.status = 'PROPOSED' AND NEW.status NOT IN ('PROPOSED','APPROVED','REJECTED','EXPIRED') THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_BAD_TRANSITION: PROPOSED -> %', NEW.status;
    END IF;
    IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED','CONFIRMED','EXPIRED') THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_BAD_TRANSITION: APPROVED -> %', NEW.status;
    END IF;
    IF OLD.status IN ('REJECTED','CONFIRMED','EXPIRED') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_FINAL: % is final', OLD.status;
    END IF;
    IF NEW.status = 'APPROVED' AND (NEW.decided_by IS NULL OR NEW.decided_by = OLD.proposed_by) THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_SELF_DECISION: a different super admin must decide';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Links one confirmed approval to one verified-published round. Write-once.
CREATE OR REPLACE FUNCTION public.link_payout_approval(p_approval uuid, p_batch uuid, p_tx text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.reward_payout_approvals; b public.reward_settlement_batches; leaf jsonb; ok boolean := false;
BEGIN
  SELECT * INTO a FROM public.reward_payout_approvals WHERE id = p_approval FOR UPDATE;
  IF a IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND'); END IF;
  IF a.settlement_batch_id IS NOT NULL THEN RETURN jsonb_build_object('ok', a.settlement_batch_id = p_batch, 'reason', 'ALREADY_LINKED'); END IF;
  IF a.status <> 'CONFIRMED' THEN RETURN jsonb_build_object('ok', false, 'reason', 'NOT_CONFIRMED'); END IF;
  SELECT * INTO b FROM public.reward_settlement_batches WHERE id = p_batch FOR SHARE;
  IF b IS NULL OR b.publication_verified_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'NOT_PUBLISHED'); END IF;
  IF b.created_at < a.confirmed_at THEN RETURN jsonb_build_object('ok', false, 'reason', 'BATCH_PREDATES_APPROVAL'); END IF;
  IF p_tx IS NULL OR p_tx !~ '^0x[0-9a-fA-F]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'TX_REQUIRED'); END IF;
  FOR leaf IN SELECT * FROM jsonb_array_elements(b.leaves) LOOP
    IF lower(leaf->>'account') = lower(a.wallet) AND (leaf->>'amount')::numeric >= a.points::numeric * 1000000000000000000 THEN ok := true; END IF;
  END LOOP;
  IF NOT ok THEN RETURN jsonb_build_object('ok', false, 'reason', 'WALLET_NOT_IN_ROUND'); END IF;
  UPDATE public.reward_payout_approvals SET settlement_batch_id = b.id, linked_epoch_id = b.epoch_id,
    publication_tx_hash = lower(p_tx), linked_at = now() WHERE id = a.id;
  INSERT INTO public.admin_audit_events (actor_role, object_type, object_id, action, new_value)
  VALUES ('automation', 'reward_payout_approval', a.id::text, 'LINKED_TO_PUBLISHED_ROUND',
    jsonb_build_object('epochId', b.epoch_id, 'batchId', b.id, 'tx', lower(p_tx), 'points', a.points));
  RETURN jsonb_build_object('ok', true, 'epochId', b.epoch_id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'reason', 'ROUND_WALLET_ALREADY_LINKED');
END $$;
REVOKE ALL ON FUNCTION public.link_payout_approval(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_payout_approval(uuid,uuid,text) TO service_role;

-- Program-aware automatic approval. Every program in the breakdown must be enabled.
CREATE OR REPLACE FUNCTION public.auto_approve_payout_v2(
  p_user uuid, p_wallet text, p_points integer, p_available integer, p_funded integer, p_settled integer,
  p_programs jsonb, p_evidence jsonb, p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.reward_auto_approval_config; used bigint; wallet_used bigint; new_id uuid; day_start timestamptz; k text; v jsonb; total bigint := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reward_auto_approval'));
  SELECT * INTO c FROM public.reward_auto_approval_config WHERE id = 1;
  IF c IS NULL OR NOT c.enabled OR c.suspended OR NOT c.acceptance_confirmed OR c.daily_budget_flow <= 0 OR c.updated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'AUTOMATION_OFF'); END IF;
  IF p_points <= 0 OR p_points > p_available THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_AMOUNT'); END IF;
  IF jsonb_typeof(p_programs) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'reason', 'PROGRAM_ATTRIBUTION_UNKNOWN'); END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_programs) LOOP
    IF NOT (k = ANY (c.enabled_programs)) THEN RETURN jsonb_build_object('ok', false, 'reason', 'PROGRAM_NOT_ENABLED'); END IF;
    IF jsonb_typeof(v) <> 'number' OR (v::text)::numeric <= 0 OR (v::text)::numeric <> floor((v::text)::numeric) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'PROGRAM_ATTRIBUTION_UNKNOWN'); END IF;
    total := total + (v::text)::bigint;
  END LOOP;
  IF total <> p_points THEN RETURN jsonb_build_object('ok', false, 'reason', 'PROGRAM_ATTRIBUTION_UNKNOWN'); END IF;
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
    confirmed_by, confirmed_by_email, confirmed_at, decision_note, auto_approved, program_breakdown)
  VALUES (p_user, lower(p_wallet), p_points, p_available, p_funded, p_settled, p_evidence, p_hash, 'CONFIRMED',
    c.updated_by, 'auto-budget:' || coalesce(c.updated_by_email,''), NULL, NULL, now(), NULL, 'auto-budget', now(),
    'Automatically approved within the super-admin configured daily budget', true, p_programs)
  RETURNING id INTO new_id;
  INSERT INTO public.admin_audit_events (actor_user_id, actor_email, actor_role, object_type, object_id, action, new_value)
  VALUES (c.updated_by, 'auto-budget:' || coalesce(c.updated_by_email,''), 'automation', 'reward_payout_approval', new_id::text, 'AUTO_APPROVED',
    jsonb_build_object('points', p_points, 'programs', p_programs, 'dailyUsedBefore', used, 'dailyBudget', c.daily_budget_flow));
  RETURN jsonb_build_object('ok', true, 'id', new_id, 'dailyUsed', used + p_points);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COMMITTED');
END $$;
REVOKE ALL ON FUNCTION public.auto_approve_payout_v2(uuid,text,integer,integer,integer,integer,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_payout_v2(uuid,text,integer,integer,integer,integer,jsonb,jsonb,text) TO service_role;

-- Retire the program-blind version: it can no longer approve anything.
CREATE OR REPLACE FUNCTION public.auto_approve_payout(
  p_user uuid, p_wallet text, p_points integer, p_available integer, p_funded integer, p_settled integer,
  p_evidence jsonb, p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('ok', false, 'reason', 'AUTOMATION_OFF'); END $$;
COMMENT ON FUNCTION public.auto_approve_payout(uuid,text,integer,integer,integer,integer,jsonb,text) IS 'DEPRECATED: replaced by auto_approve_payout_v2 (program-aware)';