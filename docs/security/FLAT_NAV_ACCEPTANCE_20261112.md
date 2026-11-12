# Flat uniform mobile bottom nav — acceptance (2026-11-12)
Owner-directed: Trade is a normal tab (no raised bump, negative margin or transform). All five tabs share icon size (28px box/17px icon), hitbox, centreline and label baseline; Trade active state = green indicator/tint like the others.
Compact ad: Trade cutout (clip-path + measurement) removed; straight uninterrupted bar flush (0–2px) above nav top border; right-edge 44px close; fixed at scroll top/middle/bottom.
Evidence: scripts/compact-ad-fixed-check.py — new assertions (no raised control, identical icon/label/row boxes, clip-path none, every tab hit-testable at centre). Old code: FAIL. New code: 3,786 assertions PASS at 320/390/430/1280, reduced/normal motion, ads ON/OFF nav geometry identical. Vitest 2,532 PASS; build OK.
Not done: no publication, config, payout, contract or wallet changes. Release remains HOLD; physical-device check pending.
