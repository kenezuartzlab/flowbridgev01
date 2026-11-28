# AutoTrade owner action checklist (from b5f8f427) — 2026-11-28

## Verified this session (read-only)
- Publish state: published 2026-11-28 07:34:15 UTC, has_unpublished_changes=true. No publish performed.
- Schedule 334 `autotrade-worker` (`* * * * *`, `/api/public/hooks/autotrade-worker`, body `{"source":"cron"}`): active=false, unchanged.
- Unauthenticated POST to worker: production 401 (1.55s), preview 401 (0.14s). Caller auth is enforced on both.
- No independent BOT 677 RPC or managed signer/broker configuration exists in project secrets. No evidence collection started.

## Release mechanism (blocker)
- Lovable Publish deploys the whole current project snapshot; there is no selective/partial publish and no exposed production source revision to attest.
- The BNB Swap embargo is source-locked and enforced by `scripts/check-bnb-swap-embargo.mjs`, so a future full publish would not expose BNB Swap, but it would ship every other unpublished change.
- Supported isolated path: export via GitHub, build a release branch from the reviewed commit, run CI (tests, typecheck, build, embargo check), and record the commit SHA as the attested release. Lovable itself cannot attest the deployed revision.

## Scheduler deadline (blocker)
- Managed HTTP schedules time out after a few seconds. Last measured authenticated paper cycle: preview ~5.4s, production 50.3s (old code). Neither fits. Keep 334 paused until a published build runs one cycle well under the deadline (target <3s p99 over 20 manual authenticated calls) and then a real scheduled run writes a heartbeat.

## Owner actions, in order
1. Release attestation (human): name a reviewer who approves the exact commit SHA, confirms the diff since 2026-11-28 07:34 UTC, confirms embargo check passes and that live/public/registry flags are OFF. Signed note with name, date, SHA.
2. Security attestation (human, not AI): independent reviewer signs off on managed dispatch, lease fencing and service-only permissions. AI review does not count.
3. Publish: only after 1–2, via Publish → Publish changes (full snapshot).
4. Bound-wallet Ops walkthrough: sign in with the owner email on the published site, connect the bound wallet in the same browser, open Ops → AutoTrade, confirm checklist loads (no 403), run one "single paper cycle", confirm paper order state and heartbeat update. If 403 appears, the wallet is not the bound one; do not work around it.
5. Scheduler: after step 4 and deadline target met, ask to resume schedule 334; verify first scheduled heartbeat.
6. Independent BOT 677 RPC: run your own BOT mainnet node (official BOT Chain node release, archive not required, synced, HTTPS with TLS) or contract a provider not operated by the current public endpoint operator. Add secret `AUTOTRADE_BOT_RPC_URL` in Project Settings → Secrets. Seven-day block-hash parity evidence starts only after it is set.
7. Managed signer/broker: create a cloud KMS key (asymmetric, ECC_SECG_P256K1, sign/verify, non-exportable) for a dedicated trading account only. Least privilege: one service identity with `kms:Sign` and `kms:GetPublicKey` on that single key ARN; no Decrypt, CreateKey, key-policy or export rights; audit logging on. Broker exposes sign-only for chain 677 with exact-intent fingerprint check. Add secrets `AUTOTRADE_SIGNER_BROKER_URL`, `AUTOTRADE_SIGNER_BROKER_TOKEN`, `AUTOTRADE_SIGNER_KEY_ID`. Only then is the account address derived and reported.
8. Canary order: enter buy price, sell price, slippage and expiry yourself; refresh gas against the dedicated account and approve an exact gas cap. Trade cap stays 5 USDT-equivalent.

## Unchanged holds
AUTOTRADE_LIVE_ENABLED=false, public OFF, registry writes OFF, signer NOT_CONFIGURED, BNB_SWAP_PUBLICATION_EMBARGO=true, BNB_EXECUTION_ENABLED=false, LAUNCH_HOLD=true. No funds, signatures, trades or registry transactions.
