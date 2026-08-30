REVOKE ALL ON public.swap_tokens FROM anon, authenticated;

GRANT SELECT (id, chain, address, symbol, name, decimals, logo_url, router_id, liquidity_verified, is_active, sort_order, created_at, updated_at)
  ON public.swap_tokens TO anon, authenticated;

GRANT ALL ON public.swap_tokens TO service_role;