-- FlowBridge B1 Gate 5A1.1
-- Harden verified_activities so admin_record_verified_activity is the ONLY service-role write boundary.
-- This is a corrective, additive migration. It does NOT recreate the table or function.

-- Precheck: the SECURITY DEFINER function owner (postgres) also owns the table, so the
-- function retains INSERT authority even after direct service_role table DML is revoked.

-- Revoke the overly permissive direct DML grant from Gate 5A1.
REVOKE ALL ON public.verified_activities FROM service_role;

-- Grant only the intended read access for trusted campaign settlement.
GRANT SELECT ON public.verified_activities TO service_role;

-- Leave function ACLs, RLS, table structure, CHECK constraints, UNIQUE constraints,
-- and existing data unchanged.
