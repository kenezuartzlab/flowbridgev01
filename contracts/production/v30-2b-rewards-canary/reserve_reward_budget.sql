-- FlowBridge V32.2 — server-only reward budget reservation RPC.
--
-- DEPLOYED to Lovable Cloud (BOT Mainnet project) on 2026-10-06 through the
-- platform SQL tool. It is recorded here because the managed drizzle journal
-- (drizzle/migrations/meta/_journal.json) did not capture this DDL, so this file
-- is the reproducible source of truth for the deployed definition.
--
-- Purpose: reserve points from an approved reward budget and flip the matching
-- UNFUNDED ledger rows to FUNDED in one atomic transaction, so a FLOW Point can
-- never become claimable-adjacent without its backing set aside first.
--
-- Authority: service_role only. Browsers (anon/authenticated) have no EXECUTE, so
-- a client can never set aside budget or mark its own points funded.

CREATE OR REPLACE FUNCTION public.reserve_reward_budget(
  p_budget_id uuid,
  p_purpose text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget reward_budgets;
  v_item jsonb;
  v_points integer;
  v_ledger flow_points_ledger;
  v_program text;
  v_total bigint := 0;
  v_reserved_ids uuid[] := '{}';
  v_ledger_ids uuid[] := '{}';
BEGIN
  IF p_budget_id IS NULL OR p_purpose IS NULL OR btrim(p_purpose) = '' OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'budget id, purpose and a non-empty items array are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_budget FROM reward_budgets WHERE id = p_budget_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reward budget not found' USING ERRCODE = '22023'; END IF;
  IF v_budget.status <> 'ACTIVE' THEN RAISE EXCEPTION 'reward budget is not active' USING ERRCODE = '22023'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item -> 'ledger_id') <> 'string'
       OR jsonb_typeof(v_item -> 'points') <> 'number'
       OR (v_item ->> 'points')::numeric <> trunc((v_item ->> 'points')::numeric)
       OR (v_item ->> 'points')::numeric <= 0 THEN
      RAISE EXCEPTION 'each item needs a ledger_id and a positive whole points value' USING ERRCODE = '22023';
    END IF;

    v_points := (v_item ->> 'points')::integer;

    SELECT * INTO v_ledger
      FROM flow_points_ledger
     WHERE id = (v_item ->> 'ledger_id')::uuid
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ledger row % not found', v_item ->> 'ledger_id' USING ERRCODE = '22023'; END IF;
    IF v_ledger.points <> v_points THEN
      RAISE EXCEPTION 'ledger row % accrues % points, not %', v_ledger.id, v_ledger.points, v_points USING ERRCODE = '22023';
    END IF;
    IF v_ledger.funding_state <> 'UNFUNDED' THEN
      RAISE EXCEPTION 'ledger row % is already %', v_ledger.id, v_ledger.funding_state USING ERRCODE = '22023';
    END IF;
    IF v_ledger.reservation_id IS NOT NULL THEN
      RAISE EXCEPTION 'ledger row % is already reserved', v_ledger.id USING ERRCODE = '22023';
    END IF;

    v_program := CASE
      WHEN v_ledger.reason LIKE 'CORE_SWAP%' THEN 'CORE_SWAP'
      WHEN v_ledger.reason IN ('REFERRAL_MILESTONE_FIRST_SWAP','REFERRAL_MILESTONE_VOLUME_100','REFERRAL_MILESTONE_ACTIVE_DAYS_3') THEN 'REFERRAL_MILESTONE'
      WHEN v_ledger.reason IN ('SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS') THEN 'SIGNUP_BONUS'
      ELSE NULL
    END;
    IF v_program IS NULL OR v_program <> v_budget.program_id THEN
      RAISE EXCEPTION 'ledger row % belongs to program % and cannot be funded from %', v_ledger.id, coalesce(v_program, 'NONE'), v_budget.program_id USING ERRCODE = '22023';
    END IF;

    v_total := v_total + v_points;
  END LOOP;

  IF v_budget.total_points - v_budget.reserved_points < v_total THEN
    RAISE EXCEPTION 'reward budget % has only % of % points available', v_budget.id, v_budget.total_points - v_budget.reserved_points, v_budget.total_points USING ERRCODE = '22001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_points := (v_item ->> 'points')::integer;
    INSERT INTO reward_reservations (budget_id, purpose, points, status, metadata)
      VALUES (p_budget_id, p_purpose, v_points, 'RESERVED',
              jsonb_build_object('ledgerId', v_item ->> 'ledger_id', 'generatedAt', now()::text))
      RETURNING id INTO v_ledger;
    UPDATE flow_points_ledger
       SET funding_state = 'FUNDED', program_id = v_budget.program_id, reservation_id = v_ledger.id
     WHERE id = (v_item ->> 'ledger_id')::uuid;
    v_reserved_ids := array_append(v_reserved_ids, v_ledger.id);
    v_ledger_ids := array_append(v_ledger_ids, (v_item ->> 'ledger_id')::uuid);
  END LOOP;

  UPDATE reward_budgets SET reserved_points = reserved_points + v_total WHERE id = p_budget_id;

  RETURN jsonb_build_object(
    'budget_id', p_budget_id,
    'program_id', v_budget.program_id,
    'reserved_points', v_total,
    'reservation_ids', to_jsonb(v_reserved_ids),
    'ledger_ids', to_jsonb(v_ledger_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_reward_budget(uuid, text, jsonb) IS
  'Server-only: reserves points from an approved reward budget and marks the matching unfunded ledger rows FUNDED atomically.';

REVOKE ALL ON FUNCTION public.reserve_reward_budget(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reward_budget(uuid, text, jsonb) TO service_role;
