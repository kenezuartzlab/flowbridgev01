# V32.2 — swap-budget reservation + first allocation round prepared (2026-10-06)

No FLOW was moved by this step. The allocation root is **not published**; the claim
window has not started. Nothing here is signed.

## 1. Budget cap (already executed by the owner)

- Transaction `0x13cdc1ee10bc0320508634ef6c610732dc33b915ccad0920dc1d48168970f030`, block 25738470.
- On-chain campaign budget now **1,005,001 FLOW** (1 already claimed + 1,005,000 approved).
- Governance Safe `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507`, Safe nonce 12 after execution.

## 2. Reservation of the canary entitlement (server-side accounting only)

Applied with the deployed `public.reserve_reward_budget(uuid[], text, text, text)` RPC
(SECURITY DEFINER, service_role only — the browser and the owner's account cannot call it):

- Program: `CORE_SWAP` (approved 3,000 FLOW budget).
- Ledger rows funded: `9dd76b75-7073-445e-b9d8-cfc4b7b67e86` (Router V4 canary, 5 points) and
  `306a91ff-88da-40a3-b822-21e3fe6c32a6` (Router V3 swap, 5 points), both `CORE_SWAP_V2`.
- Result: `outcome CONFIRMED, reserved 10, ledgerRows 2`.
- Reservation ids `7f1e9ae0-6ee0-42d5-883d-4ecd8ea0dea5`, `699bf6db-2b3b-4679-b192-8941eab525ac`.
- Both ledger rows now `funding_state = FUNDED`, `program_id = CORE_SWAP`.
- `reward_budgets` CORE_SWAP: authorized 3,000 · reserved 10 · remaining 2,990.
- Audit row written to `reward_budget_events` with actor `kenezuartzlab@gmail.com`.

## 3. First allocation round (prepared, unsigned)

Prepared by `scripts/liquidity/v321-publish-epoch.mjs`, which rebuilds the manifest from
the FUNDED ledger rows and verifies it against the live distributor before printing
anything.

- Distributor `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922`, canonical FLOW
  `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`, BOT Mainnet 677.
- Epoch **2** (on-chain `epochCount` = 1), 1 leaf: wallet
  `0x628e237b73C5a37EF3968527563fa1a26b32BB97` (kentrosh2002), 10 FLOW.
- Merkle root `0x21c416d3528f5f03381b2011c73622d65da31d6d31e904894f2fb34608f5ec38`.
- Claim window 2026-10-06T12:42Z → 2026-11-05T12:42Z (24 h minimum publish delay applies).
- Calldata `0xc013a9a500000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000006a6979a0000000000000000000000000000000000000000000000000000000006a7570200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000628e237b73c5a37ef3968527563fa1a26b32bb97000000000000000000000000000000000000000000000000000000000000000a`
  (156 bytes, 32-byte selector `0xc013a9a5`).
- Safe transaction fingerprint
  `0x5b88f4d9512545f834647d548119964698d215e87e90f10e02154900c6f26344`; Safe nonce 12.
- Required signatures: 2 of the Governance Safe owners
  (`0x524D…98c5`, `0x145E…2B2B`, `0x0EdF…Bb85`). Treasury Safe and the Router V4
  governance wallet are not substitutes.
- Rebuilt manifest: `contracts/production/v30-2b-rewards-canary/V32_2_EPOCH2_MANIFEST.json`.
- Prepared record: `contracts/production/v30-2b-rewards-canary/V32_2_EPOCH2_PUBLISH_PREPARED.json`.

Pre-flight checks that passed before the data was printed: the contract is not paused,
`epochCount` is still 1, the wallet is not already claimed, the distributor holds enough
FLOW and `totalClaimed + totalReserved + 10 FLOW ≤ campaignBudget`.

## 4. Notes

- The claim window start is derived at signing time from the chain timestamp, so a
  different signing minute only shifts the window; the root and the 10 FLOW are fixed.
- A stray function overload `reserve_reward_budget(uuid, text, jsonb)` created during
  preparation referenced columns that do not exist in `reward_reservations` and was
  never executed. It has been dropped; only the deployed array-form function remains.
- Mainnet public claims remain **LOCKED**. This step opens nothing: only the one
  canary wallet becomes claimable after publication and the 24 h delay.
