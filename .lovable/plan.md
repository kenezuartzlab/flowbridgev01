# FlowBridge Add-Ons Plan

Honest review first, then scoped implementation.

## Expert Review

**1. Markets page — YES, high value.** Keeps users on-app instead of jumping to Dexscreener/Gecko. Great SEO surface (new indexable route with per-token pages later). Low risk.

**2. Fortune Wheel — YES, but with guardrails.** Great retention hook. Must be:
- Server-authoritative (spin result decided on server, never client) or users will exploit it.
- Rate-limited per verified account (not per wallet — sybil).
- Points sink accounted for in FLOW economics (jackpot 50 × N users/day is real emission).

**3 & 4. Ecosurge / ArcadeFlix "Soon" tiles — YES, cheap.** Just menu entries + teaser routes. Good for signaling roadmap.

**Custom token "no liquidity" issue — real bug, must fix.** Current `hasAnyLiquidity` in `src/lib/swap/quoter.ts` only checks hardcoded WBOT/USDT pairs on known routers. Any token whose LP lives on a router we don't scan (or paired with something other than WBOT/USDT) fails. Fix = auto-discovery across every registered router's factory using `getPair` / `getPool`, across a small base-token set (WBOT, USDT, CA), and cache the discovered path so the swap uses the correct routerId automatically.

## Scope for this build

Do **1 + 4 (menu tiles) + LP auto-detection** now. Wheel (#2) I'll plan but ship in a follow-up because the server/economy piece deserves its own review turn — flagging so we don't half-ship a points exploit.

### A. Dynamic LP discovery for imported tokens
File: `src/lib/swap/quoter.ts`, `src/lib/swap/tokenRegistry.ts`
- Add `discoverBestPath(tokenAddr, isMainnet)`:
  - For each router in a `ROUTERS` registry (CaSwap v3, BDex V2, BDex V3, FlowBridgeRouter), call the factory/quoter to see if a pair/pool exists vs {WBOT, USDT, CA}.
  - Return `{ routerId, path, baseToken }` for the deepest pool (compare reserves / `quoteExactInputSingle`).
  - Cache to `localStorage` keyed by `${chain}:${token}`.
- Replace `hasAnyLiquidity` check in `TokenPickerModal` import flow with `discoverBestPath` — accept the token if any path is found; store the discovered route on the Token record.
- `UniversalSwapCard` reads the stored route for imported tokens instead of guessing.

### B. Markets page `/markets`
Files: `src/routes/markets.tsx` (new), `src/lib/markets/*` (new), menu entry in `AppHeader.tsx`.
- Sections:
  1. **BOT Chain tokens** (top): BOT, WBOT, USDT, CA + any imported tokens with discovered LPs. Price from on-chain quoter (already have `getLiveBotPrice`, `getLiveCaPrice`). 24h change from a lightweight time-series stored in Supabase (`token_price_snapshots` table, populated by existing keeper tick every 5 min).
  2. **Other chains** (below): ETH, BNB, TRX + top 10 tokens each from CoinGecko free API (`/coins/markets?vs_currency=usd&category=…`), 60s client cache. No API key needed.
- Filters: chain chip row (All / BOT / ETH / BSC / TRON), search box, sort by price/24h%/mcap.
- Rows: icon, symbol, name, price ($ via existing `formatUsd`), 24h %, mini sparkline (SVG, no lib), "Trade" button (BOT tokens link to swap tab prefilled).
- SEO: proper `head()` with title/description/og. Table is semantic `<table>` for crawlability.

### C. Menu additions in `src/lib/layout/AppHeader.tsx`
- **Markets** → `/markets`
- **Fortune Wheel** → `/fortune` (renders "Coming this week" teaser for now; wired in next turn with server RNG)
- **Ecosurge Growth Hub** → `/ecosurge` (soon teaser)
- **ArcadeFlix P2E** → `/arcadeflix` (soon teaser)
- Each teaser route is a small file with hero + email-capture (reuses existing Supabase `waitlist` pattern if present, else just a "Notify me" storing to a new `product_waitlist` table).

### D. Fortune Wheel (planned, not built this turn)
Sketch so we agree before I build:
- Table `wheel_spins(user_id, day, spin_no, prize, tx_id)` unique on `(user_id, day, spin_no)`.
- Server fn `spinWheel()` under `requireSupabaseAuth`: enforces ≤2 spins/day, RNG server-side with weighted table you approve, awards to `flow_points_self` bucket. Client only animates the pre-decided prize.
- Anti-abuse: requires verified email AND bound wallet (reuse existing gates).

## Technical notes (skim)

- Reuse existing pricing utils; don't add a new price lib.
- CoinGecko free tier = 10-30 req/min; cache aggressively, batch by `ids=`.
- Sparklines: 24 points, inline SVG polyline, no chart lib.
- No changes to bridge/swap logic beyond the LP discovery hook.

## Deliverables this turn

1. LP auto-discovery in quoter + token import flow.
2. `/markets` page with BOT-chain (on-chain) + other-chains (CoinGecko) sections, filters, search, sort.
3. Menu entries for Markets, Fortune Wheel (soon), Ecosurge (soon), ArcadeFlix (soon) with placeholder routes.

Confirm and I'll build. If you want Fortune Wheel fully live in the same turn, say so and I'll include the server RNG + table.
