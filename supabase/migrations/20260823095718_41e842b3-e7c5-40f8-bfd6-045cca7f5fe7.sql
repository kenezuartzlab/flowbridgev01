ALTER TABLE public.ai_missions
  ADD COLUMN IF NOT EXISTS source_opportunity_id text,
  ADD COLUMN IF NOT EXISTS source_opportunity_kind text,
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS template_version text;

-- V18 §7 — the server owns deduplication: at most one non-terminal mission per
-- actor + source opportunity + template. Completed/cancelled history never
-- blocks a genuinely new mission.
CREATE UNIQUE INDEX IF NOT EXISTS ai_missions_active_source_uidx
  ON public.ai_missions (user_id, source_opportunity_id, template_id)
  WHERE source_opportunity_id IS NOT NULL
    AND status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE INDEX IF NOT EXISTS ai_missions_source_idx
  ON public.ai_missions (user_id, source_opportunity_id);