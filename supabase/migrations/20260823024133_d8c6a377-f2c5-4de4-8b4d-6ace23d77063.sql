CREATE TABLE public.ai_missions (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  goal_text text NOT NULL,
  status text NOT NULL,
  mission jsonb NOT NULL,
  current_step_id text,
  version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_missions_user_updated_idx ON public.ai_missions (user_id, updated_at DESC);

GRANT ALL ON public.ai_missions TO service_role;

ALTER TABLE public.ai_missions ENABLE ROW LEVEL SECURITY;