# Compact ad fixed dock — acceptance (preview only)

Fixes user report: ad at 9416c614 sat in normal flow before the footer, visible only at page end.

## Change
- `DockedAd.tsx`: central dock portals to `document.body` (no transformed ancestor), `.compact-ad-dock` fixed at `bottom: navHeight + 18px` (clears raised Trade button); nav height measured (ResizeObserver/mutation/interval, CSS fallback 62px). Desktop ≥768px: fixed bottom 16px, centered, max 520px. z-index 41: above nav (40), below dialogs (50). Close button 44×44 hit area.
- Sets `--compact-ad-reserve` only while visible; `BottomNav` spacer grows by it and collapses on close/hidden.
- Removed normal-flow anchor from `BottomNav`.
- Unchanged: master/page gates, sensitive-route exclusion, schedules, drafts, disclosure, dismissal scope/cooldown, focus/keyboard/dialog suppression, analytics.

## Results
- `scripts/compact-ad-fixed-check.py` (new, real DockedAd + BottomNav, transformed content wrapper): 122 assertions PASS at 320/390/430/1280 × reduced/normal motion. Bounding box identical at scroll top/half/end/top; 16–22px gap above nav; within viewport; Trade nav clickable below ad; 44px close; reserve set then cleared on close with shorter page; input focus hides; dialog hides; sensitive route hides and route return restores; dismissal persists across route change. Old behavior fails the fixed/constant-position assertions.
- `scripts/compact-ad-pages-check.py`: 560 assertions PASS.
- Vitest: 246 files, 2,532 tests PASS. Build OK.
- Screenshots inspected: 390 mid-scroll, 320 end-scroll — ad above nav, footer clear.

## Limitations / HOLD
- Not verified on physical Samsung Internet or MetaMask in-app browser; keyboard detection uses focus + visualViewport heuristics.
- While visible the dock overlays scrolling content above the nav by design (content at page end remains reachable via reserve).
- No publication, settings, financial or contract changes. All placements remain OFF by default; release HOLD unchanged.
