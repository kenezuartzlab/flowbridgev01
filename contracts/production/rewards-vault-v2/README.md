# FlowRewardsVaultV2 — disabled release candidate

Non-upgradeable, immutable FLOW, Ownable2Step governance (recommended multisig), distinct publisher. Solidity **0.8.20**, OpenZeppelin **5.0.2**, optimizer 200 / Paris. Constructor starts paused and credit caps are **zero**. Illustrative 1,000 FLOW batch / 2,000 daily limits occur only in local tests, not live authorization.

## Exact build and local execution

```sh
node contracts/production/rewards-vault-v2/scripts/compile.mjs
node contracts/production/rewards-vault-v2/scripts/acceptance-bundle.mjs contracts/production/rewards-vault-v2/verification
bunx vitest run contracts/production/rewards-vault-v2/test src/lib/rewards/vaultV2*.test.ts
node contracts/production/rewards-vault-v2/scripts/deployment-dry-run.mjs 968 VERIFIED_TESTNET_FLOW ADMIN_MULTISIG DISTINCT_PUBLISHER
```

Dry-run emits unsigned constructor calldata; it cannot deploy or sign. Local EVM creates mock instances only; those addresses are not BOT Testnet deployments. An existing deployer credential is present, but no current Vault-specific deployment authorization was established; no real-chain deployment was attempted.

## FLOW verification

BOT Mainnet 677 canonical registry selects `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`. Repository FlowToken uses ordinary ERC20/ERC20Permit, 18 decimals, no transfer tax. Live deployment verification must read chain ID, token bytecode identity and decimals, and reproduce vault runtime with the immutable token patched. Source alone is not live-bytecode attestation. Vault checks decimals in constructor and exact sender/recipient deltas on all outgoing transfers; an inexact transfer reverts without consuming credits.

## Financial activation is HOLD

The old `enabled` column retains `CHECK (NOT enabled)`, but **`financial_enabled` is the current runtime gate**; it defaults OFF and no configuration is seeded. The authorized cutover RPC can enable the new path. The app's null deployment values are defaults, not an absolute prohibition. Read-only live acceptance on November 2 confirmed zero config, batches, signing attempts and credits. No settings, funding, roles or financial switches were changed.

The canonical funded allocator, immutable economic-award destination fence, atomic reservations, publisher signing intent, nonce/hash recovery and exact canonical receipt ingestion are implemented. Admin GET/POST actions exist. Genuine new supported awards created strictly after a future authorized cutover go to V2; **all earlier awards, Rounds #1–4 and unpublished V1 obligations stay V1 without historical mapping**. Unsupported awards and unresolved reconciliation remain held. The retired staging RPC is still rejected; the newer guarded allocator is the operative writer.

Release preflight found remaining assurance blockers despite passing tests: deployment acceptance trusts the supplied code hash instead of binding patched frozen runtime and approved governance; wallet-rejection cancellation relies on unchanged RPC nonce, which is not conclusive absence-of-broadcast evidence; an unverified wrong attached hash cannot be corrected by proven nonce identity; bounded source/reconciliation reads can starve later eligible awards or halt at scale. These are actual current software limitations, not requests for additional routine payout approvals. **Do not activate while these gaps remain.** See `RELEASE_ACCEPTANCE.md` for exact evidence and scope.

## Minimum legitimate activation actions

1. Owner separately authorizes exact network/token, multisig admin, distinct publisher, deployment and bounded prefunding. Verify deployed source/runtime/roles on chain.
2. After software assurance blockers are resolved, Super Admin authorizes only future new-award cutover; retain all historical V1 obligations. Verify existing canonical program funding, provenance and account reconciliation; no historical mapping or routine per-wallet approvals added.
3. Owner separately authorizes batch/day limits and unpause/cutover only after shared economic-award allocation locks and legacy publisher fences pass concurrent acceptance.
4. Publisher manually signs exact immutable `creditBatch` calldata; ingest only confirmed canonical receipt, exact batch/wallet events and `processedBatch`. Users then sign their own `claim()` and pay BOT gas.

No relayer, hot publisher key, Merkle proof, expiry, mint, token replacement, arbitrary call or proxy exists in this contract.