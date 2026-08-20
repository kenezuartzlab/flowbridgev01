# FlowBridge FLOW Rewards — Operations Runbook (V12.1)

Applies once (and only once) the parameters in `OWNER_APPROVAL_SHEET.md` are
approved and a deployment exists. Nothing here has been executed; no transaction
has been broadcast.

## Key custody

- `FLOW_REWARD_SIGNER_PRIVATE_KEY` — **server-only** secret. Read inside server
  handlers (`src/lib/rewards/flowClaimAuthority.server.ts`). Never a `VITE_*`
  value, never surfaced in `/sets`, never logged or returned.
- Deployer and owner private keys are never stored in the repository, in Vite
  env, in `/sets`, or in any client bundle. They live only in the operator's
  own signing environment.
- Owner and reward signer must be distinct addresses unless the owner explicitly
  approves sharing one; `flowDeploymentPlan.ts` blocks the shared case.

## Ownership transfer (Ownable2Step)

1. Current owner calls `transferOwnership(newOwner)` — ownership does **not** move yet.
2. `newOwner` calls `acceptOwnership()` from that exact address.
3. Verify with `contracts/scripts/verify-deployment.ts` (checks `owner()`).
4. Never transfer ownership to an address that cannot sign (verify a test tx
   from it first).

## Emergency pause

- Owner calls `pause()` on `FlowRewardsDistributor`; all `claim` calls revert.
- Server side: keep `claimsEnabled: false` in
  `src/lib/rewards/flowRewardsRegistry.ts` so the app stops issuing
  authorizations as well as failing on-chain.
- Resume with `unpause()` only after the cause is understood and the reward
  signer is confirmed uncompromised.

## Reward signer rotation

1. `pause()` the distributor.
2. Provision a new signer key in the server secret store; do not delete the old
   one until step 5 is verified.
3. Owner calls `setRewardSigner(newSigner)` — every signature from the previous
   signer becomes invalid immediately.
4. Update `FLOW_REWARD_SIGNER_PRIVATE_KEY` to the new key.
5. Verify `rewardSigner()` on-chain matches the new public address, then
   `unpause()`.

Rotation never changes `claimed[]`, so users keep exactly their unclaimed delta.

## Distributor top-up

- Top-up is a plain ERC-20 transfer of FLOW from the treasury to the distributor
  address. It is **not** an entitlement operation: `claimed[]` and all cumulative
  accounting are untouched.
- Never mint (no mint path exists) and never use `withdrawFunding` to
  "rebalance" entitlements — withdrawal only removes unallocated funding.
- Before top-up, record: distributor balance, total outstanding entitlement, and
  the transfer tx hash in the deployment manifest history.

## Invariants to re-check after any operation

1. `distributor.token()` == deployed FLOW token address.
2. `totalSupply()` unchanged and equal to the approved fixed supply.
3. `owner()` == approved owner; `rewardSigner()` == current approved signer.
4. Distributor balance ≥ outstanding unclaimed entitlement.
5. BOT Mainnet 677 addresses remain unset until an explicit promotion gate.
