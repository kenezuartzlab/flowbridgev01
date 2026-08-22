-- V15.3M — canonical economic evidence identity for FLOW Points CORE_SWAP.

ALTER TABLE public.flow_points_ledger
  ADD COLUMN IF NOT EXISTS verified_activity_id text
  REFERENCES public.verified_activities(activity_id);

-- 1) Collision scan + backfill of legacy CORE_SWAP rows whose canonical
--    SwapActivity log index is resolvable from verified evidence.
DO $$
DECLARE
  v_collisions integer;
BEGIN
  -- Two distinct ledger rows must never collapse onto one canonical activity.
  SELECT count(*) INTO v_collisions FROM (
    SELECT va.activity_id
      FROM public.flow_points_ledger l
      JOIN public.verified_activities va
        ON va.source_chain_id = l.chain_id
       AND va.source_tx_hash = l.tx_hash
       AND va.kind = 'SWAP_EXECUTED'
     WHERE l.reason = 'CORE_SWAP'
     GROUP BY va.activity_id
    HAVING count(DISTINCT l.id) > 1
  ) c;
  IF v_collisions > 0 THEN
    RAISE EXCEPTION 'V15.3M halted: % canonical activities map to multiple CORE_SWAP ledger rows', v_collisions;
  END IF;
END $$;

UPDATE public.flow_points_ledger l
   SET verified_activity_id = va.activity_id,
       source_log_index = va.source_log_index,
       activity_key = l.chain_id::text || ':' || l.tx_hash || ':' || va.source_log_index::text
  FROM public.verified_activities va
 WHERE l.reason = 'CORE_SWAP'
   AND l.verified_activity_id IS NULL
   AND va.kind = 'SWAP_EXECUTED'
   AND va.source_chain_id = l.chain_id
   AND va.source_tx_hash = l.tx_hash;

-- 2) The economic writer is unique on the canonical activity identity.
CREATE UNIQUE INDEX IF NOT EXISTS flow_points_ledger_verified_activity_uidx
  ON public.flow_points_ledger (verified_activity_id)
  WHERE verified_activity_id IS NOT NULL;

-- 3) Fail closed for every NEW CORE_SWAP row: no invented log index, ever.
CREATE OR REPLACE FUNCTION public.flow_points_ledger_core_swap_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reason = 'CORE_SWAP' THEN
    IF NEW.verified_activity_id IS NULL THEN
      RAISE EXCEPTION 'CORE_SWAP settlement requires a canonical verified_activity_id';
    END IF;
    IF NEW.source_log_index IS NULL OR NEW.source_log_index < 0 THEN
      RAISE EXCEPTION 'CORE_SWAP settlement requires a canonical source_log_index';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS flow_points_ledger_core_swap_guard_tg ON public.flow_points_ledger;
CREATE TRIGGER flow_points_ledger_core_swap_guard_tg
  BEFORE INSERT ON public.flow_points_ledger
  FOR EACH ROW EXECUTE FUNCTION public.flow_points_ledger_core_swap_guard();