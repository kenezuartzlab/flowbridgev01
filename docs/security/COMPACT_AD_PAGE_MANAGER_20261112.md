# Required compact ad page manager addendum — 2026-11-12

Implemented after 8cc5e181; no publication, settings writes, uploads, campaign activation or financial actions. All master/page defaults are OFF; prior five-surface configuration is no longer delivery authority and is not automatically migrated into enabled page settings. Existing banners and release HOLD are preserved.

## Central ownership
- Root mounts one manager. It portals in normal document flow to the shared BottomNav anchor; pages without navigation use root page-bottom flow with 88px safety spacing. Never a fixed intrusive overlay. Single creative maximum.
- Explicit inventory contains every existing content route, plus canonical Swap/Bridge/CA-BOT views and `/earn#referrals`; Profile is `/account`, Staking `/stake`. Public campaign details use the registered `$slug` surface; private campaign editor/analytics/submissions are excluded before dynamic matching.
- Master switch + independent page enabled toggles. Each page owns ordered creative IDs, UTC start/end schedule, session/cooldown dismissal, page/global scope, 1–10,080 minute cap, 0–300 second auto-hide, and safe left/center/right normal-flow position. Global close propagates to all pages; page close does not.
- Admin/ops/control panel/password recovery/AI private conversations/private campaign workflows/multisend/retired Fortune are explicitly flagged and disabled. Unknown routes and descendants fail closed. Dialogs/alert dialogs/transaction frames and field editing suppress ads regardless of page enabled state.
- Draft creatives and draft creative IDs are stripped from public transport; shared validated schema rejects unknown page IDs, sensitive enabled pages, missing creative selections, invalid schedules and unsafe positions. Existing audited writer and roles unchanged; no migrations.
- Analytics continues existing anonymous surface/slide/kind only; non-trading pages reuse Home category. No new wallet/session/user identifiers, URLs or text collected. Per-page analytics breakdown is not introduced.

## Acceptance
- New inventory/policy tests cover every existing content route, every page default OFF/exclusion, master/per-page isolation, independent creative selection/schedules/cooldown boundaries, actual trade tabs/referrals, unknown future routes and rejected sensitive configuration.
- `scripts/compact-ad-pages-check.py`: **560 assertions PASS**, 320/390/430/1280, both reduce/no-preference. Actual router + central manager + editor; routes, tab/hash changes, page close/revisit, global close, master/page OFF, single slot, dialogs and manager controls exercised with browser-local config only.
- Retained `scripts/banner-management-check.py`: **520 PASS**; `scripts/banner-frame-check.py`: **1,568 PASS**; `scripts/banner-carousel-check.py`: **26 PASS** on real trading preview. Combined **2,674 browser assertions**. No settings were saved.
- Full suite before final inventory assertion: **2,531 tests / 246 files PASS**; final rerun recorded in execution output. New inventory assertion normalizes TanStack directory-route trailing slash.
- Representative 320px reduced-motion and 1280px desktop manager screenshots generated and visually inspected at `/tmp/browser/compact-ad-pages/*-manager.png`. Screenshots use intentionally enabled local fixtures, not live settings. Existing real artwork visual acceptance remains covered by retained scripts; this new route fixture uses text/creative fallback and no public campaign.
- Automatic build/type gate observed OK; final gate verified before commit. No manual build/typecheck.

## Honest limitations / HOLD
Authenticated admin save/readback is not exercised because live settings changes are forbidden; actual enabled live placement and physical OS keyboard/notch/device-wallet checks remain unverified. Browser-local configuration exercises central flow end-to-end, not a physical signed-in financial workflow. External wallet popups cannot be detected as DOM dialogs; normal-flow ad placement never covers in-app controls. New routes stay OFF even before added to inventory; inventory test requires classifying them. Redirect-only pages may immediately move to their destination's independent rules. Session scope follows browser tab sessionStorage. Same-day prior report's five-surface/global-cap description is superseded by this addendum.

Changed: `src/lib/banners/compactAdPages.ts` (new), `compactAdPages.test.ts` (new), promotion/docked policy and tests, public transport, shared DockedAd and editor, BottomNav/root, CSS positions, banner AGENTS, retained management script, new route acceptance script, roadmap and this report. Architecture recorded in scoped banner AGENTS (root remains at size budget).

Preview manager: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/sets
Production release remains **HOLD**; no publish.