DO $$
DECLARE
  v_campaign_id text := '0x343ab6a7f875fb803e6b32cb43341b20ac71ce5eba958621fde0fd55d480b16b';
  v_slug text := 'bot-bridge-pioneer-testnet';
  v_task_id text := 'bridge-bnb-to-bot-testnet';
  v_name text := 'BOT Bridge Pioneer - Testnet Pilot';
  v_desc text := 'Complete one verified FlowBridge direct bridge from BNB Testnet to BOT Testnet. Qualification is based on finalized official source-chain bridge evidence. Campaign PTS are separate from FLOW-claimable rewards.';
  v_starts timestamptz := '2026-08-16T00:00:00Z';
  v_ends timestamptz := '2026-10-31T23:59:59Z';
  v_status text := 'published';
  v_meta jsonb := '{"network":"testnet","grant_demo":true,"category":"verified-bridge","points_unit":"PTS","flow_claimable":false,"evidence_model":"verified-source-activity"}'::jsonb;
  v_task_title text := 'Bridge BNB Testnet to BOT Testnet';
  v_task_desc text := 'Submit one direct official bridge from BNB Testnet to BOT Testnet that FlowBridge verifies from the finalized official source DepositEvent.';
  v_rules jsonb := '[{"type":"ACTIVITY_KIND","kind":"BRIDGE_SUBMITTED"},{"type":"SOURCE_CHAIN","chainId":97},{"type":"DESTINATION_CHAIN","chainId":968},{"type":"ACTION_TYPE","actionType":"0xa391054066f75f7c43647fb06ebe9f75413bc8d943fe571990a3e644f576b309"}]'::jsonb;
  r record;
BEGIN
  -- slug owned by a different campaign_id => conflict
  IF EXISTS (SELECT 1 FROM public.campaigns c WHERE c.slug = v_slug AND c.campaign_id <> v_campaign_id) THEN
    RAISE EXCEPTION 'slug % already belongs to a different campaign_id', v_slug;
  END IF;

  SELECT * INTO r FROM public.campaigns WHERE campaign_id = v_campaign_id;
  IF FOUND THEN
    IF r.slug <> v_slug OR r.name <> v_name OR coalesce(r.description,'') <> v_desc
       OR r.starts_at <> v_starts OR r.ends_at <> v_ends OR r.status <> v_status
       OR r.metadata <> v_meta THEN
      RAISE EXCEPTION 'existing campaign % differs from requested values; refusing to overwrite', v_campaign_id;
    END IF;
  ELSE
    INSERT INTO public.campaigns (campaign_id, slug, name, description, starts_at, ends_at, status, metadata)
    VALUES (v_campaign_id, v_slug, v_name, v_desc, v_starts, v_ends, v_status, v_meta);
  END IF;

  SELECT * INTO r FROM public.campaign_tasks WHERE campaign_id = v_campaign_id AND task_id = v_task_id;
  IF FOUND THEN
    IF r.title <> v_task_title OR coalesce(r.description,'') <> v_task_desc OR r.rules <> v_rules
       OR r.required_count <> 1 OR r.points <> 250 OR r.completion_limit_per_wallet <> 1 OR r.sort_order <> 10 THEN
      RAISE EXCEPTION 'existing task %/% differs from requested values; refusing to overwrite', v_campaign_id, v_task_id;
    END IF;
  ELSE
    INSERT INTO public.campaign_tasks (campaign_id, task_id, title, description, rules, required_count, points, completion_limit_per_wallet, sort_order)
    VALUES (v_campaign_id, v_task_id, v_task_title, v_task_desc, v_rules, 1, 250, 1, 10);
  END IF;
END $$;