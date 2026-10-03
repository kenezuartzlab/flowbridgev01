# Production Operations + Growth Intelligence V1

Read-only operations layer built on the existing privacy-safe trade telemetry, the existing Router V4 health checks and existing verified user/activity records. No contract writes, no Mainnet liquidity writes, no change to routing or scoring.

## What gets built

1. **Internal Operations page** at `/sets/operations` (behind the existing admin gate), desktop-first and still usable at 390px. Tabs:
   - **Overview / Status**: Web App, BOT RPC, BNB RPC, Router V4, Router V3, BDEX V3, BDEX V2, CaSwap, Activity Indexer, Rewards, Staking, MultiSend. Each status is OPERATIONAL / DEGRADED / UNAVAILABLE / UNKNOWN and comes from a live check. UNKNOWN is never shown as healthy. Also shows fee, owner, treasury, latest confirmed swap and recent failure count.
   - **Router V4 Monitor**: compares expected and actual owner, treasury, global fee (0 bp), BDEX V3 fee (1 bp), BDEX V3 active, unpaused and Lens target. Any mismatch shows CONFIGURATION DRIFT with the expected value, actual value and timestamp. Nothing is repaired automatically.
   - **Trade Funnel**: Quote Requested → Route Found → Review Opened → Signature Requested → Submitted → Confirmed, with conversion between each stage. A separate outcome table lists cancelled, quote expired, insufficient balance, wrong network, simulation failed, RPC failure, minimum-output failure and on-chain revert. Cancellation is counted as a user choice, not a technical failure. A trade only counts as confirmed when a chain receipt confirms it.
   - **Route Analytics + Atomic V4**: breakdown by network, token pair, DEX, route type, atomic/staged and mobile/desktop. Shows quotes, simulations, confirmed and reverted trades, and average confirmation time for the approved native BOT ↔ BDEX V3 routes only.
   - **Liquidity Gaps**: combined demand for "No liquidity route yet" by network and pair. Shows the DEXs checked, whether a direct pool or multi-hop route exists, the missing connection where known, the last checked time, and a class of DIRECT / ATOMIC / STAGED / NO ROUTE.
   - **Token Demand**: most selected, quoted, unavailable and completed pairs. These are usage counts only, with no "best" or "recommended" labels.
   - **DEX Health**: BDEX V3, BDEX V2 and CaSwap, each with router, contract code check, quote status, recent use and failures, and capability labels. CaSwap add/create stays UNAVAILABLE — LP_NOT_ALLOWED.
   - **Journey + Verification**: visitor → explore → connect wallet → account → verify email → bind wallet → first swap → first Earn exploration → first verified activity. Verification and binding CTA shown/opened/completed. Counts come from existing account and verified-activity records plus aggregate events.
   - **Engagement / Earn / AI**: meaningful actions only, kept separate per area (Liquidity Fees, Staking, Campaigns, FLOW Points, Learn, Smart AI categories). No merged yield figure.
   - **BOT Chain Support**: FlowBridge-attributed confirmed activity (Router V4/V3 swaps, MultiSend, staking, claims, verified campaign events), kept separate from general chain activity.
   - **Indexing Health**, **Errors** (grouped QUOTE/RPC/SIMULATION/WALLET/APPROVAL/SIGNATURE/ON-CHAIN REVERT/INDEXING/UI/UNKNOWN, with count, first/last seen, network, route class and resolved state), **Alerts** (informational only) and **Growth Opportunities** (phrased as OBSERVED SIGNAL → POSSIBLE PRODUCT ACTION).
   - Period selector: Today / 7d / 30d, with exact date ranges. A period is labelled PARTIAL DATA when telemetry started inside it. Nothing is extrapolated.

2. **Event coverage**: extend the existing trade telemetry with route-found, review-opened, signature-requested, no-route pair and route-quality fields (amounts as bucketed or relative values, fees, gas, price impact, tx count). Add one small product-event stream for journey, verification, binding, engagement and AI categories. The events are pseudonymous: there is no wallet address, email, signature or conversation text. Deduplication uses a random per-browser ID.

3. **Router V4 delay proposal** (document only): delay options, affected operations, effect on the active BDEX V3 registration, emergency implications, governance steps, and rollback. Nothing is applied.

## Technical details
- New tables `product_events` and `liquidity_gap_observations`, plus new nullable columns on `trade_operational_events` (pair symbols, stage, quality metrics). All have RLS, deny public reads and are written only through validated server routes. Admin reads go through the `requireAdmin` gate.
- Pure aggregation module `src/lib/ops/` (funnels, gaps, demand, drift, status, alerts, period/partial logic, redaction), fully unit tested. Admin API route `/api/admin/ops` returns aggregates only.
- Live checks reuse `routerV4Health.ts` and add read-only `eth_getCode`/block checks for RPCs and DEX routers.
- Tests are added for every item in section 26; existing tests are not changed.
- Mobile check at 390px on Swap, Liquidity, Earn, Activity, onboarding and Smart AI.
- Zero contract, Router or registry-delay writes. Mainnet liquidity stays disabled.

## Honest limits
Historical funnel data starts only when the new events go live, so earlier periods will show PARTIAL DATA and low counts until real traffic arrives.
