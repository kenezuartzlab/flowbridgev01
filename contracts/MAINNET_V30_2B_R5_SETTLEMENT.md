# FlowBridge V30.2B R5 — Staking Controller Settlement (BOT Mainnet 677)

Verdict: **R5 SETTLED — FlowStakingController live, economically inert, publicly verified**

| Field | Value |
| --- | --- |
| Tx hash | `0xe149da164d6cca7c9fdc9fe4e92afdf5817d431a0faf56a7327bf4bc781e37b6` |
| Receipt status | success (block 21,508,267) |
| Address | `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF` (matches predicted) |
| Nonce used | 13 |
| Gas used / limit | 2,142,607 / 2,809,012 |
| Explorer | https://scan.botchain.ai/address/0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF |

## Runtime parity

On-chain runtime is 7,997 bytes — the same length as the frozen artifact — and differs in
exactly **4 bytes at offset 1060**, the packed `immutable year1Start` slot
(`0x00000000` in the compiler artifact, `0x6a947879` = 1,788,115,065 on chain, equal to the
deployment block timestamp and to `year1Start()`). Masking that immutable slot makes the two
byte-identical. Frozen `408ee63a…c95a250`; on-chain `703f5f5c…f33b9ad0` (immutable-included).

## Authority

Governance `0x88A4CC1F…ce9507` holds `DEFAULT_ADMIN_ROLE` and `GOVERNOR_ROLE`.
`PUBLISHER_ROLE` is unassigned (not Governance, not the zero address, not the deployer).
The deployer holds no role.

## Inert economic state

`vault == address(0)`, `oracle == address(0)`, `maxFlowPerEpoch == 0`, `weeklyUsdBudget8 == 0`,
`epochEnd == 0`, `epochCommitted == 0`, `genesisYear1Used == 0`, `standardYear1Used == 0`,
`emergencyMode == false`. No usable staking or emission path exists.

## Product matrix (read on chain, exact match to frozen matrix)

| id | lock (s) | genesis | floor | target | hard cap | min principal | active |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 18% | 0% | 10% | 12% | 1 FLOW | true |
| 1 | 2,592,000 | 27% | 8% | 14% | 18% | 1 FLOW | true |
| 2 | 7,776,000 | 36% | 10% | 18% | 24% | 1 FLOW | true |
| 3 | 15,552,000 | 48% | 12% | 24% | 32% | 1 FLOW | true |
| 4 | 31,536,000 | 60% | 15% | 30% | 40% | 1 FLOW | true |

Year-1 ceilings on chain: `GENESIS_YEAR1_CAP` 1,000,000 FLOW, `STANDARD_YEAR1_CAP` 2,000,000 FLOW,
`TOTAL_YEAR1_CAP` 3,000,000 FLOW.

## Public source verification

Verified from the frozen non-viaIR standard-JSON package: `FlowStakingController`,
`v0.8.24+commit.e11b9ed9`, optimizer 200, EVM cancun, viaIR false.

## Withheld in this action

No R4 role wiring, no 50,000 FLOW epoch cap, no oracle configuration, no publisher assignment,
no R6 deployment, no FLOW funding.

Evidence: `contracts/production/V30_2B_R5_SETTLEMENT.json`, `contracts/production/v30-2b-controller/`.
