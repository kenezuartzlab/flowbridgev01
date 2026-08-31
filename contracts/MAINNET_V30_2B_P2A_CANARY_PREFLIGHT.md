# V30.2B P2A — Genesis Core Swap Canary: Decision Freeze + Reward Preflight

Mode: **READ-ONLY**. No signature, no broadcast, no FLOW movement, no reward root,
no epoch, no publisher funding, no manifest publication, no feature enablement.

Verdict: **BLOCKED — DECISION FROZEN, REWARD SET NOT ESTABLISHED**

Evidence: `contracts/production/v30-2b-rewards-canary/P2A_PREFLIGHT.json`
Script: `contracts/production/v30-2b-rewards-canary/scripts/p2a-preflight.mjs`
Dataset capture: `contracts/production/v30-2b-rewards-canary/dataset-snapshot.json`
Logic + tests: `src/lib/deploy/v302bP2aCanaryDecision.ts(.test.ts)`

## 1. Decision version (prepared, not published)

| Item | Value |
| --- | --- |
| Prior decision version | `V30.1D.4` |
| Prior manifest hash | `fnv1a64:9972234982dbe76f` (unchanged on disk) |
| New decision version | `V30.2B.P2A` |
| New decision id | `REWARDS_GENESIS_CORE_SWAP_CANARY` |
| Decision hash | `fnv1a64:e9a8266bb7581acc` |
| New manifest hash | `fnv1a64:e6e25189723dce79` |
| Campaign id | `MAINNET_GENESIS_CORE_SWAP_CANARY_V1` |
| Chain | 677 |
| Budget / reward | exactly 1 FLOW (`1000000000000000000` wei), 1 recipient max |
| Eligibility source | real finalized `CORE_SWAP` only |
| Winner ordering | blockNumber, transactionIndex, logIndex, txHash — all ascending |
| Eligibility cutoff block | `21553131` |
| Conversions | none (points, PTS, USD, referral, staking, APR all `false`) |
| Publish delay | 86,400 s |

The amendment is **additive**: the historical `REWARDS_LAUNCH_PLAN`
(`launchCampaignBudgetFlow = 0`, hash `fnv1a64:70884004bf65c60f`) is preserved
byte-identical and remains valid audit history; it is superseded only within the
scope of this single canary. Schema validation confirmed no immutable manifest
field changed and exactly one decision record was appended. The already-executed
1,000,000 FLOW funding is recorded as settlement evidence, not a retroactive
owner decision.

## 2. Live distributor pre-state (block 21,553,131)

balance 1,000,000 FLOW · campaignBudget 0 · budgetRemaining 0 · totalReserved 0 ·
totalClaimed 0 · epochCount 0 · minPublishDelay 86,400 · not paused · token =
canonical FLOW · recovery = Treasury Safe. Governance holds `DEFAULT_ADMIN_ROLE`
and `BUDGET_MANAGER_ROLE`; the approved Root Publisher holds `PUBLISHER_ROLE`
and no budget authority; Operations holds `PAUSER_ROLE`.

## 3. Hard stop — no eligible reward set

`verified_activities` contains **zero** chain-677 rows. The only canonical
chain-677 `CORE_SWAP` evidence is four `flow_points_ledger` rows for wallet
`0x3d8a7fa490f9db09dd8006b74688213ace9c0164`, all with
`source_log_index = null`, `verified_activity_id = null` and placeholder
activity keys ending in `:0`.

All four transactions were re-verified live: each is a successful chain-677
transaction from that wallet to legacy Router v3
`0x986962de6F00D0eC571b1a34Fa70AEeB445b5445`, with router logs at index **5**
(first three) and **8** (fourth). The stored `:0` keys therefore contradict the
actual receipt log identity, and no canonical verified-activity record maps any
of them.

All four candidates were rejected fail-closed: *missing actual receipt log
index — canonical log identity unknown*. Zero qualified recipients ⇒ no winner,
no leaf, no Merkle root, no proof, no publish calldata, no reservation. Assigning
1 FLOW to any of these rows would fabricate reward eligibility, which the gate
forbids.

## 4. Governance campaign-budget action (prepared, unsigned)

| Field | Value |
| --- | --- |
| Target | `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922` |
| Function | `setCampaignBudget(uint256)` (derived from verified ABI) |
| Selector | `0x7bc0db46` |
| Calldata | `0x7bc0db460000000000000000000000000000000000000000000000000de0b6b3a7640000` |
| Calldata keccak | `0xd1f0d65e07007de361b6ae180f69cbf2e596d50efba5dd5d5128c3c7098d735f` |
| Authority | Governance Safe `0x88A4…9507`, live nonce 1 |
| Simulation | success from Governance; reverts from the deployer |
| Gas estimate | 52,158 |
| Expected post-state | campaignBudget = budgetRemaining = 1 FLOW; reserved 0; epochs 0; no root; no claims; token balance unchanged |

## 5. Root Publisher gas readiness

`0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94` — nonce 0, balance **0 BOT**, live
gas price 20 gwei. Not funded. `publishEpoch` gas could not be estimated because
no root exists (blocker 3). Any BOT top-up from the Treasury Safe requires a
separate owner approval.

## 6. Invariants held

Claims impossible (no epoch) · no root · no oracle/publisher activation · no
staking activation · no chain 968/1024 data in the dataset · no conversion rule
introduced · 26 of 27 live checks passed, the single failure being the required
hard stop above.

## 7. Blockers to clear before a payable canary

1. A canonical chain-677 verified-activity path must exist so that a
   `CORE_SWAP` carries chain + tx hash + **actual** receipt log index, and the
   ledger row is bound to that verified activity id (legacy Router v3 on 677 has
   no canonical verified-swap event configuration today; only chain 968 /
   Router V4 does).
2. Backfilled or newly captured rows must reproduce the real log index (5 / 8
   above), replacing the `:0` placeholder keys.
3. Root Publisher requires BOT gas before any publication attempt.
