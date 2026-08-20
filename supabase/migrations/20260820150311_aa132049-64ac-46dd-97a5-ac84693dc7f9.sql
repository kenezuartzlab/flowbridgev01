CREATE TABLE public.flow_points_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  policy_version text NOT NULL DEFAULT 'FLOW_POINTS_V2',
  reason text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  base_points integer NOT NULL DEFAULT 0,
  verified_usd numeric,
  chain_id integer,
  tx_hash text,
  source_log_index integer,
  activity_key text,
  wallet_address text,
  day_key text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX flow_points_ledger_activity_key_uidx
  ON public.flow_points_ledger (activity_key) WHERE activity_key IS NOT NULL;
CREATE INDEX flow_points_ledger_user_day_idx
  ON public.flow_points_ledger (user_id, reason, day_key);
CREATE INDEX flow_points_ledger_wallet_day_idx
  ON public.flow_points_ledger (wallet_address, reason, day_key);

GRANT SELECT ON public.flow_points_ledger TO authenticated;
GRANT ALL ON public.flow_points_ledger TO service_role;
ALTER TABLE public.flow_points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own FLOW Points ledger"
  ON public.flow_points_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.referral_milestone_awards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  milestone text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  policy_version text NOT NULL DEFAULT 'FLOW_POINTS_V2',
  month_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referee_id, milestone)
);

CREATE INDEX referral_milestone_awards_referrer_month_idx
  ON public.referral_milestone_awards (referrer_id, month_key);

GRANT SELECT ON public.referral_milestone_awards TO authenticated;
GRANT ALL ON public.referral_milestone_awards TO service_role;
ALTER TABLE public.referral_milestone_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrers can view their own milestone awards"
  ON public.referral_milestone_awards FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());