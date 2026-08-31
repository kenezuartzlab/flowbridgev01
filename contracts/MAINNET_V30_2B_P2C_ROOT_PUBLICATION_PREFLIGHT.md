# V30.2B P2C — Genesis Canary Root Publication Preflight

**Verdict: PASS — ROOT + GAS FUNDING PREPARED, NOTHING SIGNED**

Mode: read-only. No signature, no broadcast, no root publication, no BOT or FLOW
transfer, no claim enablement. Evidence: `contracts/production/v30-2b-rewards-canary/P2C_ROOT_PUBLICATION_PREFLIGHT.json`
(43/43 checks passed). Script: `scripts/p2c-preflight.mjs` plus the independent
fresh-process rebuild `scripts/p2c-independent-tree.mjs`.

## Reward dataset (rebuilt from canonical evidence)

Chain 677, cutoff block 21,553,131, campaign `MAINNET_GENESIS_CORE_SWAP_CANARY_V1`.
All four canonical `ROUTER_V3_RECEIPT` rows were re-fetched from chain and
re-verified with the exact `SwapExecuted` decoder; each reproduced its canonical
activity id and `chain:tx:logIndex` identity. Placeholder ledger identity was not
used. Deterministic earliest-activity selection yields exactly one recipient.

- Recipient: `0x3d8a7fa490f9db09dd8006b74688213ace9c0164`
- Canonical evidence: `677:0x396b25…c0516:5` (block 20,400,804, txIndex 0, log 5)
- Entitlement: `1000000000000000000` = exactly 1 FLOW
- No points, PTS or USD conversion used.

## Reward tree (deployed encoding)

- Epoch id: **1** — epochs are 1-indexed in the deployed contract (`epochId = ++epochCount`),
  so the leaf domain for the first publication is 1.
- Index 0, single leaf, proof `[]`, total allocation exactly 1 FLOW.
- Leaf/root: `0xe5cf2fb350d37fce3ee74757d19d671d96c69f756f15f3227bdb6d156e8e6456`
- Equality proven three ways: local encoder, on-chain `leafHash()` view, and an
  independent dependency-free rebuild in a fresh process.

## Distributor pre-state (live)

balance 1,000,000 FLOW · campaignBudget 1 FLOW · budgetRemaining 1 FLOW ·
totalReserved 0 · totalClaimed 0 · epochCount 0 · minPublishDelay 86,400 ·
not paused · Root Publisher holds `PUBLISHER_ROLE`.

## Prepared publication call (unsigned)

- Target: `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922`
- Function, derived from the verified deployed ABI:
  `publishEpoch(bytes32 root, uint256 allocation, uint64 claimStart, uint64 claimEnd)`
  selector `0x34b7fe84`
- Allocation `1000000000000000000`; claim window opens 86,400 s after publication
  (a 900 s scheduling margin is added because the contract enforces the delay
  against the execution-time block timestamp; the effective delay is never
  shorter than 86,400 s) and runs 30 days.
- Gas estimate 156,233 · buffered 30 % 203,102 · gas price 20 gwei ·
  required BOT with buffer **0.00406204**
- Root Publisher `0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94`, nonce 0, balance 0 BOT.
- Simulated **from the Root Publisher**: succeeds, returns epochId 1. A
  non-publisher caller reverts.
- Calldata and its keccak are regenerated per run because `claimStart` is
  timestamp-relative; the current values are recorded in the JSON artifact and
  must be re-derived and re-simulated immediately before any future signing.

Expected post-publication state: `epochCount = 1`, `totalReserved = 1 FLOW`,
`budgetRemaining = 0`, `totalClaimed = 0`, Distributor balance unchanged at
1,000,000 FLOW, claim unavailable during the delay, `rewardClaimsEnabled = false`.

## Prepared gas funding (unsigned, separate)

Least-privileged source: deployer EOA `0x8512755699…bCbf3dD` — roleless in the
Distributor and staking system, no FLOW custody, and it consumes no multisig
authority. Treasury/Governance/Operations Safes were rejected for that reason.

- from deployer → to Root Publisher, value `4062040000000000` wei = 0.00406204 BOT,
  data `0x`, nonce 15, gas limit 21,000, gas price 20 gwei.
- Exactly the buffered gas cost: no overfunding, no FLOW.

Nothing was signed or broadcast; no root, epoch, funding or claim activation occurred.
