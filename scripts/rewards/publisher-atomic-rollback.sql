BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE b uuid; a uuid; actor uuid; n bigint; first_result boolean; second_result boolean;
BEGIN
 SELECT id INTO actor FROM public.profiles LIMIT 1;
 INSERT INTO public.reward_settlement_batches(chain_id,distributor,epoch_id,root,total_wei,claim_start,claim_end,fingerprint,leaves) VALUES(677,'rollback-test-only',2147480000,'0x'||repeat('a',64),1,1,2,'rollback-only','[]') RETURNING id INTO b;
 INSERT INTO public.reward_publish_attempts(batch_id,distributor,epoch_id,root,fingerprint,operator_id,tx_hash) VALUES(b,'rollback-test-only',2147480000,'0x'||repeat('a',64),'rollback-only',actor,'0x'||repeat('b',64)) RETURNING id INTO a;
 BEGIN
 INSERT INTO public.reward_publish_attempts(batch_id,distributor,epoch_id,root,fingerprint,operator_id) VALUES(b,'rollback-test-only',2147480000,'different','rollback-only',actor);
 RAISE EXCEPTION 'duplicate epoch attempt accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 first_result:=public.confirm_reward_publication(a,'0x'||repeat('b',64),'0x'||repeat('c',64),1,actor,'rollback-test@example.invalid','super_admin');
 second_result:=public.confirm_reward_publication(a,'0x'||repeat('b',64),'0x'||repeat('c',64),1,actor,'rollback-test@example.invalid','super_admin');
 IF first_result IS DISTINCT FROM true OR second_result IS DISTINCT FROM false THEN RAISE EXCEPTION 'confirmation not idempotent'; END IF;
 SELECT count(*) INTO n FROM public.admin_audit_events WHERE object_id='677:2147480000' AND action='PUBLISH_CONFIRMED_VERIFIED';
 IF n<>1 THEN RAISE EXCEPTION 'duplicate audit %',n; END IF;
 BEGIN
 PERFORM public.confirm_reward_publication(a,'0x'||repeat('d',64),'0x'||repeat('c',64),1,actor,'rollback-test@example.invalid','super_admin');
 RAISE EXCEPTION 'wrong hash accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='wrong hash accepted' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: duplicate epoch rejected, exact hash enforced, two confirmations produce one audit';
END $$;
ROLLBACK;
SELECT count(*) AS residual_test_attempts FROM public.reward_publish_attempts WHERE distributor='rollback-test-only';
