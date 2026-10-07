CREATE TABLE public.reward_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  distributor text NOT NULL,
  epoch_id integer NOT NULL,
  root text NOT NULL,
  total_wei numeric NOT NULL,
  claim_start bigint NOT NULL,
  claim_end bigint NOT NULL,
  fingerprint text NOT NULL,
  leaves jsonb NOT NULL,
  program_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  publication_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, distributor, epoch_id, root)
);
GRANT ALL ON public.reward_settlement_batches TO service_role;
ALTER TABLE public.reward_settlement_batches ENABLE ROW LEVEL SECURITY;
-- No policies: server-only (service role). Wallet proofs are served one wallet at a time
-- and only after the on-chain root matches.