-- Admin allow-list (server-checked only; never readable by clients)
CREATE TABLE public.app_admins (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_admins TO service_role;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_admins (email) VALUES ('kenezuartzlab@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Globally published swap tokens (admin-curated)
CREATE TABLE public.swap_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('mainnet','testnet')),
  address text NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  decimals integer NOT NULL DEFAULT 18 CHECK (decimals >= 0 AND decimals <= 36),
  logo_url text,
  router_id integer,
  liquidity_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain, address)
);
GRANT SELECT ON public.swap_tokens TO anon, authenticated;
GRANT ALL ON public.swap_tokens TO service_role;
ALTER TABLE public.swap_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active swap tokens"
  ON public.swap_tokens FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Global app settings (public read, admin/server write)
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read app settings"
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.app_settings (key, value) VALUES
  ('fees', '{"defaultSlippagePct": 0.5, "maxSlippagePct": 5, "minBridgeUsd": 10}'::jsonb),
  ('rewards', '{"minUsd": 5, "usdBlock": 5, "pointsPerBlock": 1, "referralClaimMinSwapUsd": 100, "claimThreshold": 1000}'::jsonb),
  ('flags', '{"limitTabPublic": false, "showBanners": true, "maintenanceNotice": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER swap_tokens_touch BEFORE UPDATE ON public.swap_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER app_settings_touch BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();