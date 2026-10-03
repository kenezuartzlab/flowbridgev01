ALTER TABLE public.verified_activities DROP CONSTRAINT verified_activities_evidence_source_chk;
ALTER TABLE public.verified_activities ADD CONSTRAINT verified_activities_evidence_source_chk CHECK (evidence_source = ANY (ARRAY['SIGNED_INTENT','ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY']));
ALTER TABLE public.verified_activities DROP CONSTRAINT verified_activities_evidence_identity_chk;
ALTER TABLE public.verified_activities ADD CONSTRAINT verified_activities_evidence_identity_chk CHECK (
  (evidence_source = 'SIGNED_INTENT' AND intent_hash IS NOT NULL AND intent_nonce IS NOT NULL)
  OR (evidence_source IN ('ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY') AND intent_hash IS NULL AND intent_nonce IS NULL)
);