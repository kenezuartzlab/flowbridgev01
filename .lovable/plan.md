# FlowBridge V3 — Archon polish pass

## 1. Token icons: consistent + real logos

- Rewrite `TokenIcon` as the single source of truth with fixed size presets (`sm 24 / md 32 / lg 40`) so Home, Wallet, Markets, pickers and modals all render identical circles.
- Add a token logo registry: local PNGs for CA and BOT, remote CDN logos (Trust Wallet / CoinGecko static assets) for USDT, USDC, BTC, ETH, BNB, TRX. Graceful chain: remote logo → local asset → lettered circle. No layout shift (fixed box, `object-contain`).
- Add BTC (and other majors) to the market/asset list so they can be displayed, with a search + chain filter on Markets and on the Wallet asset list.

## 2. Headers and hero cards

- Home greeting font size raised and clamped so long names stay readable (no shrink-to-invisible).
- Each of Home / Wallet / Rewards / Account gets a distinct gradient + glassmorphic hero card, themed for both light and dark:
  - Home — emerald→teal (FLOW balance)
  - Wallet — indigo→violet (total balance)
  - Rewards — amber→rose (points & streak)
  - Account — slate→cyan (profile / pass)
- Each hero gets a relevant asset-kit illustration (flowbridge, vault, trophy, badge) as a soft watermark plus small inset stat tiles.

## 3. Swap menu → Account settings

- Remove the crowded dropdown menu from the swap header; keep only wallet + theme.
- Move its links into Account, grouped: Trade (Swap, Markets, Bridge), Earn (Rewards, Referrals, Games, Partners), History (Activity, Receipts), Support (Docs, Donate, Socials), Preferences.

## 4. Account settings — make each row actually work

- Language: applies a stored locale to all number/date formatting.
- Currency: stored preference used by the shared `formatUsd` helper (with FX rate table).
- Referrals: real referral code + copy/share.
- Wallet QR: opens the Receive sheet directly.
- Export: choose JSON or CSV, and choose Profile and/or Transactions.
- Profile edit: display name + avatar URL saved to the backend profile.

## 5. Games

- Remove Mystery Box entirely.
- Add an Archon-style leaderboard (rank, avatar, name, points, your-rank highlight) fed by play points.
- Clear labelling: Play points are demo-only — not claimable and not convertible yet.

## 6. Send / Receive

- Send: QR scan button on the recipient field using the device camera (`BarcodeDetector` with a jsQR fallback), parses plain addresses and `ethereum:` URIs.
- Receive: one-tap share (Web Share with QR image file when supported, otherwise address copy) and a QR PNG download.

## 7. Layout audit

- Sweep Home, Wallet, Rewards, Account, Games, Partners, Markets, Activity for dead links, duplicated entry points and inconsistent spacing; unify on the shared `PageHeader` / `AppTopBar` and card radii.

## Technical notes

- Frontend-only except: profile display-name update and referral code read (existing backend endpoints), and adding BTC/majors to the market list.
- Theme-safe: all new gradients defined as tokens in `src/styles.css` with light/dark variants — no hardcoded color utilities.
- Currency/locale preferences live in the existing `fb_prefs_v1` store, read through a small `usePrefs` hook so formatting stays consistent app-wide.
