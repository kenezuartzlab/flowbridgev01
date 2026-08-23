CREATE TABLE IF NOT EXISTS public.ai_opportunity_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  opportunity_key TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_opportunity_state_unique UNIQUE (user_id, opportunity_key)
);

GRANT ALL ON public.ai_opportunity_state TO service_role;

ALTER TABLE public.ai_opportunity_state ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_opportunity_state_user_idx
  ON public.ai_opportunity_state (user_id);