CREATE TABLE public.wallet_auth_request_windows (
 scope text PRIMARY KEY CHECK (scope ~ '^(global|wallet:[0-9a-f]{64})$'),
 window_start timestamptz NOT NULL,
 requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
GRANT ALL ON public.wallet_auth_request_windows TO service_role;
ALTER TABLE public.wallet_auth_request_windows ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_wallet_auth_request(p_wallet_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ts timestamptz := clock_timestamp(); g integer; w integer;
BEGIN
 IF p_wallet_digest !~ '^[0-9a-f]{64}$' OR p_wallet_digest IS NULL THEN RAISE EXCEPTION 'invalid request key'; END IF;
 -- Always lock/update global first, then wallet: identical lock ordering.
 INSERT INTO wallet_auth_request_windows(scope,window_start,requests) VALUES('global',ts,1)
 ON CONFLICT(scope) DO UPDATE SET
 requests=CASE WHEN wallet_auth_request_windows.window_start <= ts-interval '1 minute' THEN 1 ELSE wallet_auth_request_windows.requests+1 END,
 window_start=CASE WHEN wallet_auth_request_windows.window_start <= ts-interval '1 minute' THEN ts ELSE wallet_auth_request_windows.window_start END
 RETURNING requests INTO g;
 IF g > 600 THEN RETURN false; END IF;
 INSERT INTO wallet_auth_request_windows(scope,window_start,requests) VALUES('wallet:'||p_wallet_digest,ts,1)
 ON CONFLICT(scope) DO UPDATE SET
 requests=CASE WHEN wallet_auth_request_windows.window_start <= ts-interval '1 minute' THEN 1 ELSE wallet_auth_request_windows.requests+1 END,
 window_start=CASE WHEN wallet_auth_request_windows.window_start <= ts-interval '1 minute' THEN ts ELSE wallet_auth_request_windows.window_start END
 RETURNING requests INTO w;
 DELETE FROM wallet_auth_request_windows WHERE scope <> 'global' AND window_start < ts-interval '5 minutes';
 RETURN w <= 10;
END $$;
REVOKE ALL ON FUNCTION public.consume_wallet_auth_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_wallet_auth_request(text) TO service_role;