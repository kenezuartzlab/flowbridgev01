# P4B.3 Owner Decision — FLOW/USDT 1% Liquidity Increase (RECORDED, NOT EXECUTED)

Recorded: 2026-09-28T23:51Z (owner instruction). Mainnet writes: 0.

## Approved parameters
- Liquidity budget: 50,000,000 FLOW total committed cap
- Strategy: Layout C (wide base + medium defensive range + narrow trading range)
- Additional FLOW: ~43,411,700 FLOW (cap minus already-committed pool FLOW)
- Additional USDT: ~6,191.56 USDT (paired per exact V3 math)
- Wide range: existing position unchanged
- Medium range: 10% of additional FLOW
- Narrow range: 90% of additional FLOW

## Unchanged / still frozen
- Oracle: 0x0000000000000000000000000000000000000000
- Dynamic/Standard staking: DISABLED
- EPOCH_ROLE / PUBLISHER_ROLE: unassigned
- 7-day TWAP: still accumulating until 2026-10-05T06:53:55Z (first retained
  post-cardinality observation 2026-09-28T06:53:55Z)

## Expected outcome (from P4B3_RANGE_OPTIMIZER.json, block 24818243)
- 30% manipulation cost (cheaper direction): ~$1,446-class protection at 50M cap
  (vs ~$778 baseline); both ±30% moves remain covered by active liquidity.

## Status
DECISION RECORDED. No liquidity transaction has been prepared, signed, or
broadcast. Execution requires a separate explicit authorization with the exact
mint calldata, simulation PASS, and one wallet transaction per position.
