CREATE TABLE public.reward_funding_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id text NOT NULL REFERENCES public.reward_budgets(program_id),
  ledger_ids uuid[] NOT NULL,
  total_points bigint NOT NULL,
  row_count integer NOT NULL,
  account_count integer NOT NULL,
  snapshot_hash text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','CONFIRMED','REJECTED','STALE')),
  proposed_by uuid, proposed_by_email text NOT NULL,
  approved_by uuid, approved_by_email text, approved_at timestamptz,
  confirmed_by uuid, confirmed_by_email text, confirmed_at timestamptz,
  result jsonb, note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reward_funding_snapshots_open_hash ON public.reward_funding_snapshots(snapshot_hash) WHERE status IN ('PROPOSED','APPROVED','CONFIRMED');
GRANT ALL ON public.reward_funding_snapshots TO service_role;
ALTER TABLE public.reward_funding_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reward_ops_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'WARN',
  dedupe_key text NOT NULL UNIQUE,
  detail text NOT NULL,
  corrective_action text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  resolved_by_email text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_ops_exceptions TO service_role;
ALTER TABLE public.reward_ops_exceptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reward_automation_policy (
  program_id text PRIMARY KEY REFERENCES public.reward_budgets(program_id),
  auto_funding_enabled boolean NOT NULL DEFAULT false,
  per_run_cap bigint NOT NULL DEFAULT 0,
  daily_cap bigint NOT NULL DEFAULT 0,
  suspended boolean NOT NULL DEFAULT false,
  updated_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reward_automation_policy TO service_role;
ALTER TABLE public.reward_automation_policy ENABLE ROW LEVEL SECURITY;
INSERT INTO public.reward_automation_policy(program_id) SELECT program_id FROM public.reward_budgets ON CONFLICT DO NOTHING;

CREATE TABLE public.reward_ops_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  summary jsonb NOT NULL
);
GRANT ALL ON public.reward_ops_runs TO service_role;
ALTER TABLE public.reward_ops_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reward_funding_hash(p_ids uuid[])
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg(l.id::text || ':' || l.points || ':' || l.funding_state, ',' ORDER BY l.id), ''), 'UTF8')), 'hex')
  FROM public.flow_points_ledger l WHERE l.id = ANY(p_ids)
$$;

CREATE OR REPLACE FUNCTION public.create_reward_funding_snapshot(p_program text, p_ids uuid[], p_actor uuid, p_email text, p_evidence jsonb, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; tot bigint; accts int; sid uuid;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RAISE EXCEPTION 'ledger rows required'; END IF;
  SELECT count(*), sum(points), count(DISTINCT user_id) INTO n, tot, accts FROM flow_points_ledger
   WHERE id = ANY(p_ids) AND funding_state='UNFUNDED' AND reservation_id IS NULL AND points > 0
     AND (program_id IS NULL OR program_id = p_program);
  IF n <> array_length(p_ids,1) THEN RAISE EXCEPTION 'some rows are not fundable'; END IF;
  INSERT INTO reward_funding_snapshots(program_id, ledger_ids, total_points, row_count, account_count, snapshot_hash, evidence, proposed_by, proposed_by_email, note)
  VALUES (p_program, p_ids, tot, n, accts, reward_funding_hash(p_ids), coalesce(p_evidence,'{}'::jsonb), p_actor, p_email, p_note)
  RETURNING id INTO sid;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, new_value, reason)
  VALUES (p_actor, p_email, 'operator', 'reward_funding', sid::text, 'PROPOSED', jsonb_build_object('program',p_program,'points',tot,'rows',n,'accounts',accts), p_note);
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_reward_funding_snapshot(p_snapshot uuid, p_actor uuid, p_email text, p_role text, p_expected_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s reward_funding_snapshots%ROWTYPE; r jsonb; labelled jsonb;
BEGIN
  IF p_role <> 'super_admin' THEN RAISE EXCEPTION 'super admin approval authority required'; END IF;
  SELECT * INTO s FROM reward_funding_snapshots WHERE id = p_snapshot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot not found'; END IF;
  IF s.status = 'CONFIRMED' THEN RETURN jsonb_build_object('outcome','ALREADY_CONFIRMED','result',s.result); END IF;
  IF s.status <> 'APPROVED' THEN RAISE EXCEPTION 'snapshot is %', s.status; END IF;
  IF p_expected_hash IS DISTINCT FROM s.snapshot_hash THEN RAISE EXCEPTION 'snapshot hash mismatch'; END IF;
  IF reward_funding_hash(s.ledger_ids) <> s.snapshot_hash THEN
    UPDATE reward_funding_snapshots SET status='STALE', updated_at=now() WHERE id=s.id;
    INSERT INTO reward_ops_exceptions(kind, severity, dedupe_key, detail, corrective_action)
      VALUES ('STALE_FUNDING_SNAPSHOT','BLOCK','stale:'||s.id,'Reward records changed after the funding snapshot was created.','Create a new funding snapshot and approve it again.')
      ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN jsonb_build_object('outcome','STALE');
  END IF;
  SELECT jsonb_agg(id) INTO labelled FROM flow_points_ledger WHERE id = ANY(s.ledger_ids) AND program_id IS NULL;
  r := reserve_reward_budget(s.ledger_ids, s.program_id, p_email, 'V36.10 funding snapshot '||s.id||' hash '||s.snapshot_hash);
  IF r->>'outcome' <> 'CONFIRMED' THEN RAISE EXCEPTION 'reservation failed: %', r; END IF;
  r := r || jsonb_build_object('programLabelAssignedFromNull', coalesce(labelled,'[]'::jsonb));
  UPDATE reward_funding_snapshots SET status='CONFIRMED', confirmed_by=p_actor, confirmed_by_email=p_email, confirmed_at=now(), result=r, updated_at=now() WHERE id=s.id;
  INSERT INTO admin_audit_events(actor_user_id, actor_email, actor_role, object_type, object_id, action, old_value, new_value, reason)
  VALUES (p_actor, p_email, p_role, 'reward_funding', s.id::text, 'CONFIRMED', jsonb_build_object('hash',s.snapshot_hash,'evidence',s.evidence), r, s.note);
  RETURN jsonb_build_object('outcome','CONFIRMED','result',r);
END $$;

REVOKE ALL ON FUNCTION public.reward_funding_hash(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_reward_funding_snapshot(text, uuid[], uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_reward_funding_snapshot(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_funding_hash(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_reward_funding_snapshot(text, uuid[], uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_reward_funding_snapshot(uuid, uuid, text, text, text) TO service_role;