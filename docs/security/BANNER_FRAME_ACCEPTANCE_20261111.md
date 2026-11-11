# Banner frame correction — 2026-11-11

## Disposition
Preview implementation only. Production remains **HOLD**. No publication, live banner/configuration changes, database writes, uploads, signatures, transactions, feature activation, permissions or financial changes were performed.

## Implemented
- Explicitly edited/new promotions use presentationVersion 2 and a shared CSS 6:1 frame, independent of source dimensions, normal/full layout and old format settings. Existing stored slides retain their legacy read defaults and renderer until explicitly edited; no automatic conversion or asset reformatting.
- Contain preserves the whole foreground over a blurred copy of the same artwork; cover fills by cropping without stretching. Admin guidance recommends 1800 × 300 or equivalent 6:1 artwork for true full bleed.
- New artwork slides default to full/image-only, contain and draft. Switching an edited slide to full turns title/body/CTA off; separately saved switches remain configurable.
- Light/dark/automatic text modes use solid contrast scrims, separate title/body/CTA visibility and nine horizontal/vertical placements. Sponsored disclosure is separate and remains when labels are hidden. The whole valid banner remains an accessible named link; no invisible CTA element is rendered.
- The admin surface preview now uses the actual TabBanner/FeaturedBanner renderer and BannerRotator, including dots and pause. Removed the inaccurate duplicate per-item preview and selectable source-format heights. Unsaved drafts can be inspected only in the existing gated admin editor; no public draft transport change.
- Tiny internal dots/pause, schedule, priority, interval, upload validation, link validation, analytics, revisions and audited save authority remain intact. A versioned carousel frame cannot grow from a legacy/status sibling. Legacy-only surfaces remain unchanged.

## Reproduction and evidence
- `bunx vitest run`: **2,470 tests, 244 files passed**, zero failures; includes six new presentation/backcompat/schema/contrast tests in promotionPresentation.test.ts and existing draft privacy/upload validation tests.
- `python3 scripts/banner-frame-check.py`: **1,568 counted assertions passed**, plus additional foreground-fit/blur and accessible control-target overlap assertions. Uses real project renderers and real editor interactions in isolated browser state, not a screenshot mock. Fixtures are fulfilled only in that browser, with 6:1, 16:9 and 4:5 images; contain/cover; Swap, CA/BOT, Home and Bridge; all nine placements; 320/390/430/1280; normal and reduced motion. Preview/live dimensions match, image loads and fitting are checked, no title/body/CTA exists in image-only mode, sponsorship stays visible. Light/dark scrim pairs exceed 4.5:1; automatic scheme chooses contrast against configured background, not an inferred photo pixel.
- `python3 scripts/banner-carousel-check.py`: **26 checks passed**, current configured live-preview slides, four widths, reduced-motion hold, keyboard, swipe, dots, pause/resume. Updated old hardcoded four-slide test to read current count (currently three) without changing settings.
- Automatic harness build/type gate: **build OK**, latest observed entry after final presentation changes. No manual application build/typecheck was run.
- Screenshots inspected for actual 390px trade page, isolated 320px editor/frame, 390px Home and 1280px Swap; all width/surface screenshots retained under `/tmp/browser/banner-frame/` and `/tmp/browser/banner-regression/` (temporary, not published assets).
- Content route metadata inspection, including index, trade, home and sets, found no missing required head fields. `git diff --check` passed.

## Limits and remaining gates
- Live admin account/wallet-authorized saving was deliberately not exercised; editor interactions and preview parity were verified in isolated state, not reported as an authenticated production save PASS.
- New 6:1 framing applies to explicitly edited/versioned items. Untouched legacy portrait/landscape promotions intentionally keep their prior presentation until an admin edits/saves them; this is the requested backcompat exception, not a live automatic fix.
- Compact labels use single-line truncation to stay inside the fixed frame. For baked-in text creatives, image-only remains the recommended mode. Extreme aspect-ratio artwork is wholly visible but necessarily smaller; blurred extension cannot make foreground text larger without cropping.
- Production publication and held-feature activation remain prohibited. Existing release blockers in RELEASE_READINESS_GATE_20261110.md remain unchanged: wallet advisory/upstream compatibility, fresh platform deep engines, physical-wallet acceptance, public discovery cross-worker budget and hosted release acceptance.

## Exact changed files
1. src/components/banners/PromotionBanner.tsx
2. src/components/banners/BannerSurfacePreview.tsx (new)
3. src/components/banners/AGENTS.md (new scoped architecture rules; root budget unchanged)
4. src/components/admin/PromotionOptionsEditor.tsx
5. src/lib/banners/promotionPolicy.ts
6. src/lib/banners/promotionPresentation.test.ts (new)
7. src/routes/sets.tsx
8. src/styles.css
9. scripts/banner-frame-check.py (new)
10. scripts/banner-carousel-check.py
11. roadmap.md
12. docs/security/BANNER_FRAME_ACCEPTANCE_20261111.md

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/trade