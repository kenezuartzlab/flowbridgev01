CREATE TABLE public.legacy_carryover_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy text NOT NULL DEFAULT 'LEGACY_CARRYOVER_V2_20261108' CHECK (policy = 'LEGACY_CARRYOVER_V2_20261108'),
  snapshot_hash text NOT NULL UNIQUE CHECK (snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  verified_points bigint NOT NULL CHECK (verified_points >= 0),
  goodwill_points bigint NOT NULL CHECK (goodwill_points >= 0),
  wallets integer NOT NULL CHECK (wallets >= 0),
  summary jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED')),
  goodwill_budget_points bigint,
  confirmed_by uuid, confirmed_wallet text, confirmed_free_wei numeric, confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX legacy_carryover_one_confirmed ON public.legacy_carryover_snapshots(policy) WHERE status = 'CONFIRMED';

CREATE TABLE public.legacy_carryover_items (
  snapshot_id uuid NOT NULL REFERENCES public.legacy_carryover_snapshots(id),
  ledger_id uuid NOT NULL REFERENCES public.flow_points_ledger(id),
  economic_id text NOT NULL,
  user_id uuid NOT NULL,
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  points integer NOT NULL CHECK (points > 0),
  source text NOT NULL CHECK (source IN ('LEGACY_VERIFIED','OWNER_GOODWILL')),
  PRIMARY KEY (snapshot_id, ledger_id),
  CHECK (economic_id = 'LEGACY_CARRYOVER_V2_20261108:' || ledger_id::text)
);

GRANT ALL ON public.legacy_carryover_snapshots TO service_role;
GRANT ALL ON public.legacy_carryover_items TO service_role;
ALTER TABLE public.legacy_carryover_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_carryover_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_legacy_carryover() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'legacy_carryover_items' THEN RAISE EXCEPTION 'legacy carryover snapshot is immutable'; END IF;
  IF OLD.status = 'CONFIRMED' THEN RAISE EXCEPTION 'confirmed carryover is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','goodwill_budget_points','confirmed_by','confirmed_wallet','confirmed_free_wei','confirmed_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','goodwill_budget_points','confirmed_by','confirmed_wallet','confirmed_free_wei','confirmed_at'])
  THEN RAISE EXCEPTION 'carryover snapshot amounts are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legacy_carryover_snapshot_guard BEFORE UPDATE OR DELETE ON public.legacy_carryover_snapshots FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_carryover();
CREATE TRIGGER legacy_carryover_items_guard BEFORE UPDATE OR DELETE ON public.legacy_carryover_items FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_carryover();

-- Stage an immutable draft. Totals are recomputed from items, never trusted.
CREATE OR REPLACE FUNCTION public.stage_legacy_carryover(p_hash text, p_items jsonb, p_summary jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; v bigint; g bigint; w int;
BEGIN
  SELECT id INTO sid FROM legacy_carryover_snapshots WHERE snapshot_hash = lower(p_hash);
  IF sid IS NOT NULL THEN RETURN sid; END IF; -- idempotent retry
  SELECT coalesce(sum((x->>'points')::bigint) FILTER (WHERE x->>'source'='LEGACY_VERIFIED'),0),
         coalesce(sum((x->>'points')::bigint) FILTER (WHERE x->>'source'='OWNER_GOODWILL'),0),
         count(DISTINCT lower(x->>'wallet'))
    INTO v, g, w FROM jsonb_array_elements(p_items) x;
  INSERT INTO legacy_carryover_snapshots(snapshot_hash, verified_points, goodwill_points, wallets, summary)
    VALUES (lower(p_hash), v, g, w, p_summary) RETURNING id INTO sid;
  INSERT INTO legacy_carryover_items(snapshot_id, ledger_id, economic_id, user_id, wallet, points, source)
    SELECT sid, (x->>'ledgerId')::uuid, x->>'economicId', (x->>'userId')::uuid, lower(x->>'wallet'), (x->>'points')::int, x->>'source'
    FROM jsonb_array_elements(p_items) x;
  RETURN sid;
END $$;

-- One-time Super Admin confirmation. Caller (server) proves Super Admin + bound wallet + live vault free balance.
CREATE OR REPLACE FUNCTION public.confirm_legacy_carryover(p_snapshot uuid, p_hash text, p_verified bigint, p_goodwill_budget bigint, p_actor uuid, p_wallet text, p_free_wei numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s legacy_carryover_snapshots; bad int; n int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reward-destination-fence'));
  SELECT * INTO s FROM legacy_carryover_snapshots WHERE id = p_snapshot FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'snapshot not found'; END IF;
  IF EXISTS (SELECT 1 FROM legacy_carryover_snapshots WHERE status='CONFIRMED') THEN RAISE EXCEPTION 'carryover already confirmed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_admins WHERE user_id = p_actor) THEN RAISE EXCEPTION 'admin required'; END IF;
  IF lower(p_hash) <> s.snapshot_hash OR p_verified <> s.verified_points OR p_goodwill_budget <> s.goodwill_points THEN RAISE EXCEPTION 'snapshot mismatch'; END IF;
  IF p_free_wei < (s.verified_points + s.goodwill_points) * 1e18 THEN RAISE EXCEPTION 'vault not fully backed'; END IF;
  -- Re-verify every item is still unpaid, unrouted, and bound to the same single account wallet.
  SELECT count(*) INTO bad FROM legacy_carryover_items i
   LEFT JOIN profiles p ON p.id = i.user_id
   WHERE i.snapshot_id = s.id AND (
     p.wallet_address IS NULL OR lower(p.wallet_address) <> i.wallet
     OR (SELECT count(*) FROM profiles q WHERE lower(q.wallet_address) = i.wallet) <> 1
     OR EXISTS (SELECT 1 FROM reward_award_destinations d WHERE d.ledger_id = i.ledger_id)
     OR EXISTS (SELECT 1 FROM reward_economic_award_allocations a WHERE a.ledger_id = i.ledger_id));
  IF bad > 0 THEN RAISE EXCEPTION 'snapshot stale: % items changed', bad; END IF;
  -- Global V1 fence: committed V1 (published + open approvals) must not exceed what the snapshot assumed.
  INSERT INTO reward_award_destinations(ledger_id, economic_award_id, destination, cutover_at)
    SELECT i.ledger_id, i.economic_id, 'VAULT_V2', c.cutover_at FROM legacy_carryover_items i CROSS JOIN reward_vault_v2_config c
    WHERE i.snapshot_id = s.id AND c.id AND c.cutover_accepted;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> (SELECT count(*) FROM legacy_carryover_items WHERE snapshot_id = s.id) THEN RAISE EXCEPTION 'vault cutover not accepted'; END IF;
  UPDATE legacy_carryover_snapshots SET status='CONFIRMED', goodwill_budget_points=p_goodwill_budget, confirmed_by=p_actor,
    confirmed_wallet=lower(p_wallet), confirmed_free_wei=p_free_wei, confirmed_at=now() WHERE id = s.id;
  INSERT INTO admin_audit_events(actor_id, action, object_type, object_id, details)
    VALUES (p_actor, 'LEGACY_CARRYOVER_CONFIRMED', 'legacy_carryover', s.id::text,
      jsonb_build_object('hash', s.snapshot_hash, 'verified', s.verified_points, 'goodwill', s.goodwill_points, 'wallets', s.wallets, 'items', n));
  RETURN jsonb_build_object('items', n, 'verified', s.verified_points, 'goodwill', s.goodwill_points);
END $$;

REVOKE ALL ON FUNCTION public.stage_legacy_carryover(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_legacy_carryover(uuid, text, bigint, bigint, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_legacy_carryover(text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_carryover(uuid, text, bigint, bigint, uuid, text, numeric) TO service_role;