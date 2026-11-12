# Compact ad slim / flush polish — preview acceptance

Base: 2eb47817. No production publication, live settings writes or financial changes.

## Incremental presentation changes
- Mobile creative frame: 7:1, 44–56px tall, zero enclosing padding/margin, 4px radius. 24px side clearance accommodates the border-centered close hit target; safe-area side insets are respected. Desktop remains 6:1, up to 480×80px.
- Foreground artwork remains `contain`; the existing blurred image extension fits nonmatching ratios without cropping text or stretching the original. Compact placement always shows a small `Ad` label at left.
- Fixed portal bottom uses the actual nav top (`innerHeight - nav.top`), not nav height plus a gap. ResizeObserver, resize/visualViewport events and existing polling keep it aligned.
- To remove the gap without overlapping the raised Trade icon, that icon sits inside the menu only while the dock is visible; its original raised position returns on suppression/dismissal. Other nav controls remain unchanged.
- Close: 44×44px transparent hit area centered on the right border, small 18×22px translucent mark, visible focus ring, existing accessible label. Only 9px of the visible close mark lies over the artwork; no viewport overflow.
- Content reserve equals actual creative height and disappears with the dock. Master/page toggles, schedules, privacy-safe analytics, frequency/dismissal scope, route exclusions and focus/keyboard/dialog suppression are unchanged.

## Acceptance evidence
- `scripts/compact-ad-fixed-check.py`: actual DockedAd + BottomNav in a disposable client-only fixture with network-served 840×140px artwork; no saved campaigns and no backend writes. The revised gap test failed against old rendering with **18px** gap.
- 320/390/430/1280, reduced and normal motion, actual top/middle/end/top scroll. Mobile gap **0px**, stable dock position, close center on right border, 44px tapping, no horizontal overflow; all menu targets clickable.
- Mobile heights: **44px / 48.84px / 54.56px**. Desktop: **80px**. Resize/rotation checks: 430×700, 320×844, 667×375 and original viewport; gap ≤2px and height ≤56px throughout.
- Focus and dialogs hide the dock; sensitive route hides it; returning restores eligible placements; dismissal clears content reserve, shortens page and persists only for its intended scope.
- Page manager regression: **560 assertions PASS**. Full Vitest: **246 files / 2,532 tests PASS**. Automatic preview build/type gate: **build OK**; no manual build/typecheck run (harness-owned).
- Screenshot review: 390px mid-scroll and 320px end-scroll, plus desktop; clearly contained art, left Ad, border close and flush menu. Images under `/tmp/browser/compact-ad-fixed/` are synthetic acceptance artwork, not owner campaign examples. User-requested screenshot copies supplied separately.
- Inspected all 37 non-API route files: content routes have their own metadata; three legacy redirect aliases contain no content. No unrelated metadata changes.

## HOLD / limitations
- Production unchanged, placements remain under their existing OFF gates. No feature activation, contracts, reward/payout logic or transactions touched.
- Physical Samsung Internet/MetaMask keyboard and safe-area behavior remain unverified; synthetic resizing is not a physical keyboard test. Existing visualViewport/focus suppression remains heuristic.
- No real campaign was activated for testing; using disposable real-component fixtures is deliberate to honor the no-live-config instruction. Inherited release gates remain HOLD.