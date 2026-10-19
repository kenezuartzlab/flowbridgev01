CREATE TABLE public.reward_budget_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id text NOT NULL REFERENCES public.reward_budgets(program_id),
  previous_budget bigint NOT NULL,
  new_budget bigint NOT NULL,
  committed_points bigint NOT NULL,
  onchain_budget_required bigint NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED',
  proposed_by uuid NOT NULL,
  proposed_by_email text NOT NULL,
  approved_by uuid,
  approved_by_email text,
  tx_hash text,
  block_number bigint,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_budget_adjustments_status_ck CHECK (status IN ('PROPOSED','APPROVED_OFFCHAIN','EXECUTED','REJECTED'))
);
CREATE UNIQUE INDEX reward_budget_adjustments_tx_hash_uq ON public.reward_budget_adjustments (lower(tx_hash)) WHERE tx_hash IS NOT NULL;
CREATE INDEX reward_budget_adjustments_program_idx ON public.reward_budget_adjustments (program_id, created_at DESC);
GRANT ALL ON public.reward_budget_adjustments TO service_role;
ALTER TABLE public.reward_budget_adjustments ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.reward_budget_adjustments IS 'Auditable off-chain budget proposal/approval/execution history. Server-only (service_role); no anon/authenticated access.';