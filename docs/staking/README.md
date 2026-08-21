# FLOW Staking — V13 Testnet Build Gate

Status: **BUILD ONLY — NOT DEPLOYED, NOT ACTIVE.**

## Scope

V13 adds the staking vault source, a fail-closed policy engine, a registry, deployment
tooling and a preview surface at `/stake`. It deploys nothing and quotes no yield.

## Accounting model (`contracts/FlowStakingVault.sol`)

- Principal (`totalStaked`) and reward inventory (`rewardInventory`) are accounted
  **separately**. User principal is withdrawable at any time — no lock-up, no penalty,
  no slashing, and no owner path that can move it.
- FLOW is fixed-supply, so the vault **never mints**. Rewards are payable only from an
  inventory the treasury funds up front via `fundRewards`.
- `activateSchedule` reverts unless the funded inventory fully covers the schedule's
  committed budget, so a schedule can never promise unfunded rewards.
- `uncommittedRewards` lets the owner recover only budget that has not been committed
  to a schedule — never principal.

## Owner-gated parameters

`contracts/config/staking-bot-testnet.json` keeps `minStake`, `rewardBudget`,
`epochDurationSeconds` and `startTime` as `null`. `src/lib/staking/flowStakingPolicy.ts`
reports those as `UNAPPROVED`, and `flowStakingRegistry.ts` resolves every chain to
`vault: null` / `stakingEnabled: false`. Result: the UI can never show staking as live
and never renders an APR/APY.

BOT Mainnet (677) is explicitly blocked and stays `mainnetPromotionPending`.

## Tooling

| Script | Purpose |
| --- | --- |
| `contracts/scripts/compile.staking.ts` | Build `FlowStakingVault.json` artifact — no broadcast |
| `contracts/scripts/dryrun.staking.bot-testnet.ts` | Report parameter verdicts + unsigned steps |
| `contracts/scripts/verify-staking-deployment.ts` | Read-only on-chain verification after a future deploy |

## Boundaries

FLOW Points (PTS) and Campaign PTS are off-chain metrics. They are never staking
principal, never convertible into principal, and never a staking multiplier.

## Promotion checklist (future gate)

1. Owner approves each economic parameter in the config; policy engine reports `APPROVED`.
2. Compile, dry-run, then deploy the vault against the existing FLOW token
   (`0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac`, BOT Testnet 968).
3. Treasury funds reward inventory; verify on-chain with the verification script.
4. Fill the vault address in the registry and flip `stakingEnabled` for testnet only.

## V13.1 — Owner parameter lock

`docs/staking/OWNER_APPROVAL_SHEET.md` is the owner-approval table.
`contracts/config/staking-bot-testnet.json` is the single canonical BOT Testnet
config. `bun contracts/scripts/paramlock.staking.bot-testnet.ts` prints every
verdict, hashes and the funding-solvency calculation; it refuses to simulate a
production-shaped deployment while any mandatory decision is missing, and runs
the full funded local dry-run (fund → activate → two stakers → accrual → claim →
partial/full unstake → schedule end → replay) once all are approved.
`src/lib/staking/flowStakingVaultSim.ts` is the integer-faithful reference
simulator used by that dry-run and by the tests.

Current verdict: **FLOW STAKING V13.1 PARAMETER LOCK BLOCKED** (no owner-approved
economics; nothing deployed or broadcast).

## V13.2 — BOT Testnet deployment + funding (LIVE)

`bun contracts/scripts/deploy.staking.bot-testnet.ts --broadcast` executed the only
authorized sequence: deploy vault → `setMinStake(10 FLOW)` → treasury `approve` +
`fundRewards(100,000 FLOW)` → owner `activateSchedule(100,000 FLOW, 2,592,000s)`.

| Item | Value |
| --- | --- |
| FlowStakingVault | `0x36f2318027edf79D083Aac98D66C9a1b3e2AAdD1` |
| Staking/reward token | `0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac` (FLOW) |
| Owner | `0x628e237b73C5a37EF3968527563FA1a26b32BB97` |
| Reward treasury | `0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47` |
| Reward inventory | 100,000 FLOW (fully committed to schedule 1) |
| Reward rate | 38580246913580246 wei/s |
| Minimum stake | 10 FLOW |
| Max stake / lock / cooldown / penalty / slashing | NONE |
| totalStaked before canary | 0 |

Manifest: `contracts/deployments/staking-bot-testnet.json`.
Registry now lists the testnet vault with `stakingEnabled: true`; BOT Mainnet 677
remains `vault=null / stakingEnabled=false / promotion pending`.

Operations: `pause()`/`unpause()` block new stakes and reward claims only —
`withdraw()`/`exit()` stay open (ALWAYS_WITHDRAWABLE_PRINCIPAL). Reward top-up is
treasury `approve` + `fundRewards`; a new schedule may only be activated after the
current period finishes.

No user stake, approval, withdrawal or reward claim was performed. V13.3 owns the
first user canary.
