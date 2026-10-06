# V32.2 — swap-budget reservation + first allocation round prepared (2026-10-06)

No FLOW was moved by this step. The allocation root is **not published**; the claim
window has not started. Nothing here is signed or broadcast.

## 1. Budget cap (already executed by the owner)

- Transaction `0x13cdc1ee10bc0320508634ef6c610732dc33b915ccad0920dc1d48168970f030`, block 25738470.
- On-chain campaign budget now **1,005,001 FLOW** (1 already claimed + 1,005,000 approved).
- Governance Safe `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507`, Safe nonce 12 after execution.

## 2. Reservation of the canary entitlement (server-side accounting only)

Applied with the deployed `public.reserve_reward_budget(uuid[], text, text, text)` RPC
(SECURITY DEFINER, service_role only — the browser and the owner's account cannot call it):

- Program: `CORE_SWAP` (approved 3,000 FLOW budget).
- Ledger rows funded: `9dd76b75-7073-445e-b9d8-cfc4b7b67e86` (Router V4 canary, 5 points,
  evidence `677:0x96942495…68dd`) and `306a91ff-88da-40a3-b822-21e3fe6c32a6` (Router V3 swap,
  5 points, evidence `677:0xe7985c94…af6a`), both reason `CORE_SWAP_V2`.
- Result: `outcome CONFIRMED, reserved 10, ledgerRows 2`.
- Reservation ids `7f1e9ae0-6ee0-42d5-883d-4ecd8ea0dea5`, `699bf6db-2b3b-4679-b192-8941eab525ac`.
- Both ledger rows now `funding_state = FUNDED`, `program_id = CORE_SWAP`.
- `reward_budgets` CORE_SWAP: authorized 3,000 · reserved 10 · remaining 2,990.
- Audit row written to `reward_budget_events` with the owner's actor email and reason.

## 3. First allocation round (prepared, unsigned)

Record: `contracts/production/v30-2b-rewards-canary/V32_2_PUBLISH_TX_PREPARED.json`
(generated 2026-10-06T12:28:24Z from `src/lib/rewards/mainnetEpochDraft.ts`, the single
source of truth for the manifest).

- Distributor `0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922`, canonical FLOW
  `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`, BOT Mainnet 677.
- Epoch **2** (on-chain `epochCount` = 1 at preparation), 1 leaf, index 0:
  wallet `0x628e237b73C5a37EF3968527563FA1a26b32BB97` (kentrosh2002), **10 FLOW**
  (`10000000000000000000` wei).
- Merkle root `0x21c416d3a1dc9da9b7bab9d4d97668598713e5419b0d7fb3aa055705f090c860`.
  Recomputed independently from the contract's leaf encoding
  `keccak256(keccak256(abi.encode(chainId, distributor, epochId, index, account, amount)))`
  and it matches exactly; with one leaf the root *is* the leaf hash, proof `[]`.
- Claim window 2026-10-08T12:42:49Z → 2026-11-07T12:42:49Z
  (`claimStart` 1791463369, `claimEnd` 1794055369; the contract's 24 h minimum publish
  delay is what forces the gap).
- Function `publishEpoch(bytes32,uint256,uint64,uint64)` — selector `0x34b7fe84`,
  independently reproduced from the signature.
  Calldata `0x34b7fe8421c416d3a1dc9da9b7bab9d4d97668598713e5419b0d7fb3aa055705f090c8600000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000a`
  (as recorded in the JSON), value 0, gas estimate 139,065 (buffered 180,784 at 20 gwei).
- Signer: the publisher wallet `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94` (EOA, holds
  `PUBLISHER_ROLE`, account nonce 2, BOT gas balance 0.046309). The contract only accepts
  this role for publication — the Governance Safe signs budgets, not allocation rounds.
- `signed: false`, `broadcast: false`.

Pre-flight reads that passed at preparation (block 25740390): not paused, `epochCount` 1,
campaign budget 1,005,001 with 1,005,000 remaining, distributor holds 2,499,999 FLOW,
1 FLOW already claimed, minimum publish delay 86,400 s.

## 4. Conditions that must still hold at signing

- `epochCount` must still be 1 — the root binds epochId 2.
- The distributor must not be paused.
- Budget remaining must stay ≥ 10 FLOW and the FLOW balance ≥ reserved + 10 FLOW.
- It must be broadcast **before 2026-10-07T12:42:49Z** (claimStart − 24 h), or
  `publishEpoch` reverts. If that passes, the round is simply re-prepared.

## 5. Notes

- A stray function overload `reserve_reward_budget(uuid, text, jsonb)` created during
  preparation referenced columns that do not exist in `reward_reservations` and was
  never executed. It has been dropped; only the deployed array-form function remains.
- Mainnet public claims remain **LOCKED**. Publication alone does not open them: after
  this round is published, only the one canary wallet can claim, and only from
  2026-10-08T12:42:49Z.
