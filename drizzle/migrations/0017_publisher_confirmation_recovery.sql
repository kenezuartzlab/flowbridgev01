CREATE TABLE public.reward_publish_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.reward_settlement_batches(id), chain_id integer NOT NULL DEFAULT 677, distributor text NOT NULL, epoch_id integer NOT NULL, root text NOT NULL, fingerprint text NOT NULL, operator_id uuid NOT NULL, tx_hash text, phase text NOT NULL DEFAULT 'AWAITING_SIGNATURE', block_hash text, block_number bigint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(chain_id,distributor,epoch_id)
);
GRANT ALL ON public.reward_publish_attempts TO service_role;
ALTER TABLE public.reward_publish_attempts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX reward_publish_attempt_tx ON public.reward_publish_attempts(chain_id,tx_hash) WHERE tx_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.confirm_reward_publication(p_attempt uuid,p_hash text,p_block_hash text,p_block bigint,p_actor uuid,p_email text,p_role text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.reward_publish_attempts; b public.reward_settlement_batches;
BEGIN
 SELECT * INTO a FROM public.reward_publish_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.tx_hash IS DISTINCT FROM lower(p_hash) THEN RAISE EXCEPTION 'attempt mismatch'; END IF;
 SELECT * INTO b FROM public.reward_settlement_batches WHERE id=a.batch_id FOR UPDATE;
 IF b.root<>a.root OR b.fingerprint<>a.fingerprint OR b.epoch_id<>a.epoch_id THEN RAISE EXCEPTION 'batch changed'; END IF;
 IF a.phase='CONFIRMED_VERIFIED' AND a.block_hash=p_block_hash THEN RETURN false; END IF;
 UPDATE public.reward_settlement_batches SET publication_verified_at=coalesce(publication_verified_at,now()) WHERE id=b.id;
 UPDATE public.reward_publish_attempts SET phase='CONFIRMED_VERIFIED',block_hash=p_block_hash,block_number=p_block,updated_at=now() WHERE id=a.id;
 INSERT INTO public.admin_audit_events(actor_user_id,actor_email,actor_role,object_type,object_id,action,new_value,reason) VALUES(p_actor,p_email,p_role,'reward_round','677:'||a.epoch_id,'PUBLISH_CONFIRMED_VERIFIED',jsonb_build_object('txHash',lower(p_hash),'root',a.root,'block',p_block::text,'blockHash',p_block_hash),'canonical publisher receipt verification');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_reward_publication(uuid,text,text,bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reward_publication(uuid,text,text,bigint,uuid,text,text) TO service_role;