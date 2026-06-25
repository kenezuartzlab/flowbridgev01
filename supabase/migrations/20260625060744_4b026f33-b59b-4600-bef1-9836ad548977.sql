
CREATE TABLE public.siwe_nonces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX siwe_nonces_wallet_idx ON public.siwe_nonces (wallet_address);
CREATE INDEX siwe_nonces_expires_idx ON public.siwe_nonces (expires_at);

GRANT ALL ON public.siwe_nonces TO service_role;

ALTER TABLE public.siwe_nonces ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: only service_role (server) touches this table.
