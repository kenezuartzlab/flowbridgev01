CREATE TABLE public.banner_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surface text NOT NULL,
  slide_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('impression','click')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.banner_events TO service_role;
ALTER TABLE public.banner_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all client access to banner_events" ON public.banner_events AS RESTRICTIVE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX banner_events_lookup_idx ON public.banner_events (surface, slide_id, kind, created_at DESC);