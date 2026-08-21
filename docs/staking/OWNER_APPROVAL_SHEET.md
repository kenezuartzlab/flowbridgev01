# FLOW Staking — V13.1 Owner Parameter Lock (BOT Testnet 968)

Status: **PARAMETER LOCK PASS (owner-approved 2026-08-21) — nothing deployed, nothing broadcast.**

Canonical config (single source of truth): `contracts/config/staking-bot-testnet.json`
Report/dry-run command: `bun contracts/scripts/paramlock.staking.bot-testnet.ts`

## Owner-approval table

| Parameter | Verdict | Value / required decision | Authoritative source |
| --- | --- | --- | --- |
| Staking token | APPROVED | `0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac` (existing fixed-supply FLOW) | `contracts/deployments/bot-testnet.json`, `src/lib/staking/flowStakingPolicy.ts` |
| Vault owner | APPROVED | `0x628e237b73C5a37EF3968527563FA1a26b32BB97` | config `vaultOwner` |
| Reward-funding treasury | APPROVED | `0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47` | config `rewardTreasury` |
| Minimum stake | APPROVED | 10 FLOW (`10000000000000000000`) | config `economics.minStake` |
| Maximum stake / wallet | NONE (unlimited) | approve an amount or keep NONE | config `economics.maxStakePerWallet: null` |
| Testnet reward budget | APPROVED | 100,000 FLOW (`100000000000000000000000`) | config `economics.rewardBudgetPerEpoch` |
| Reward duration | APPROVED | 2,592,000 s (30 days) | config `economics.epochDurationSeconds` |
| Schedule start | APPROVED | `immediate-on-activation` | config `economics.startTime` |
| Lock period | NONE | approve seconds or keep NONE | config `economics.lockSeconds: null` |
| Cooldown | NONE | approve seconds or keep NONE | config `safety.cooldownSeconds: null` |
| Early-withdraw penalty | NONE (no slashing) | approve rule or keep NONE | config `economics.earlyWithdrawPenaltyBps: null` |
| Emergency withdraw policy | APPROVED | `principal-withdraw-always-available` | config `safety.emergencyWithdrawPolicy` |
| Mainnet staking economics | BLOCKED (PROMOTION_PENDING) | mainnet stays all-null | `src/lib/staking/flowStakingRegistry.ts` |

No conflicting approved values were found anywhere in source control; UI copy and
docs were treated as non-authoritative.

## Pause / emergency-withdraw verdict

`contracts/FlowStakingVault.sol`:

- `withdraw()` and `exit()` are **not** `whenNotPaused` — principal is withdrawable
  while paused, so a pause can never trap user funds.
- `pause()` blocks `stake()` and `claimReward()` only.
- `recoverUncommittedRewards()` is bounded by `uncommittedRewards()`; there is no
  owner path to principal or to committed/accrued rewards.
- No `mint`, no slashing, no early-withdraw penalty.

The code already implements the preferred model, but it is only recorded as
APPROVED once `safety.emergencyWithdrawPolicy` is set to
`principal-withdraw-always-available` by the owner.

## Funding solvency rule (enforced, awaiting numbers)

```text
rewardRate        = budget / durationSeconds        (integer floor)
maxEmission       = rewardRate * durationSeconds    (<= budget)
requiredInventory = maxEmission
activateSchedule() reverts unless budget <= uncommittedRewards()
```

Reward inventory is funded by a separate `fundRewards` transfer and is never
counted as principal (`totalStaked`). Top-ups raise available inventory only and
cannot change stake balances or already-earned rewards.

## APY policy

The owner approves a **finite budget + duration**, never an APY. Any rate shown
after activation must be derived live from on-chain `rewardRate` and
`totalStaked`; `/stake` shows no rate until a funded schedule exists.

## Lock result (BOT Testnet 968 only)

`bun contracts/scripts/paramlock.staking.bot-testnet.ts` => **FLOW STAKING V13.1
PARAMETER LOCK PASS**, with the fully-funded local dry-run passing all 10
invariants (separate reward inventory, full pre-funding, zero accrual for
mid-schedule entrants, claim touches rewards only, exact principal return,
withdrawable while paused, no accrual after the schedule ends, emission <=
budget, solvency invariants).

Derived (never owner-approved as an APY): `rewardRate = 38580246913580246` wei/s,
`maxEmission = 99999999999999997632000` wei <= budget.

Deployment is still **not** authorized: registry chain 968 keeps `vault = null`
and `stakingEnabled = false`. These economics are BOT Testnet 968 only and are
not approved mainnet staking economics.
