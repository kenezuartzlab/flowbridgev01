# Mobile banner correction — preview only

## Scope
- `src/components/banners/BannerRotator.tsx`: removed external pagination pills; 6px internal dots with 24px keyboard/tap targets; translucent 24px top-right pause/resume with 12px icon. Active state retained, live announcements disabled during autoplay.
- `src/styles.css`: scoped image-overlay control tokens and reduced-motion dot styling.
- `scripts/banner-carousel-check.py`: read-only real-preview regression checks; screenshots in `/tmp/browser/banner-regression`.
- `roadmap.md`: acceptance recorded; release HOLD preserved.

## Checks
- Full suite: **2,456 tests / 242 files passed**, zero failures.
- Browser: **26 behavioral checks passed**, 320/390/430/1280 widths, dot/arrow/swipe navigation, persistent pause/resume and no autoplay under reduced motion; zero page errors. All four live slides captured at each width. Selected mobile screenshots inspected: copy and sign-in unobscured; external control overhang eliminated without increasing the 58px mobile banner height or changing image crop.
- Automatic preview build/type gate: **build OK**, latest entry 2026-11-10T03:47:51Z. No manual build/typecheck invoked (harness-owned).
- Existing content-route metadata including `/` and `/trade` inspected; missing-head routes are redirect-only aliases. No metadata changes needed.

## Release
**HOLD — no publication, activation, database writes, wallet signatures or financial changes.** Existing 2 high/11 moderate dependency advisory rows, stale deep scans and unverified real-wallet sign-in remain prior release blockers; not resolved or rescanned by this targeted presentation correction.

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/trade