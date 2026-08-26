# FlowBridge V30.1B.2 — Rewards Distributor Mainnet Solvency

Status: **PASS** for the rewards solvency gate. No deployment, wallet signature,
broadcast transaction, FLOW transfer or reward claim was performed at any point.

## 1. Canonical architecture decision (one model only)

| Model | Verdict |
| --- | --- |
| Budgeted Merkle / epoch (`FlowRewardsMerkleDistributor`) | **CANONICAL for BOT Mainnet 677** |
| Cumulative EIP-712 (`FlowRewardsDistributor`) | Historical BOT Testnet 968 infrastructure only |

Rationale: on-chain reservations are the whole point of this gate, and the epoch
model expresses them in a single integer (`totalReserved`) that is set once per
publication and can only shrink through a real claim or an explicit release. The
cumulative model would have needed per-authorization reservation bookkeeping
(and an expiry/garbage-collection path) to reach the same guarantee, and its
`setRewardSigner` rotation invalidates every live authorization. The decision is
frozen in `src/lib/rewards/flowRewardsModel.ts`; there is no dual mainnet model,
and `flowClaimAuthority.server.ts` now refuses to issue signed authorizations on
any chain where the signer model is not the approved one.

## 2. Solvency enforcement

`contracts/production/rewards-distributor/FlowRewardsMerkleDistributor.sol`

```
freeBalance    = max(0, token.balanceOf(this) - totalReserved)
budgetHeadroom = max(0, campaignBudget - (totalClaimed + totalReserved))

publishEpoch reverts unless
  balanceOf(this) >= totalReserved + allocation            (funded)
  totalClaimed + totalReserved + allocation <= campaignBudget  (budgeted)
```

- Publication reserves the full epoch allocation before any claim is possible.
- `claim` decrements the reservation and increments `totalClaimed` **before** the
  transfer; a bitmap prevents replay; the leaf commits `(chainId, distributor,
  epochId, index, account, amount)` so a proof cannot be replayed across chains,
  epochs or accounts, and a third-party submitter always pays the committed
  account.
- Reserved FLOW is unreachable by privilege: `recoverFree` is bounded by
  `freeBalance()` and pays only the configured recovery recipient.
- Reservations are released only by `cancelEpoch` (strictly before `claimStart`)
  or `releaseExpiredEpoch` (strictly after `claimEnd`), and only for the
  unclaimed remainder.
- There is **no mint path**. Every payout comes from pre-funded FLOW.
- Publication delay is bounded to `[1 hour, 7 days]`; admin cannot shorten it
  below the floor or accelerate a pending epoch.

## 3. Build identity (isolated pinned workspace)

solc 0.8.24, optimizer enabled runs 200, viaIR, cancun, OpenZeppelin 5.6.1.

| Measure | Value |
| --- | --- |
| Creation bytes | 7,181 |
| Runtime bytes | 5,861 (EIP-170 limit 24,576) |
| Source SHA-256 | `cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43` |
| Creation SHA-256 | `b7eb1e3033512f1598c53094ddf47cd207d7952468efe613a97ce13257c9ba3a` |
| Runtime SHA-256 | `180611b009e3472d50c4691d742438372bdb1d73ffd8222bb5c506635008d3d1` |
| Normalized ABI SHA-256 | `821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79` |

## 4. Evidence

- Solidity suite `contracts/production/rewards-distributor/test/V30_1B2_RewardsSolvency.t.sol`:
  **24 passing**, including 2 fuzz properties at 256 runs each (512 randomized
  solvency/recovery runs). Covered: concurrent-epoch overbooking, budget
  ceilings, zero recoverable balance when fully reserved, reserved-fund recovery
  protection, exact claim accounting and replay rejection, cancellation and
  expiry release rules, publication delay bounds, wrong account/amount/proof/
  epoch/chain rejection, third-party payout pinning, claim windows, token
  reentrancy, pause behaviour, role authorization and role rotation preserving
  live obligations.
- Canonical leaf vector (chainId 31337, distributor
  `0x2e234DAe75C793f67A35089C9d99245E1C58470b`, epoch 7, index 3, amount 1234e18):
  `0x696610ea9cce3712b103eb45726d15e483b1a43d599caf0f1cb17c76b7b0d7c3`.
  `src/lib/rewards/merkleClaim.ts` reproduces it exactly, so the app and the
  contract cannot disagree about what a leaf means.
- Slither 0.11.3 / solc 0.8.24 / viaIR: 25 results, 5 on our own contract — 4
  low-impact `timestamp` findings on `claim`, `publishEpoch`, `cancelEpoch` and
  `releaseExpiredEpoch` (coarse hour-to-day windows; drift cannot defeat the
  publish delay and no accounting depends on exact timestamps) and 1
  informational pragma finding from pinned OpenZeppelin interfaces. Nothing
  actionable.
- App gates: rewards + deploy suites pass; full typecheck and build clean.
- Router V4 candidate, FlowToken and staking economics are byte-for-byte
  unchanged by this gate.

## 5. Stage semantics preserved

`FLOW Points` (off-chain score) → `convertible` (eligible subset) →
`claimable` (funded, published, unclaimed on-chain entitlement) → `claimed`
(delivered) → `wallet FLOW` (live ERC-20 balance). Campaign PTS remain a
separate ledger and never convert. `src/lib/rewards/rewardState.server.ts`
remains the single resolver every surface reads; no surface re-derives
"claimable" from points arithmetic, and nothing auto-claims or auto-stakes.

## 6. Open deployment blockers (all external)

1. **V30.1B-G1** — approved production multisig/timelock for `DEFAULT_ADMIN_ROLE`
   and `BUDGET_MANAGER_ROLE` is not assigned.
2. **V30.1B.2-E1** — approved campaign budget, epoch cadence and Points→FLOW
   allocation economics are not signed off.
3. **V30.1B.2-P1** — publisher key custody, monitoring and rotation runbook not
   provisioned in the production secret store.
4. **V30.1B.2-M1** — epoch manifest generator and proof distribution pipeline not
   built or reviewed.

BOT Mainnet 677 rewards addresses remain `null`, claims remain disabled, and the
distributor stays `PROMOTION_PENDING`.

## 7. Zero-write attestation

No deployments, no wallet signatures, no broadcast transactions, no FLOW
transfers, no reward claims, no changes to points, campaign or referral rules.

**FLOWBRIDGE V30.1B.2 REWARDS DISTRIBUTOR MAINNET SOLVENCY PASS**
