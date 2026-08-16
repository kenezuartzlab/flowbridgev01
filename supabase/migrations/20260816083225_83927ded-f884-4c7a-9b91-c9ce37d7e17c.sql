-- 1. campaigns
CREATE TABLE public.campaigns (
  campaign_id text PRIMARY KEY CHECK (campaign_id ~ '^0x[0-9a-f]{64}$'),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);
CREATE TRIGGER campaigns_touch_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT ON public.campaigns TO anon, authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published campaigns are viewable" ON public.campaigns
  FOR SELECT TO anon, authenticated USING (status = 'published');

-- 2. campaign_tasks
CREATE TABLE public.campaign_tasks (
  campaign_id text NOT NULL REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE,
  task_id text NOT NULL CHECK (task_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules) = 'array'),
  required_count integer NOT NULL CHECK (required_count > 0),
  points integer NOT NULL CHECK (points >= 0),
  completion_limit_per_wallet integer NOT NULL DEFAULT 1 CHECK (completion_limit_per_wallet > 0),
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, task_id)
);
CREATE TRIGGER campaign_tasks_touch_updated_at BEFORE UPDATE ON public.campaign_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT ON public.campaign_tasks TO anon, authenticated;
GRANT ALL ON public.campaign_tasks TO service_role;
ALTER TABLE public.campaign_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks of published campaigns are viewable" ON public.campaign_tasks
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.campaign_id = campaign_tasks.campaign_id AND c.status = 'published')
  );

-- 3. campaign_completions
CREATE TABLE public.campaign_completions (
  completion_id text PRIMARY KEY CHECK (completion_id ~ '^0x[0-9a-f]{64}$'),
  campaign_id text NOT NULL,
  task_id text NOT NULL,
  user_wallet text NOT NULL CHECK (user_wallet ~ '^0x[0-9a-f]{40}$'),
  points integer NOT NULL CHECK (points >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (campaign_id, task_id) REFERENCES public.campaign_tasks(campaign_id, task_id) ON DELETE CASCADE,
  CONSTRAINT campaign_completions_child_fk_key UNIQUE (completion_id, campaign_id, task_id, user_wallet)
);
CREATE INDEX idx_campaign_completions_wallet ON public.campaign_completions (user_wallet);
CREATE INDEX idx_campaign_completions_progress ON public.campaign_completions (campaign_id, task_id, user_wallet);

GRANT SELECT ON public.campaign_completions TO authenticated;
GRANT ALL ON public.campaign_completions TO service_role;
ALTER TABLE public.campaign_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet completions" ON public.campaign_completions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND lower(p.wallet_address) = campaign_completions.user_wallet)
  );

-- 4. campaign_completion_activities
CREATE TABLE public.campaign_completion_activities (
  completion_id text NOT NULL,
  campaign_id text NOT NULL,
  task_id text NOT NULL,
  user_wallet text NOT NULL CHECK (user_wallet ~ '^0x[0-9a-f]{40}$'),
  activity_id text NOT NULL CHECK (activity_id ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (completion_id, activity_id),
  FOREIGN KEY (completion_id, campaign_id, task_id, user_wallet)
    REFERENCES public.campaign_completions (completion_id, campaign_id, task_id, user_wallet) ON DELETE CASCADE,
  CONSTRAINT campaign_activity_no_replay UNIQUE (campaign_id, task_id, user_wallet, activity_id)
);
CREATE INDEX idx_campaign_completion_activities_activity ON public.campaign_completion_activities (activity_id);

GRANT SELECT ON public.campaign_completion_activities TO authenticated;
GRANT ALL ON public.campaign_completion_activities TO service_role;
ALTER TABLE public.campaign_completion_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet completion evidence" ON public.campaign_completion_activities
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND lower(p.wallet_address) = campaign_completion_activities.user_wallet)
  );

-- 5. campaign_points_ledger (PTS only)
CREATE TABLE public.campaign_points_ledger (
  ledger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id text NOT NULL UNIQUE,
  campaign_id text NOT NULL,
  task_id text NOT NULL,
  user_wallet text NOT NULL CHECK (user_wallet ~ '^0x[0-9a-f]{40}$'),
  points_delta integer NOT NULL CHECK (points_delta >= 0),
  reason text NOT NULL DEFAULT 'CAMPAIGN_TASK' CHECK (reason = 'CAMPAIGN_TASK'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (completion_id, campaign_id, task_id, user_wallet)
    REFERENCES public.campaign_completions (completion_id, campaign_id, task_id, user_wallet) ON DELETE CASCADE
);
CREATE INDEX idx_campaign_points_ledger_wallet ON public.campaign_points_ledger (user_wallet);
CREATE INDEX idx_campaign_points_ledger_progress ON public.campaign_points_ledger (campaign_id, task_id, user_wallet);

GRANT SELECT ON public.campaign_points_ledger TO authenticated;
GRANT ALL ON public.campaign_points_ledger TO service_role;
ALTER TABLE public.campaign_points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet campaign points" ON public.campaign_points_ledger
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND lower(p.wallet_address) = campaign_points_ledger.user_wallet)
  );

-- Settlement function (backend/service only)
CREATE OR REPLACE FUNCTION public.admin_settle_campaign_completion(
  p_completion_id text,
  p_campaign_id text,
  p_task_id text,
  p_user_wallet text,
  p_activity_ids text[],
  p_completed_at timestamptz DEFAULT now()
)
RETURNS TABLE (inserted boolean, completion_id text, points_awarded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completion_id text := lower(trim(p_completion_id));
  v_campaign_id text := lower(trim(p_campaign_id));
  v_task_id text := lower(trim(p_task_id));
  v_wallet text := lower(trim(p_user_wallet));
  v_ids text[];
  v_required integer;
  v_points integer;
  v_limit integer;
  v_status text;
  v_existing_count integer;
  v_conflicts integer;
  v_aid text;
BEGIN
  IF v_completion_id !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid completion_id'; END IF;
  IF v_campaign_id !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid campaign_id'; END IF;
  IF v_wallet !~ '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'invalid user_wallet'; END IF;
  IF p_activity_ids IS NULL OR array_length(p_activity_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one activity id is required';
  END IF;

  SELECT array_agg(lower(trim(x))) INTO v_ids FROM unnest(p_activity_ids) AS x;
  FOREACH v_aid IN ARRAY v_ids LOOP
    IF v_aid !~ '^0x[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid activity_id: %', v_aid; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'duplicate activity ids in request';
  END IF;

  SELECT c.status INTO v_status FROM public.campaigns c WHERE c.campaign_id = v_campaign_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'unknown campaign'; END IF;
  IF v_status NOT IN ('published','archived') THEN RAISE EXCEPTION 'campaign not settleable: %', v_status; END IF;

  SELECT t.required_count, t.points, t.completion_limit_per_wallet
    INTO v_required, v_points, v_limit
  FROM public.campaign_tasks t
  WHERE t.campaign_id = v_campaign_id AND t.task_id = v_task_id;
  IF v_required IS NULL THEN RAISE EXCEPTION 'unknown campaign task'; END IF;

  IF array_length(v_ids, 1) <> v_required THEN
    RAISE EXCEPTION 'expected exactly % evidence activities, got %', v_required, array_length(v_ids, 1);
  END IF;

  -- serialize settlement per campaign+task+wallet
  PERFORM pg_advisory_xact_lock(hashtextextended(v_campaign_id || ':' || v_task_id || ':' || v_wallet, 0));

  -- idempotency
  IF EXISTS (SELECT 1 FROM public.campaign_completions cc WHERE cc.completion_id = v_completion_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.campaign_completions cc
      WHERE cc.completion_id = v_completion_id
        AND cc.campaign_id = v_campaign_id AND cc.task_id = v_task_id AND cc.user_wallet = v_wallet
    ) THEN
      RAISE EXCEPTION 'completion_id already exists with different identity';
    END IF;
    SELECT count(*) INTO v_existing_count FROM public.campaign_completion_activities a
      WHERE a.completion_id = v_completion_id;
    SELECT count(*) INTO v_conflicts FROM public.campaign_completion_activities a
      WHERE a.completion_id = v_completion_id AND a.activity_id = ANY (v_ids);
    IF v_existing_count <> array_length(v_ids, 1) OR v_conflicts <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'completion_id already exists with different evidence';
    END IF;
    RETURN QUERY SELECT false, v_completion_id, 0;
    RETURN;
  END IF;

  SELECT count(*) INTO v_existing_count FROM public.campaign_completions cc
    WHERE cc.campaign_id = v_campaign_id AND cc.task_id = v_task_id AND cc.user_wallet = v_wallet;
  IF v_existing_count >= v_limit THEN
    RAISE EXCEPTION 'completion limit reached for wallet';
  END IF;

  SELECT count(*) INTO v_conflicts FROM public.campaign_completion_activities a
    WHERE a.campaign_id = v_campaign_id AND a.task_id = v_task_id
      AND a.user_wallet = v_wallet AND a.activity_id = ANY (v_ids);
  IF v_conflicts > 0 THEN
    RAISE EXCEPTION 'activity already consumed for this campaign task and wallet';
  END IF;

  INSERT INTO public.campaign_completions (completion_id, campaign_id, task_id, user_wallet, points, completed_at)
  VALUES (v_completion_id, v_campaign_id, v_task_id, v_wallet, v_points, coalesce(p_completed_at, now()));

  INSERT INTO public.campaign_completion_activities (completion_id, campaign_id, task_id, user_wallet, activity_id)
  SELECT v_completion_id, v_campaign_id, v_task_id, v_wallet, x FROM unnest(v_ids) AS x;

  INSERT INTO public.campaign_points_ledger (completion_id, campaign_id, task_id, user_wallet, points_delta, reason)
  VALUES (v_completion_id, v_campaign_id, v_task_id, v_wallet, v_points, 'CAMPAIGN_TASK');

  RETURN QUERY SELECT true, v_completion_id, v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_settle_campaign_completion(text, text, text, text, text[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_settle_campaign_completion(text, text, text, text, text[], timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_settle_campaign_completion(text, text, text, text, text[], timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_settle_campaign_completion(text, text, text, text, text[], timestamptz) TO service_role;
