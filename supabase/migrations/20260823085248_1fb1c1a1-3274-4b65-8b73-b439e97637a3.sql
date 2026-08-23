ALTER TABLE public.ai_missions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- V17.1F §10 — terminalize only missions whose persisted evidence already proves
-- completion: every step COMPLETED and status COMPLETED. No history is fabricated.
UPDATE public.ai_missions m
SET completed_at = m.updated_at,
    mission = jsonb_set(m.mission, '{completedAt}', to_jsonb(to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true)
WHERE m.status = 'COMPLETED'
  AND m.completed_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(m.mission->'steps') s
    WHERE s->>'state' <> 'COMPLETED'
  );

CREATE INDEX IF NOT EXISTS ai_missions_user_completed_idx
  ON public.ai_missions (user_id, completed_at DESC);