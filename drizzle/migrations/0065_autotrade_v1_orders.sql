CREATE TABLE public.autotrade_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_email text NOT NULL,
  pair text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('paper','live')),
  state text NOT NULL,
  order_json jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  last_decision jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.autotrade_events (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.autotrade_orders(id) ON DELETE CASCADE,
  version integer NOT NULL,
  actor_email text,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version)
);
GRANT ALL ON public.autotrade_orders TO service_role;
GRANT ALL ON public.autotrade_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.autotrade_events_id_seq TO service_role;
ALTER TABLE public.autotrade_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrade_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX autotrade_orders_state_idx ON public.autotrade_orders(state);