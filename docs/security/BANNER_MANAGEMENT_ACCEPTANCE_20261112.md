# Final banner management acceptance — 2026-11-12

## Result and boundary
Implemented in project preview only, preserving 4e854505's opt-in presentation, contained artwork/blurred extension, image-only controls and real renderer previews. No publication, settings save, campaign creation on the backend, activation, wallet signature, transaction, financial/identity/role change or database migration occurred. New docked placement is absent/OFF by default. Release remains **HOLD**.

## Delivered
- Mandatory independent paid disclosure: Sponsored / Ad / Promoted, optional bounded attribution `Sponsored · Brand`; corner/horizontal/vertical selection, inset, size, color theme and backing opacity. Unknown artwork cannot prove pixel contrast: lettering retains opaque backing even in transparent/zero-opacity mode; validated custom pairs require 4.5:1. Accessible link names retain disclosure and artwork attribution. Compact size is safely capped at 10px; Home honors 8–16px.
- Home-only 6:1, 3:1, 16:9, 1:1, 4:5 and 9:16 formats, height capped at 480px; trading/Bridge/CA-BOT remain 6:1. Legacy reads do not opt in. Carousel grid reserves tallest selected Home format for stability; choose a common ratio to avoid extra space when mixing formats.
- Auto/light/dark/custom/transparent overlay background; transparent removes the panel scrim, not necessary individual text backing. Contained artwork continues over blurred image extension, not blank white/black bands.
- Only Draft and Published are publication states. Live now / Scheduled / Paused / Expired are derived. Existing enabled boolean remains an availability control, no longer mislabeled Live. Drafts never auto-publish; saved messaging distinguishes scheduled publication from live display.
- Separate docked management: enable/surface choices, explicit draft creatives, owned uploads, destination, priority/order, UTC schedule, disabled availability, one creative maximum, session or 1–10,080 minute cooldown dismissal, optional 0–300 second auto-hide. No invented live destination or reward promise. Preview close/restore never saves or tracks. Public disabled creative arrays and drafts are stripped from transport.
- Dock is **normal document flow immediately before BottomNav's existing spacer**, not an always-visible overlay. It appears when the reader reaches the page bottom; deliberately never floats above/obscures trading controls. It is hidden during field editing or a detected reduced visual viewport. Trade placement follows the existing canonical Trade tab store. Explore events reuse the existing Home analytics category, with unique dock slide IDs; no new identifiers or PII. Close is outside the link and never counts as click.

## Exact verification
- `bunx vitest run src/lib/banners`: **36 tests / 5 files PASS**, including 14 new final-management rules.
- Final `bunx vitest run`: **2,484 tests / 245 files PASS**, zero failed, 2026-11-12 00:48:41 UTC; Vitest 4.1.12.
- `python3 scripts/banner-management-check.py`: **520 assertions PASS**, 320/390/430/1280 and reduce/no-preference; actual Home/Tab/Preview/DockedAd/editor components mounted through actual router in browser-only fixtures. Six Home ratios/contain/parity, nine disclosure positions, backed transparency, one slot/normal-flow bounds, focus/keyboard hiding, close/remount/session reset/cooldown expiry/auto-hide, mandatory paid flag, editor changes/restore, no click on close, no page errors.
- `python3 scripts/banner-frame-check.py`: **1,568 assertions PASS**; existing Home/Swap/CA-BOT/Bridge image ratio/fit/text placement/disclosure/control parity and accessibility behavior at the same widths/motion modes. Its fixture document now runs independent of app session/network reads and explicitly installs the dev React preamble; no public route was added.
- `python3 scripts/banner-carousel-check.py`: **26 checks PASS** on real preview trading pages; navigation, swipe, pause/dots and reduced motion.
- Total browser assertions: **2,114**. Automatic build/type gate newest relevant entry **build OK at 2026-11-12T00:47:28Z**. No manual project build/typecheck was run.
- Inspected content-route metadata: index, trade, home and admin sets already have app-specific title/description/OG/type/twitter; no new content route.

## Screenshot evidence
Generated under `/tmp/browser/banner-management/` for each width and motion mode: `*-4-5-home.png`, `*-9-16-home.png`, `*-dock.png`, `*-editor.png`; retained frame/live-carousel scripts generate their own evidence. Viewed representative 390px dock/portrait Home and 320px editor screenshots. They show whole artwork, minimal backed disclosure, separate visible X and no external pagination. Fixture artwork is synthetic, not an owner campaign. Portrait tests deliberately use landscape art to demonstrate contained foreground and blurred extension; production art was not replaced.

## Limitations / remaining HOLD
- Physical iOS/Android OS keyboard, notches and actual-device safe-area behavior were **not** tested. Browser acceptance covers editing hide, viewport sizes and normal-flow/non-overlap; fixture navigation/chat button is not a signed-in real trading session. No real enabled live ad/save was exercised because settings must remain unchanged.
- Dock is page-bottom normal flow, not persistently pinned above navigation. This is the layout-safe interpretation, avoiding intrusion and execution overlap. Browser session dismissal means tab sessionStorage; cross-tab/new-session behavior follows browser storage semantics.
- Automated tests cannot recognize embedded image words. Owner must place disclosure in an unused region of each actual creative using the shared preview. Extreme long custom attribution at smallest sizes may wrap; renderer reserves control/copy regions and caps compact typography. Transparent disclosure lettering intentionally retains contrast backing.
- Mixed Home formats reserve tallest carousel height; portrait capped on large displays rather than stretching/cropping artwork. No new ratio is applied to legacy slides until edited.
- Authenticated Super Admin real save/readback, actual paid click analytics readback and physical device placement remain unverified; preview tests use local fixtures, never mutate server settings. Existing audited writer/upload roles and revision path are preserved.
- Inherited release-readiness gates remain unchanged: compatible wallet dependency patch, fresh platform deep engines, physical-wallet acceptance, cross-worker discovery budget and hosted release acceptance. No scan or release PASS is claimed by this banner work.

## Changed files
`roadmap.md`; `src/components/admin/PromotionOptionsEditor.tsx`; new `src/components/admin/DockedAdEditor.tsx`; `src/components/banners/AGENTS.md`; new `src/components/banners/DockedAd.tsx`; `src/components/banners/FeaturedBanner.tsx`; `src/components/banners/PromotionBanner.tsx`; `src/components/nav/BottomNav.tsx`; new `src/lib/banners/dockedAdPolicy.ts`; new `src/lib/banners/dockedAdPolicy.test.ts`; `src/lib/banners/promotionPolicy.ts`; `src/lib/banners/publicPromotions.ts`; `src/lib/config/appConfig.ts`; `src/routes/api/admin.settings.ts`; `src/routes/sets.tsx`; `src/styles.css`; `scripts/banner-frame-check.py`; new `scripts/banner-management-check.py`; this acceptance report.

Root AGENTS has no remaining size budget; new structural rules are recorded in the banner directory AGENTS instead. No repository dependencies were changed.

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/trade
Admin: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/sets
Home: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/home