DO $$
DECLARE
  v_campaign_id text := '0x343ab6a7f875fb803e6b32cb43341b20ac71ce5eba958621fde0fd55d480b16b';
  v_slug text := 'bot-bridge-pioneer-testnet';
  v_intended text := 'Complete one verified FlowBridge direct bridge from BNB Testnet to BOT Testnet. Qualification is based on finalized official source-chain bridge evidence. Campaign PTS are separate from FLOW-claimable rewards.';
  v_current text := 'Complete one verified FlowBridge direct bridge from BNB Testnet to BOT Testnet. Qualification is based on finalized official source-chain bridge evidence. Campaign PTS are separate fromFLOW-claimable rewards.';
  r record;
BEGIN
  SELECT * INTO r FROM public.campaigns WHERE campaign_id = v_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign % not found', v_campaign_id;
  END IF;

  IF r.slug <> v_slug THEN
    RAISE EXCEPTION 'Slug mismatch: expected %, found %', v_slug, r.slug;
  END IF;

  IF r.description = v_intended THEN
    RAISE NOTICE 'Campaign description already matches intended value; no update performed.';
    RETURN;
  END IF;

  IF r.description <> v_current THEN
    RAISE EXCEPTION 'Campaign description has an unexpected value and will not be overwritten. Current: %', r.description;
  END IF;

  UPDATE public.campaigns
     SET description = v_intended
   WHERE campaign_id = v_campaign_id;

  RAISE NOTICE 'Campaign description corrected for %.', v_campaign_id;
END $$;