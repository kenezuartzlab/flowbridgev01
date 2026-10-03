ALTER TABLE public.trade_operational_events
  ADD COLUMN IF NOT EXISTS token_in text,
  ADD COLUMN IF NOT EXISTS token_out text,
  ADD COLUMN IF NOT EXISTS session_hash text,
  ADD COLUMN IF NOT EXISTS price_impact_bps integer,
  ADD COLUMN IF NOT EXISTS slippage_bps integer,
  ADD COLUMN IF NOT EXISTS amount_out_ratio_bps integer,
  ADD COLUMN IF NOT EXISTS pool_fees_bps integer,
  ADD COLUMN IF NOT EXISTS flowbridge_fee_bps integer,
  ADD COLUMN IF NOT EXISTS gas_estimate bigint,
  ADD COLUMN IF NOT EXISTS gas_used bigint,
  ADD COLUMN IF NOT EXISTS amount_bucket text;
CREATE INDEX IF NOT EXISTS trade_operational_events_time_idx ON public.trade_operational_events (occurred_at DESC);

CREATE TABLE public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  area text NOT NULL,
  session_hash text,
  device_category text NOT NULL DEFAULT 'unknown',
  network integer
);
GRANT ALL ON public.product_events TO service_role;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX product_events_time_idx ON public.product_events (occurred_at DESC);

CREATE TABLE public.liquidity_gap_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  network integer NOT NULL,
  token_in text NOT NULL,
  token_out text NOT NULL,
  dex_preference text NOT NULL,
  dexes_checked text[] NOT NULL DEFAULT '{}',
  direct_pool_found boolean,
  multihop_found boolean,
  missing_connection text,
  session_hash text
);
GRANT ALL ON public.liquidity_gap_observations TO service_role;
ALTER TABLE public.liquidity_gap_observations ENABLE ROW LEVEL SECURITY;
CREATE INDEX liquidity_gap_observations_time_idx ON public.liquidity_gap_observations (observed_at DESC);