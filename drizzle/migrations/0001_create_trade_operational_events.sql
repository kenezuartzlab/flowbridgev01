CREATE TABLE public.trade_operational_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL CHECK (event_name IN ('quote_success','quote_failure','quote_stale','review_invalidated','simulation_success','simulation_failure','wallet_rejected','tx_submitted','tx_confirmed','tx_reverted','rpc_failure','allowance_failure','insufficient_balance','minimum_output_failure','route_unavailable')),
  network integer NOT NULL CHECK (network IN (56, 97, 677, 968)),
  route_type text NOT NULL CHECK (route_type IN ('single','atomic_v4','staged','unknown')),
  dex text NOT NULL DEFAULT 'unknown',
  transaction_count integer NOT NULL DEFAULT 0 CHECK (transaction_count >= 0 AND transaction_count <= 20),
  duration_ms integer CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 3600000)),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 80),
  device_category text NOT NULL CHECK (device_category IN ('mobile','desktop','unknown'))
);
GRANT ALL ON public.trade_operational_events TO service_role;
ALTER TABLE public.trade_operational_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny client access to trade operational events" ON public.trade_operational_events AS RESTRICTIVE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX trade_operational_events_time_idx ON public.trade_operational_events (occurred_at DESC);
CREATE INDEX trade_operational_events_health_idx ON public.trade_operational_events (network, route_type, event_name, occurred_at DESC);