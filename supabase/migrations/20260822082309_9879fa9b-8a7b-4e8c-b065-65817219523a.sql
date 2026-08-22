CREATE TABLE IF NOT EXISTS public.ai_user_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'USER_PRIVATE',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'USER_STATED',
  promoted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_user_memory_scope_chk CHECK (scope IN ('USER_PRIVATE','SESSION')),
  CONSTRAINT ai_user_memory_origin_chk CHECK (origin IN ('USER_STATED','USER_CORRECTION','PRODUCT_INGESTION')),
  CONSTRAINT ai_user_memory_unique UNIQUE (user_id, scope, key)
);

GRANT ALL ON public.ai_user_memory TO service_role;

ALTER TABLE public.ai_user_memory ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_user_memory_user_idx ON public.ai_user_memory (user_id);