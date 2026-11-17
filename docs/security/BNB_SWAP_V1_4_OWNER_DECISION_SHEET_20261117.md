# BNB Swap V1.4 — Owner decision sheet (information only; nothing to sign or pay now)

No decision below is taken, configured or implied. The candidate adapter accepts only 5 or 10 bps as test values and has no chosen recipient.

| # | Decision | Options | Facts available | Unknown / prerequisite |
|---|---|---|---|---|
| 1 | Platform fee on BNB swaps | 5 bps or 10 bps (from output; user minimum enforced after fee) | Simulated 0.01 BNB → USDT at block 134108781: net 5.8782 USDT (5 bps) vs 5.8753 USDT (10 bps), router gross 5.8812 | Competitive comparison vs other DEX front-ends not measured |
| 2 | Fee recipient | A new dedicated BNB Chain EOA (contract recipients are rejected by the candidate) | Router V4 BOT treasury 0xAbe9…75E1 is a BOT-chain decision, not automatically valid on BNB | Owner must name an address and confirm custody on chain 56 |
| 3 | Provider | (a) PancakeSwap V3 direct (candidate path) · (b) 0x Swap API · (c) PancakeSwapX RFQ | (a) public, source-verified router, read-only simulation proven · (b) docs list affiliate-fee params; Standard plan keeps surplus and 0.15% fee on select pairs · (c) docs page 404 | (b) API key, plan, written terms, rate limits, allowance target, BNB pair coverage · (c) endpoint, maker access, terms |
| 4 | Pool fee tier | 500 (0.05%) or 2500 (0.25%) | 500 had ~10 bps round trip vs ~51 bps at 2500 (V1.2, 25 USDT) | Depth at larger sizes over hours/days |
| 5 | Size ceilings | Candidate: ≤1 BNB in, ≤1,000 USDT in | Constants in source | Owner may want lower canary ceilings |
| 6 | Audit | Independent manual Solidity audit before any deployment | 25 synthetic adversarial tests + read-only mainnet simulation | Auditor, scope, budget |
| 7 | Deployment & rehearsal | Separate written authorization required | Nothing deployed | Funded rehearsal wallet on chain 56, gas budget |

Separations preserved: BOT Router V4, MultiSend and reward budgets are unaffected; XAUt (RWA) is not routable by the candidate (USDT/WBNB immutables only) and stays discovery-only.
