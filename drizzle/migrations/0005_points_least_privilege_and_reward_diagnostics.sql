-- Least privilege: economic ledgers are written only by the server role.
REVOKE ALL ON public.flow_points_ledger FROM anon, authenticated;
REVOKE ALL ON public.referral_milestone_awards FROM anon, authenticated;
GRANT SELECT ON public.flow_points_ledger TO authenticated;
GRANT SELECT ON public.referral_milestone_awards TO authenticated;
GRANT ALL ON public.flow_points_ledger TO service_role;
GRANT ALL ON public.referral_milestone_awards TO service_role;

-- Enumerated ledger reasons (legacy names kept for history). Unknown fails closed.
ALTER TABLE public.flow_points_ledger ADD CONSTRAINT flow_points_ledger_reason_chk CHECK (reason = ANY (ARRAY[
  'CORE_SWAP','CORE_SWAP_V2','DAILY_CAP_REACHED',
  'REFERRAL_FIRST_QUALIFYING_SWAP','REFERRAL_100_USD_VOLUME','REFERRAL_3_ACTIVE_DAYS',
  'REFERRAL_MILESTONE_FIRST_SWAP','REFERRAL_MILESTONE_VOLUME_100','REFERRAL_MILESTONE_ACTIVE_DAYS_3',
  'REFERRAL_MONTHLY_CAP_REACHED','ANTI_ABUSE_REVIEW','PRICING_REVIEW']));
ALTER TABLE public.flow_points_ledger ADD CONSTRAINT flow_points_ledger_points_nonneg_chk CHECK (points >= 0 AND base_points >= 0);

-- Profile inserts by end users can never seed economic fields.
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_inserts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('service_role','postgres') OR session_user IN ('service_role','postgres')
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.flow_points := 0; NEW.claimed_tokens := 0; NEW.points_self := 0;
  NEW.points_referral_activity := 0; NEW.points_referral_signup := 0;
  NEW.total_swap_volume_usd := 0; NEW.wallet_address := NULL;
  NEW.binding_changes_count := 0; NEW.last_binding_change := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER prevent_protected_profile_inserts BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_inserts();

-- Internal reward-processing diagnostics (server-only; no wallet, email or amounts).
CREATE TABLE public.reward_processing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  chain_id integer,
  tx_hash text,
  stage text NOT NULL,
  outcome text NOT NULL CHECK (outcome = ANY (ARRAY[
    'PERSISTENCE_REJECTED','UNSUPPORTED_RECORD_TYPE','VALUATION_UNAVAILABLE','CANONICAL_EVENT_MISSING',
    'DUPLICATE','ANTI_ABUSE_REVIEW','RETRY_SCHEDULED','PERMANENT_FAILURE','CREDITED'])),
  detail text
);
GRANT ALL ON public.reward_processing_events TO service_role;
ALTER TABLE public.reward_processing_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX reward_processing_events_tx_idx ON public.reward_processing_events (tx_hash);