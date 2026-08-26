CREATE TABLE public.mainnet_release_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('APPROVE','REJECT','REPLACE')),
  decision_version text NOT NULL,
  candidate_digest text NOT NULL,
  approved_value jsonb,
  decision_hash text,
  approved_by_user uuid,
  approved_by_email text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mainnet_release_decisions IS 'FlowBridge V30.1D.2 append-only owner release decision records. Public approved values only; never key material. Reachable only through the server-side admin gate (service_role).';

CREATE INDEX mainnet_release_decisions_decision_idx ON public.mainnet_release_decisions (decision_id, approved_at DESC);

GRANT ALL ON public.mainnet_release_decisions TO service_role;

ALTER TABLE public.mainnet_release_decisions ENABLE ROW LEVEL SECURITY;