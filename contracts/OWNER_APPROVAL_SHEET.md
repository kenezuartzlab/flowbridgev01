# FlowBridge V12.1 — Owner Approval Sheet (BOT Testnet 968)

**Status: BLOCKED — no BOT Testnet deployment may be prepared or broadcast.**

This is the canonical parameter-lock record. The single deployment source of
truth is `contracts/config/bot-testnet.json`. Values live nowhere else — scripts
and the app read that file (or stay fail-closed).

Authority rules applied: chat history, UI copy, test fixtures and brainstormed
tokenomics are **not** deployment authority. Any parameter without an approved,
source-controlled value is BLOCKED, never defaulted.

## Canonical parameter table

| Parameter | Status | Value | Authoritative source / reason |
| --- | --- | --- | --- |
| Token name | BLOCKED | — | No owner-approved token name exists in any committed spec |
| Token symbol | BLOCKED | — | No owner-approved symbol exists (UI "FLOW" copy is not authority) |
| Decimals | APPROVED | 18 | `contracts/FlowToken.sol` — `decimals()` is a canonical `pure` 18 override |
| Fixed total supply | BLOCKED | — | No approved integer raw-unit supply anywhere in the repo |
| Initial recipient / treasury | BLOCKED | — | No approved checksum treasury address |
| Distributor funding amount | BLOCKED | — | No approved amount; must also be ≤ approved supply/allocation |
| Contract owner | BLOCKED | — | No approved owner wallet/multisig; must not default to the deployer |
| Reward signer public address | BLOCKED | — | No approved signer address. Private key stays server-only (`FLOW_REWARD_SIGNER_PRIVATE_KEY`) |
| PTS → FLOW conversion policy | BLOCKED (NONE) | — | `src/lib/rewards/flowConversionPolicy.ts` is `null`; token entitlement generation stays disabled |
| Claim authorization lifetime | BLOCKED | — | The 15-minute value in `src/lib/rewards/flowClaimAuthority.server.ts` is a code-level signature bound, **not** an owner-approved policy value. Must be approved in config (1–3600s, bounded) |

No conflicting values were found in any committed spec, so no field is blocked
for reconciliation reasons — every block is "no authoritative value exists".

## Enforcement

`src/lib/rewards/flowDeploymentPlan.ts` recomputes this table from the config on
every test run (`src/lib/rewards/flowDeploymentPlan.test.ts`). While any field is
BLOCKED:

- no unsigned deployment order or constructor args are emitted,
- `contracts/scripts/deploy.bot-testnet.ts` exits non-zero even with `--broadcast`,
- `src/lib/rewards/flowRewardsRegistry.ts` keeps BOT Testnet 968 and BOT Mainnet
  677 token/distributor addresses `null` with claims disabled,
- `/earn` shows the fail-closed FLOW claim status and the server never signs a
  claim authorization.

## To unblock

1. Owner approves each BLOCKED row in writing.
2. The approved values are committed **only** into
   `contracts/config/bot-testnet.json` (plus `claim.conversionPolicyRef` pointing
   at the reviewed policy document) and, if a conversion policy is approved,
   encoded server-side in `flowConversionPolicy.ts` with deterministic tests.
3. Re-run the dry-run proof: `bun contracts/scripts/dryrun.bot-testnet.ts`.
4. Only after a green dry-run does V12.2 perform the actual deployment and fill
   `contracts/deployments/bot-testnet.json` from real receipts.
