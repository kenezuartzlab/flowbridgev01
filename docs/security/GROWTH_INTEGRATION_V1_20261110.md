# Growth Integration V1 — acceptance, 2026-11-10

## Built in code/preview
- Existing swap receipts: finite theme-aware confirmed feedback, reduced-motion equivalent, no confetti overlays. Existing successful all-leg receipt handler emits category-only swap confirmation. No execution, quote, router, approval, fee or chain logic changed.
- Existing post-action activation: preserves cooldown/decline behavior; completed accounts use canonical next-best action or existing nextAction fallback, with optional referral navigation. Home loses its duplicate rewards balance panel and retains one canonical primary next action.
- Existing shared Mainnet claim card: one Claim FLOW entry, full recipient/network/amount review before continuing, small per-round lifecycle, successful receipt plus on-chain claimed-only celebration, readable round dates. Existing sequential sending, checks, stops and recovery remain unchanged. V1 and V2 remain separate; V2 controls unchanged.
- Existing referrals: copy/share acknowledgement and category-only events, compact recorded funnel and collapsed history. Does not invent first eligible transaction or paid stages: current response cannot establish those facts per referral. No eligibility/amount changes.
- Adventure: shared entry and quest/chest/history content require successful existing restricted preview reads. Public OFF gate unchanged; no activation, new mission, XP balance or chance mechanics.
- Three registered events: project.swap_confirmed, project.flow_claim_confirmed, project.referral_link_shared. No wallets/emails/amounts/hashes/signatures. Referral sharing is not qualification. Existing Ops/product telemetry remains intact, not migrated or deleted.

## Checks
- Full regression suite: **2,456 tests / 242 files passed, zero failed**. Targeted suite: 85 passed. Existing sequential receipt/revert/replay and Adventure/API negatives included.
- Automatic build/type gate: **build OK**, latest observed after claim-date correction. No manual build/typecheck run.
- Browser: 320/390/430/1280 public Home/Earn/Rewards/Adventure layouts, no horizontal overflow; real restored-account Adventure denied/catalog hidden. Isolated receipt and referral copy states exercised at each width, reduced-motion confirmation animation disabled. Claimable read fixture reviewed/cancelled with full recipient shown; no wallet transaction or signature performed. Final fixture run: zero runtime errors. Isolated post-action module stubbed because direct mounting lacks app providers; full post-action follow-through is not end-to-end verified.
- Catalog/collector schema check: valid, exactly three events. Event delivery not asserted from localhost; no published traffic check performed.
- Fresh dependency scan: **2 high / 11 moderate advisory rows remain**. Deep scans remain stale. Real-wallet sign-in and financial claim/swap acceptance remain unverified.
- Existing content-route metadata inspected; unchanged unique titles/descriptions and social tags preserved. Git whitespace checks pass.

## Explicit limits and HOLD
**Not published. Adventure not enabled.** No database writes/migrations, hosted config changes, contract/role/treasury/budget/staking changes, funding, payments or signatures.

No per-transaction verified reward amount is returned by the existing receipt interface; receipt explicitly says pending verification rather than guessing or attributing aggregate Points to this transaction. Canonical rewards pages remain the source of verified totals.

Release remains held for dependency advisories, stale deep scans and real-wallet auth acceptance. Existing identity/promotions/Adventure changes remain unpublished. Real financial end-to-end execution was deliberately not exercised.

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app

## North Star
Metric: swaps confirmed on-chain and bridge transfers verified as received at the destination wallet, each week. This catalog now covers confirmed swaps, not verified bridge delivery. Add the bridge-delivery event only in a separately authorized instrumentation update.

Instrumentation followed the **user-app-events-instrumentation** skill.