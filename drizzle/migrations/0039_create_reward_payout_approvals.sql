CREATE TABLE public.reward_payout_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet text not null,
  points integer not null,
  available_points integer not null,
  funded_points integer not null,
  already_settled_points integer not null,
  evidence jsonb not null,
  evidence_hash text not null,
  status text not null default 'PROPOSED',
  proposed_by uuid not null,
  proposed_by_email text not null,
  decided_by uuid,
  decided_by_email text,
  decided_at timestamp with time zone,
  decision_note text,
  confirmed_by uuid,
  confirmed_by_email text,
  confirmed_at timestamp with time zone,
  settlement_batch_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  CONSTRAINT reward_payout_approvals_status_check CHECK (status IN ('PROPOSED','APPROVED','REJECTED','CONFIRMED','EXPIRED')),
  CONSTRAINT reward_payout_approvals_points_check CHECK (points > 0 AND available_points >= points AND funded_points >= 0 AND already_settled_points >= 0)
);
CREATE UNIQUE INDEX reward_payout_approvals_one_open_per_user ON public.reward_payout_approvals (user_id) WHERE status IN ('PROPOSED','APPROVED');
GRANT SELECT, INSERT, UPDATE ON public.reward_payout_approvals TO authenticated;
GRANT ALL ON public.reward_payout_approvals TO service_role;
ALTER TABLE public.reward_payout_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_payout_approvals_service_only ON public.reward_payout_approvals FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE OR REPLACE FUNCTION public.reward_payout_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.wallet IS DISTINCT FROM OLD.wallet
      OR NEW.points IS DISTINCT FROM OLD.points
      OR NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash
      OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_IMMUTABLE: amount, wallet, account and evidence cannot change after proposal';
    END IF;
    IF OLD.status = 'PROPOSED' AND NEW.status NOT IN ('PROPOSED','APPROVED','REJECTED','EXPIRED') THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_BAD_TRANSITION: PROPOSED -> %', NEW.status;
    END IF;
    IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED','CONFIRMED','EXPIRED') THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_BAD_TRANSITION: APPROVED -> %', NEW.status;
    END IF;
    IF OLD.status IN ('REJECTED','CONFIRMED','EXPIRED') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_FINAL: % is final', OLD.status;
    END IF;
    IF NEW.status = 'APPROVED' AND (NEW.decided_by IS NULL OR NEW.decided_by = OLD.proposed_by) THEN
      RAISE EXCEPTION 'PAYOUT_APPROVAL_SELF_DECISION: a different super admin must decide';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER reward_payout_approval_guard BEFORE UPDATE ON public.reward_payout_approvals FOR EACH ROW EXECUTE FUNCTION public.reward_payout_approval_guard();