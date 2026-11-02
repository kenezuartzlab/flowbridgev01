# FlowRewardsVaultV2 — disabled release candidate

Non-upgradeable, immutable FLOW, Ownable2Step governance (recommended multisig), distinct publisher. Solidity **0.8.20**, OpenZeppelin **5.0.2**, optimizer 200 / Paris. Constructor starts paused and credit caps are **zero**. Illustrative 1,000 FLOW batch / 2,000 daily limits occur only in local tests, not live authorization.

## Exact build and local execution

```sh
node contracts/production/rewards-vault-v2/scripts/compile.mjs
bunx vitest run contracts/production/rewards-vault-v2/test src/lib/rewards/vaultV2*.test.ts
node contracts/production/rewards-vault-v2/scripts/deployment-dry-run.mjs 968 VERIFIED_TESTNET_FLOW ADMIN_MULTISIG DISTINCT_PUBLISHER
```

Dry-run emits unsigned constructor calldata; it cannot deploy or sign. Local EVM creates mock instances only; those addresses are not BOT Testnet deployments. No securely pre-authorized testnet deployer was established and no real-chain deployment was attempted.

## FLOW verification

BOT Mainnet 677 canonical registry selects `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`. Repository FlowToken uses ordinary ERC20/ERC20Permit, 18 decimals, no transfer tax. Live deployment verification must read chain ID, token bytecode identity and decimals, and reproduce vault runtime with the immutable token patched. Source alone is not live-bytecode attestation. Vault checks decimals in constructor and exact sender/recipient deltas on all outgoing transfers; an inexact transfer reverts without consuming credits.

## Financial activation is HOLD

The SQL config has `CHECK (NOT enabled)`, no config seed, and the app ships address/hash/publisher as null. Admin API exposes GET only and rejects POST. No old payout system, reservation, role, switch or budget was changed.

Legacy allocations are aggregate Merkle leaves, **not mapped to economic award IDs**. Before activation an audited reconciliation must map/exclude every legacy paid/outstanding award and any pending publication; ambiguous awards remain held. The disabled staging allocator has unique ledger and economic IDs and immutable snapshots, but is not an approved canonical eligibility writer. It must not be enabled simply by removing its database check. In particular canonical signup attribution, account reconciliation, per-wallet totals, legacy publication fences and exact successful credit receipt ingestion must be integrated and transactionally accepted before activation. These are required safety gates, not permission to infer entitlement from lifetime Points.

## Minimum legitimate activation actions

1. Owner separately authorizes exact network/token, multisig admin, distinct publisher, deployment and bounded prefunding. Verify deployed source/runtime/roles on chain.
2. Super Admin approves evidenced legacy exclusion and cutover; retain original ledger. Verify canonical program funding, provenance and account reconciliation; no routine per-wallet approvals added.
3. Owner separately authorizes batch/day limits and unpause/cutover only after shared economic-award allocation locks and legacy publisher fences pass concurrent acceptance.
4. Publisher manually signs exact immutable `creditBatch` calldata; ingest only confirmed canonical receipt, exact batch/wallet events and `processedBatch`. Users then sign their own `claim()` and pay BOT gas.

No relayer, hot publisher key, Merkle proof, expiry, mint, token replacement, arbitrary call or proxy exists in this contract.