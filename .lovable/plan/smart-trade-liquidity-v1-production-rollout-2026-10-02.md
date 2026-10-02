# Smart Trade + Liquidity V1 Production Rollout

## Scope and safety boundaries
- Keep Router V4 and Router V3 frozen; perform no contract or Mainnet liquidity writes.
- Keep V4 atomic execution limited to the proven BOT Mainnet native BOT ↔ BDEX V3 multi-pool class.
- Keep every unsupported mixed route staged and preserve CaSwap as an independent venue.

## Implementation
1. **Canonical production health**
   - Correct stale Mainnet deployment metadata without widening route flags.
   - Add a read-only health checker for Router V4 code/configuration, Lens binding, owner, treasury, pause state, WBOT, BDEX V3 registration/activity, and effective/global fees.
   - Surface configuration drift as a visible operational warning; never auto-correct chain state.

2. **Quote and execution safety**
   - Capture an immutable review snapshot and invalidate it when route, output, minimum received, protocol fee, execution class, network, or token addresses change.
   - Re-quote and simulate immediately before each economic signature.
   - On atomic V4 failure, show the required no-auto-resubmit message and return the user to review with retry/alternate-route choices.
   - Preserve staged per-leg re-quoting, expose all approvals/legs/outputs/gas/fee behavior before signing, and retain partial progress without marking incomplete routes successful.

3. **Observability and recovery**
   - Add privacy-safe telemetry for quote timing/outcomes, selected route/DEX, atomic/staged classification, transaction count, simulation, wallet rejection, submission, receipt status, stale quotes, RPC, allowance, balance, minimum-output, and unavailable-route failures.
   - Store no signatures, secrets, full wallet addresses, or unnecessary wallet metadata.
   - Distinguish retryable provider failures and stale data from genuine zero balance, no position, or no liquidity.

4. **Activity, liquidity, Earn, and AI integrity**
   - Ensure swap and liquidity statuses come from receipts, with staged operations grouped while retaining every hash.
   - Keep Mainnet liquidity writes disabled and disclose CaSwap public-wallet add/create as unavailable rather than broken.
   - Preserve chain-derived My Positions, separated Earn categories with no combined/fabricated APY, and evidence-bound AI explanations.

5. **Verification and rollout evidence**
   - Add focused tests for health drift, telemetry privacy, quote invalidation, RPC recovery, receipt status, staged grouping, and no atomic fallback.
   - Run read-only BOT Mainnet checks for the required Router V4/Lens/V3/BDEX V3/CaSwap/FLOW/Activity matrix.
   - Re-run production acceptance at 390px, including wallet/network/selectors/review/confirmation/Activity/Liquidity/Positions/Earn/keyboard/bottom navigation.
   - Run the complete app suite, 13-test liquidity harness, typecheck, and production build; report PASS only when every release blocker is clear.

## Technical details
- Centralize route lifecycle events and review fingerprints in pure modules so they are unit-testable and cannot authorize transactions.
- Use an anonymous, validated server endpoint and a dedicated least-privilege table for operational events; analytics failures never block trading.
- Keep contract-health reads fail-closed and read-only through the canonical BOT Mainnet RPC configuration.
- Preserve the existing `executionCapability` boundary and `LIQUIDITY_WRITES_ENABLED` gate.
