CREATE TABLE public.ai_action_intents (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  digest TEXT NOT NULL,
  canonical JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX ai_action_intents_user_idx ON public.ai_action_intents (user_id, created_at DESC);

GRANT SELECT ON public.ai_action_intents TO authenticated;
GRANT ALL ON public.ai_action_intents TO service_role;

ALTER TABLE public.ai_action_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own prepared plans"
ON public.ai_action_intents
FOR SELECT
TO authenticated
USING (user_id = auth.uid());