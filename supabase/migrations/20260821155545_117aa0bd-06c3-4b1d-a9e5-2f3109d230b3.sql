DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'partner_member_role' AND e.enumlabel = 'partner_viewer') THEN
    ALTER TYPE public.partner_member_role ADD VALUE 'partner_viewer';
  END IF;
END $$;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS pts_budget integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_revision integer,
  ADD COLUMN IF NOT EXISTS published_revision_id uuid;

CREATE TABLE IF NOT EXISTS public.campaign_submission_revisions (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL REFERENCES public.campaigns(campaign_id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.partner_organizations(org_id),
  revision integer NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  snapshot jsonb NOT NULL,
  fingerprint text NOT NULL,
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  published_at timestamptz,
  CONSTRAINT campaign_submission_revisions_unique UNIQUE (campaign_id, revision),
  CONSTRAINT campaign_submission_revisions_status_chk CHECK (
    status IN ('submitted','changes_requested','approved','published','superseded','withdrawn','ended')
  )
);

CREATE INDEX IF NOT EXISTS campaign_submission_revisions_org_idx
  ON public.campaign_submission_revisions (organization_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS campaign_submission_revisions_status_idx
  ON public.campaign_submission_revisions (status, submitted_at DESC);

GRANT ALL ON public.campaign_submission_revisions TO service_role;
ALTER TABLE public.campaign_submission_revisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_submission_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'submitted campaign revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_submission_revisions_immutable
  ON public.campaign_submission_revisions;
CREATE TRIGGER campaign_submission_revisions_immutable
  BEFORE UPDATE ON public.campaign_submission_revisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_submission_revision_mutation();