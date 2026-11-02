# Vault V2 release acceptance — November 2, 2026

## Verdict

**Local build / hostile tests PASS; financial deployment acceptance HOLD.** V2 remains disabled and undeployed on both networks. No signature, deployment, token movement, budget, role, staking or Merkle modification occurred. No production publication was requested because the clean-release condition is not met. Existing published code was inspected read-only.

## Reproducible evidence

- Frozen Solidity source unchanged. solc `0.8.20+commit.a1b79de6`, OpenZeppelin `5.0.2`, optimizer 200, Paris.
- `scripts/acceptance-bundle.mjs` inlines all 11 source units, compiles twice with no import callback, and compares creation/runtime/ABI against the frozen artifact. `verification/` includes Standard JSON input/output, artifact, checksums, immutable slots and unsigned candidate/templates. No deploy receipt or deployed Vault address exists.
- Creation **6,485 bytes**, runtime **5,615 / 24,576 bytes** (18,961 bytes headroom). Immutable FLOW must be patched at all seven slots for actual runtime comparison.
- Local deployment execution **1,217,650 gas**; intrinsic/initcode-inclusive modeled gas **1,370,886**. 100 fresh recipients: execution **5,659,147**, calldata/intrinsic-inclusive **5,714,911 gas**. These are local EVM figures, not a live transaction receipt.
- Live Testnet constructor `eth_estimateGas`: **1,385,853** using the historical testnet deployer solely as an RPC call sender and the historical Mainnet admin candidate as a constructor value. This is a hypothetical quote: that Safe has no Testnet code, so it is **not** deployment readiness or authorization.
- Both networks report a **35,000,000** block gas limit and **20 gwei** gas price. Paris bytecode and the Testnet constructor quote establish basic RPC/EVM compatibility, not a deployed financial lifecycle.
- **2,293 tests / 223 files PASS**, including **25 executed hostile EVM tests**: initial pause/zero caps, exact prefunding, 100/101 recipients, many batches/one claim, replay, caps/day reset, wrong-wallet/admin/publisher, two-step ownership, liability-safe recovery, transfer-tax rollback, reentrancy and deterministic liability invariant.
- Disposable PostgreSQL acceptance PASS: 8-way reserve idempotency, single signing-intent winner, 6-way exact confirmation, funding/identity/backing gates and V1/V2 exclusion. No hosted writes.
- Automatic preview build OK; manual app build/typecheck not run because the project harness owns them. No separate typecheck result was exposed in this acceptance pass.
- Authenticated bound-account Ops at 320/390/430/1280 PASS: no overflow; disabled/not deployed; no signing action. Authenticated Rewards/Earn 390px render inactive V2 and preserved legacy claim panel; runtime errors: zero. Provider identity was a read-only fixture, not a real connected-wallet financial test.

## Live tokens and governance

Mainnet observed block **28,823,784**, Testnet **28,990,399**:

| Network | FLOW | Decimals | Runtime bytes | SHA-256 |
|---|---|---|---|---|
| 677 | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` | 18 | 1,786 | `2f86c4bb190f0d46e7d0154d6f1de02f35e69d4aa2015e7ceecf647de5d7a5ca` |
| 968 | `0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac` | 18 | 3,839 | `357fb202799a89470f152d5702708c47a262c5d591f24d5c9860a61867df6678` |

Mainnet exactly matches canonical R1 settlement runtime. Testnet matches its deployment manifest address/decimals and reconstructed executable code after masking ERC20Permit immutables and removing Solidity metadata; **full byte-for-byte artifact parity is not established** (stored artifact hash differs). They are not the same token implementation. No live transfer behavior test was performed.

Latest saved database decision replacements (August 27), not obsolete earlier choices:

- Governance candidate `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507`: live Mainnet code, **3 distinct owners / threshold 2**, owners match saved decision. This meets the requested multisig gate.
- Treasury `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` and Operations `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF`: live 3-owner / threshold-2 wallets; Operations is not substituted for unrestricted governance.
- Publisher candidate `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94`: matches saved root-publisher replacement, EOA on Mainnet and distinct from admin. This is a candidate, **not a granted V2 publisher role or proof the operator currently controls it**.
- None of those three Safe addresses has Testnet code. No verified Testnet multisig, exact Vault-specific authorized Testnet signer, or prior bounded Vault Testnet funding authorization was established. Credential presence was not treated as permission; no private key was read.

## Exact software blockers found by current-source review

1. `verifiedVaultDeployment` in `vaultV2Ingestion.server.ts` / `vaultV2Activation.server.ts` accepts administrator-supplied hash plus compatible reads. It does not bind immutable-patched frozen candidate runtime, canonical token runtime or approved multisig identity. Independent release evidence must not be confused with enforcement by the activation endpoint.
2. `cancelVaultPublisher` accepts original-publisher `wallet_rejected` after latest/pending nonce equality, then synthesizes `EXPLICIT_4001_NO_SEND`. RPC nonvisibility cannot conclusively prove no broadcast; an unknown send could lose its active intent lock. Contract batch replay protection remains, but durable unknown-send locking is not fully enforced.
3. `attachVaultPublisherHash` journals an unverified hash immutably. A mistaken hash poisons recovery because replacement with a transaction proven to match original nonce/calldata is rejected. Exact-credit checks prevent false success, but recovery can be stranded.
4. `vault_v2_source_rows` returns at most the first 1,000 before server reconciliation/capacity filtering; excluded/oversized rows can starve eligible later rows. Reconciliation globally fails closed at 10,000 profiles / 50,000 ledger rows. Small-canary tests do not establish sustained-scale readiness.

These were documented, not silently suppressed or rewritten during release preflight. Ingestion without an active intent is allowed only for an exact externally signed stored batch; source/hash/canonical receipt checks still apply. Live configuration remained empty after checks.

## Security and production

Fresh backend scan completed with no new actionable findings. Dependency scan still reports existing **high and moderate** transitive advisories (WalletConnect, serialization, MCP/email chains); these were neither ignored nor changed. The Wiz connector was unavailable; a fully clean comprehensive security claim is not warranted.

Publication was withheld: release safeguards and dependency advisories remain. This does not disable or alter legacy Mainnet claims. Actual current served asset verification is recorded in `verification/served-production.json`; it describes the existing release, not a newly deployed one.

## One future launch path (after software blockers are resolved)

1. Owner authorizes exact verified multisig admin, distinct publisher and deployment signer; human signs Testnet acceptance first with a valid Testnet Safe, then separately authorized Mainnet deployment. Constructor remains paused/zero caps; attest exact deployed runtime/token/owner/publisher.
2. Treasury multisig human-signs **only the owner-chosen limited initial FLOW amount**; governance human-signs bounded limits/unpause after backing verification. No illustrative test amount is an authorized budget.
3. Super Admin authorizes a future new-award cutover using existing guards; publisher deliberately prepares/signs one exact batch and waits for confirmed canonical credit. Historical awards stay V1.

User experience: **Claim FLOW = 1 user transaction**; **Claim & Stake Flexible = 2, or 3 with exact approval**. Same EOA, user-paid BOT gas, separate transactions, verified receipt/position before success; claimed funds remain with the user if staking is interrupted.

Minimal missing human input: one Vault-specific authorization naming the chain-968 admin Safe (at least 3 distinct owners / threshold at least 2), exact deploy signer and distinct publisher. Do not submit private keys. This input alone does not clear software blockers.