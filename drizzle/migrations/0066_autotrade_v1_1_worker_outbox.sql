CREATE TABLE public.autotrade_worker_lease (
  name text PRIMARY KEY, holder uuid, fencing bigint NOT NULL DEFAULT 0,
  lease_until timestamptz NOT NULL DEFAULT 'epoch', heartbeat_at timestamptz, last_block bigint, last_error text);
CREATE TABLE public.autotrade_worker_metrics (
  id bigserial PRIMARY KEY, holder uuid, fencing bigint, block bigint, block_time timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now(), latency_ms integer, orders integer, skipped_blocks integer, consensus text);
CREATE TABLE public.autotrade_outbox (
  idempotency_key text PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.autotrade_orders(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('approve','buy','sell','revoke')), chain_id integer NOT NULL, account text NOT NULL, nonce integer NOT NULL,
  state text NOT NULL, tx_hash text, signed_raw text, mined_block bigint, mined_hash text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (chain_id, account, nonce));
CREATE TABLE public.autotrade_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), emergency_paused boolean NOT NULL DEFAULT false,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.autotrade_control (id) VALUES (true);
CREATE TABLE public.autotrade_trading_accounts (
  address text PRIMARY KEY CHECK (address = lower(address) AND address ~ '^0x[0-9a-f]{40}$'),
  chain_id integer NOT NULL, status text NOT NULL DEFAULT 'proposed', created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.autotrade_worker_lease, public.autotrade_worker_metrics, public.autotrade_outbox, public.autotrade_control, public.autotrade_trading_accounts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.autotrade_worker_metrics_id_seq TO service_role;
ALTER TABLE public.autotrade_worker_lease ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrade_worker_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrade_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrade_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autotrade_trading_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX autotrade_worker_metrics_decided_idx ON public.autotrade_worker_metrics(decided_at DESC);

CREATE OR REPLACE FUNCTION public.autotrade_acquire_lease(_name text, _holder uuid, _ttl_seconds integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f bigint;
BEGIN
  INSERT INTO autotrade_worker_lease(name) VALUES (_name) ON CONFLICT DO NOTHING;
  UPDATE autotrade_worker_lease
     SET fencing = CASE WHEN holder IS DISTINCT FROM _holder THEN fencing + 1 ELSE fencing END,
         holder = _holder, lease_until = now() + make_interval(secs => _ttl_seconds), heartbeat_at = now()
   WHERE name = _name AND (lease_until < now() OR holder = _holder)
  RETURNING fencing INTO f;
  RETURN f;
END $$;
CREATE OR REPLACE FUNCTION public.autotrade_heartbeat(_name text, _holder uuid, _fencing bigint, _ttl_seconds integer, _block bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE autotrade_worker_lease SET lease_until = now() + make_interval(secs => _ttl_seconds), heartbeat_at = now(), last_block = coalesce(_block, last_block)
   WHERE name = _name AND holder = _holder AND fencing = _fencing AND lease_until >= now() RETURNING 1)
  SELECT exists(SELECT 1 FROM u) $$;
CREATE OR REPLACE FUNCTION public.autotrade_release_lease(_name text, _holder uuid, _fencing bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE autotrade_worker_lease SET lease_until = 'epoch' WHERE name = _name AND holder = _holder AND fencing = _fencing $$;
REVOKE EXECUTE ON FUNCTION public.autotrade_acquire_lease(text,uuid,integer), public.autotrade_heartbeat(text,uuid,bigint,integer,bigint), public.autotrade_release_lease(text,uuid,bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autotrade_acquire_lease(text,uuid,integer), public.autotrade_heartbeat(text,uuid,bigint,integer,bigint), public.autotrade_release_lease(text,uuid,bigint) TO service_role;