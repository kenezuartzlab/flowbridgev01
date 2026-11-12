# Compact ad / mobile navigation regression acceptance

Date: 2026-11-12. Scope: preview-only presentation correction following c3df0f3b. Release: **HOLD**.

## Actual cause and RED evidence

The global rule `html:has(.compact-ad-dock) .compact-ad-nav-trade { margin-top:0; }` removed the existing `-mt-4` raised-control margin. The center link grew from 52.25px to 68.25px, causing the stretched navigation row to grow by 16px. The other items moved upward while Trade's label remained lower. The compensation spacer was not the cause.

Before modifying application code, the augmented `scripts/compact-ad-fixed-check.py` failed against c3df0f3b at 320px:

| Measurement | Ad OFF | Ad ON before fix |
| --- | ---: | ---: |
| Nav top, 844px viewport | 782.75 | 766.75 |
| Nav height | 61.25 | 77.25 |
| Center link height | 52.25 | 68.25 |
| Other label top | 821.75 | 805.75 |
| Trade label top | 821.75 | 821.75 |

RED failure: `('activation', 'nav[aria-label="Main navigation"]', 'y', 782.75, 766.75)`.

## Narrow correction

- Remove the ad-dependent navigation CSS override. BottomNav's OFF design, dimensions, five-item layout, raised 44px Trade icon and labels are unchanged.
- Preserve the slim fixed portal, flush to the measured navbar border. To reconcile flush placement with the existing raised Trade control, cut out only the small lower creative area behind that control (measured icon bounds plus 4px clearance). The surrounding ad container is pointer-transparent; clipped creative pixels cannot intercept Trade. Artwork remains contained, not stretched; this small lower cutout can conceal artwork pixels behind Trade.
- Preserve the far-right 44px close target and disclosure. Desktop remains bottom-docked without a cutout.
- Reserve changes remain exclusively on the existing noninteractive scroll-content spacer, never navbar positioning, nav height, nav padding or body transforms.
- Existing master/page switches, schedules, frequency/dismissal rules, sensitive-route exclusions, focus/keyboard/modal suppression and analytics code are unchanged.

## GREEN verification

- Full suite: **246 files / 2,532 tests PASS**.
- Actual-component router regression: **3,750 assertions PASS**, 320/390/430/1280px, both reduced/no-preference motion. Compares navigation, each link, center icon and labels OFF/ON/dismissed within <=1px, top/middle/bottom scrolling, route suppression/return, keyboard/modal suppression, 430x700, 320x844 and 667x375 resize/activation. Fixed body portal, flush placement, overflow, close boundary and clickable controls checked.
- Independent placement-manager regression: **560 assertions PASS**; master, per-page, page/global scope, sensitive routes, Trade tabs/referrals, single placement and admin manager preserved.
- Real `/home` screen: 320/390/430x844 and 1280x1800, reduced motion, Samsung-like Android user agent. Browser-memory-only config override using existing public artwork; no saved campaign/config. Welcome walkthrough dismissed through UI. OFF/ON/dismissed and top/middle/bottom navigation geometry **identical (0px delta)**. Mobile nav height 61.25px, nav top 782.75px, Trade icon unchanged. Raised icon hit-testing and AI launcher click trial PASS. No horizontal overflow or page errors. Desktop mobile nav remains hidden and existing desktop header is not incorrectly treated as fixed.
- Latest automatic preview build/type gate: **build OK**, 2026-11-12T04:37:46Z. No manual build/typecheck commands (harness-owned).
- Existing content-route metadata inspected, including index; no metadata changes needed.

Screenshots inspected: real Home 320px OFF and bottom-scroll ON, 390px middle-scroll ON and 1280px desktop ON; actual-component 320px RED and 390px GREEN. Evidence copies supplied with this acceptance.

## Limits and HOLD

Samsung-like Chromium viewport/user agent is not physical Samsung Internet or a wallet in-app browser. Actual device keyboard, safe-area and browser chrome acceptance remains unverified. The inherited release gates in roadmap.md remain HOLD. No publication, live configuration write, feature activation, auth/financial/contract/wallet logic change, signature or transaction occurred.

Preview: https://id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app/home

Commit: the commit containing this report (recorded in delivery).