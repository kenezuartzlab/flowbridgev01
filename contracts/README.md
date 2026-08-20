# FlowBridge FLOW Rewards Contracts (V12 build gate)

No contract in this directory has been deployed. No deployment transaction was
broadcast in the V12 gate.

## Sources

| File | Purpose |
| --- | --- |
| `FlowToken.sol` | Fixed-supply ERC-20 (+ `ERC20Permit`). Minted exactly once in the constructor to the approved treasury. No post-deploy mint path, no tax/blacklist/rebase/proxy. |
| `FlowRewardsDistributor.sol` | Pre-funded distributor. EIP-712 cumulative-entitlement claims, `SafeERC20`, `Pausable`, `Ownable2Step`. Never mints. |

Both are intended for BOT Testnet **968** first, and later — only after explicit
approval — the identical sources for BOT Mainnet **677**.

## Claim typed data

```
domain  = { name: "FlowRewardsDistributor", version: "1", chainId, verifyingContract: distributor }
Claim   = { address account, uint256 cumulativeEntitlement, uint256 deadline }
```

Claim flow on-chain: recover signer → require `rewardSigner` → require
`block.timestamp <= deadline` → require `cumulativeEntitlement > claimed[account]`
→ `claimed[account] = cumulativeEntitlement` (state before transfer) →
`safeTransfer(account, delta)`.

## Economic values still requiring owner approval

All of these are `null` in `config/bot-testnet.json` and BLOCK deployment:

- token name, symbol, total supply
- treasury / initial allocation recipient
- distributor owner address
- reward signer public address (private key stays server-only secret material)
- distributor initial FLOW funding amount
- the PTS → FLOW conversion policy (see `src/lib/rewards/flowConversionPolicy.ts`)

## Toolchain / test matrix (to run in the operator's Solidity toolchain)

This repository is a Cloudflare-Worker web app and does not host a Solidity
compiler; contract compilation, unit, fuzz and invariant tests must run in
foundry/hardhat against these exact sources. Required cases:

FlowToken
1. exact supply minted once to treasury; `totalSupply` matches config
2. no callable mint path exists after deployment (ABI has no mint)
3. standard transfer / approve / permit behaviour

FlowRewardsDistributor
4. happy path transfers exact delta and advances `claimed`
5. replaying the same cumulative claim reverts `NothingToClaim` (no double pay)
6. a higher cumulative claim later pays only the difference
7. expired `deadline` reverts `SignatureExpired`
8. signature for a different `account` reverts `InvalidSigner`
9. wrong chainId / wrong verifyingContract domain reverts `InvalidSigner`
10. wrong signer reverts `InvalidSigner`
11. after `setRewardSigner`, old-authority signatures revert
12. paused distributor reverts all claims
13. insufficient distributor balance reverts and leaves `claimed` unchanged
14. `Ownable2Step` two-step ownership acceptance
15. fuzz/invariant: `claimed[w]` never exceeds the highest authorized cumulative
    entitlement; the sum of transfers never exceeds distributor funding

The application-side equivalents of the signing/authority rules are covered by
`src/lib/rewards/*.test.ts`, which run in the project suite.

## Mainnet promotion prerequisites

Before V12.x mainnet promotion may even be considered: all 15 cases above green
on the exact commit; a successful BOT Testnet deployment verified by
`scripts/verify-deployment.ts`; at least one real testnet claim + replay attempt
+ higher-cumulative top-up observed; signer rotation rehearsal; pause rehearsal;
and an approved, committed conversion policy. Mainnet requires its own reviewed
config (`config/bot-mainnet.json`) — testnet addresses must never appear there.

## V12.1 parameter lock (no broadcast)

- `OWNER_APPROVAL_SHEET.md` — canonical APPROVED/BLOCKED table per parameter.
- `OPERATIONS.md` — pause, signer rotation, ownership transfer and top-up runbook.
- `scripts/dryrun.bot-testnet.ts` — offline parameter-lock report + in-memory
  deployment/claim/replay simulation. Exits non-zero while any field is BLOCKED.
- Approved values may live ONLY in `config/bot-testnet.json` (BOT Testnet 968).
