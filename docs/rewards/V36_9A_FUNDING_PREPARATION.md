# V36.9A — read-only Core Swap funding preparation

Observed 2026-10-19 06:51 UTC, BOT Mainnet 677 block 27,210,984. No funding, budget, profile, reservation, batch, audit or chain records changed. No transaction signed or sent.

## Reconciliation

- Previous raw pending 5,609 = 3,786 Testnet + 1,823 Mainnet unfunded swap Points. The previous report incorrectly treated Testnet Points as Mainnet liability.
- Ops Budgets earned 724 = 714 unfunded + 10 previously funded, because that reader selects only rows explicitly labelled CORE_SWAP. It omits 1,109 Mainnet unfunded Points with null program_id.
- Actual Mainnet swap earned: 1,833 = 1,823 unfunded + 10 funded and allocated in claimed round #2.
- All 26 positive Mainnet rows (25 Router V3, one Router V4) pass receipt decoding, actor/activity/amount/log identity, canonical block/finality, bound-wallet match, FLOW_POINTS_V2, verified-USD award and daily-cap checks. There are 24 unfunded positive rows. No duplicate canonical activities or bound wallets. All 25 funded reward reservations match their ledger identities, wallets, programs and amounts.
- Funding-ready subset: **1,047 FLOW / 14 ledger rows / six accounts**, comprising 484 Points currently without program labels and 563 explicitly labelled CORE_SWAP. The existing reservation RPC can attribute null-program rows to CORE_SWAP; this has NOT been called.
- Remaining **776** receipt-verified Mainnet swap Points belong to an account whose existing classification is REVIEWED_NONCLAIMABLE_HISTORICAL. Keep them UNFUNDED pending a separate reviewed-account decision; do not implicitly lift that gate.

## Privacy-safe account categories

| Category | Accounts | Swap earned each | Funding proposal each | Funded unallocated before → after | Previous allocation each |
| --- | ---: | ---: | ---: | --- | ---: |
| Reviewed historical account | 1 | 776 | 0 | 299 → 299 | 1 |
| Previously settled clean account | 1 | 10 | 0 | 100 → 100 | 10 |
| Clean threshold-crossing account | 1 | 1,022 | 1,022 | 100 → 1,122 | 0 |
| Clean small earners | 4 | 5 | 5 | 100 → 105 | 0 |
| Clean referrer/small earner | 1 | 5 | 5 | 500 → 505 | 0 |

No account identifiers, emails or wallets are included. Recorded totals are not entitlement.

## Backing and ceilings

- CORE_SWAP ceiling 1,000,000; reserved 10; funding_verified false. Signup ceiling 1,000,000, reserved 2,300, funding verified. Milestones ceiling 2,000, reserved 0, funding unconfirmed.
- Live campaignBudget **2,002,011 FLOW**, remaining capacity **2,002,000 FLOW**. Already effective: **do not repeat setCampaignBudget**.
- Payout balance/freeBalance **2,499,989 FLOW**; on-chain unclaimed reservations **0**; totalClaimed **11 FLOW**; two epochs, unpaused.
- Retain all 2,300 signup reservations including the 300 wallet-mismatch Points; exclusion is not reservation release. The 10 Core Swap reservation Points were already paid and must not be subtracted again from today's balance.
- Free after existing unallocated off-chain reservations: **2,497,689 FLOW**. After the proposed 1,047 reservation: **2,496,642 FLOW**. Conservatively assigning backing to all three full program ceilings leaves **497,989 FLOW** surplus; no cross-program use or transfer is needed.
- Proposed Core Swap reserved total: **1,057 FLOW**; remaining Core Swap ceiling **998,943 FLOW**.

## Preservation and blockers

- Historical holds, unsupported stored Points and existing wallet exclusions unchanged. Current canonical hold exclusions are **250 Points: 200 August + 50 October**, not a complete current total of 150. The earlier 150-held/25-unsupported explanation must not be mistaken for the global classifier output or authorization to release any history.
- Signup: 2,000 Points pass current attribution; 300 wallet-mismatch Points remain excluded but reserved. Both historical rounds' roots, allocations and isClaimed flags were independently checked: round #1 paid 1 FLOW; round #2 paid 10 FLOW.
- Global reconciliation is not wholly PASS: one legacy 50-Point stored balance is classified UNEXPLAINED_POSITIVE_DIFFERENCE. It has no authoritative Mainnet entitlement and is excluded from this proposal and candidate. Do not create balancing rows.
- Display parity is not PASS: Ops Budgets currently omits null-program swap history, while the solvency report counts it. Home/Rewards/Profile and Flow AI use canonical progression/summary; Referrals separately reports recorded award evidence/funnel. An identical named balance must not be inferred from these unlike metrics. No application correction or publication was authorized or performed in this preparation.

## Conditional Round #3 result

With only the 1,047-Point clean subset funded, **one wallet** reaches 1,000 funded eligible unallocated Points: **1,122 FLOW**, consisting of 1,022 swap + 100 eligible signup Points. No other wallet qualifies. Current Round #3 remains blocked because this proposal is not applied.

The pure settlement builder reproduced an unsigned one-leaf candidate and verified proofs, duplicate guards, minimum, chain, role, capacity and balance checks. Its exact publishEpoch call passed live read-only eth_call. The hypothetical candidate was not saved, published or signed. Publisher holds PUBLISHER_ROLE and no extra distributor role. Autonomous signing remains OFF. Existing durable receipt/recovery and queue logic are unchanged.

Targeted regression: **206 tests / 18 test files passed** (reconciliation, policy, signup, both present router evidence test suites, presentation, funding, queue, settlement, authorization, receipt recovery and budget controls). Current automatic build signal: build OK. No fresh security scan, physical wallet test or production publication claimed.

## Approval requested — not granted or executed

1. Approve exactly **1,047 FLOW** of off-chain CORE_SWAP reservations for the verified 14-row clean subset, with fresh evidence revalidation, atomic reservation and evidence-linked funding confirmation. This also attributes its null-program rows to CORE_SWAP. Funding verification alone must never be represented as claimability.
2. Any funding/reclassification of the separate **776 Points** requires an additional explicit decision respecting existing historical holds; not included here.
3. Payout publication remains a separate authorized publisher-wallet review/signature after funding, live rebuild, limits, simulation and receipt checks. Budget approval is not funding approval or publication approval.

Private temporary frozen clean-subset snapshot SHA-256: `b8d240fd5ea1546202a48ffb3dc1bca6e4fb11e0ddd424b6d2a283f317e8b34c`. The hash is evidence linkage, not authorization; the current records must be re-read and revalidated before a later approved funding operation.