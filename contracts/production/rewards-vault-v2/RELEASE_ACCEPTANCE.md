# Vault V2 release acceptance — November 3, 2026

## Verdict

**All four software blockers corrected; non-financial gates PASS.** Subsequent owner-authorized Testnet rehearsal and Mainnet deployment are recorded below. Mainnet is deployed, prefunded and unpaused under the pinned temporary-owner exception; the application cutover remains pending as last recorded, not rechecked during source verification. The earlier preflight observations below are historical, not the current deployment status.

## Reproducible evidence

- Frozen Solidity source unchanged. solc `0.8.20+commit.a1b79de6`, OpenZeppelin `5.0.2`, optimizer 200, Paris.
- `scripts/acceptance-bundle.mjs` inlines all 11 source units, compiles twice with no import callback, and compares creation/runtime/ABI against the frozen artifact. `verification/` includes Standard JSON input/output, artifact, checksums, immutable slots and historical unsigned candidate/templates. Actual deployment evidence and explorer verification are recorded below.
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

## Software blockers — all four corrected (follow-through build)

1. **A — frozen identity enforced.** `vaultV2Identity.ts` derives the expected runtime from the generated frozen-artifact module (`vaultV2Runtime.generated.ts`, byte-identical to `verification/artifact.json`) with all seven FLOW immutables at offsets `[457,2216,3215,3367,3489,3552,3704]` patched to `0xcaaB…17fF`. `verifiedVaultDeployment` requires chain 677, block-pinned reads with canonical block-hash recheck, actual `eth_getCode` exactly equal to that runtime, keccak derived from actual code, canonical FLOW runtime keccak `0x0bacd808…3f8b` / 18 decimals, owner Safe `0x88A4…9507` with exactly the 3 recorded owners and threshold 2, no pending owner, and publisher `0x971E…3f94` as a code-less EOA distinct from owner. The admin API strips any client code hash/publisher; a supplied hash that differs is rejected. No replacement-publisher path exists; any change needs a new reviewed code change.
2. **B — no cancellation from nonce nonvisibility.** EIP-1193 4001 records `UNKNOWN` and keeps the intent and reservations locked (“Signature dismissed; confirmation unresolved — resume verification”). Release happens only when a finalized block (head − 12, hash rechecked) shows publisher nonce consumed beyond the reserved nonce **and** `processedBatch=false`. Resume never sends.
3. **C — candidate-hash journal.** Wallet-returned/manual/nonce-scan hashes go into a service-only candidate journal (migration `0054`). A hash becomes authoritative only after on-chain match of signer, nonce, destination, exact calldata, zero value and chain 677. Mistyped or invisible hashes stay candidates; wrong payloads are rejected (same-nonce different payload = nonce conflict); a later exact hash is accepted. Unknown candidates never credit, release or prompt resend; audit rows are kept.
4. **D — scale.** Sources are read by deterministic keyset pages (500 × max 20 per call) through `vault_v2_source_rows_scan`; only candidate users are reconciled, each with full paginated ledger history (plus referenced referees); errors or page bounds fail closed. A scan bound returns a continuation (“Continue scan”), never a false empty result.

Evidence: **2,327 tests / 225 files PASS** (identity 14, signing recovery 19, publisher 13, scale 12 new/updated), **25 hostile EVM tests PASS**, typecheck clean, isolated PostgreSQL race suite PASS (8-way reservation/intent, 6-way confirmation, 1,200-row paging, row beyond the first 1,000 reservable, nonce-release rules). Offline bundle regenerated byte-identical for all six frozen files. `verification/flow-mainnet-runtime.hex` is a read-only test fixture of live canonical FLOW code (SHA-256 `2f86c4bb…a5ca`).

## Security and production

Fresh backend scan completed with no new actionable findings. Dependency scan still reports existing **high and moderate** transitive advisories (WalletConnect, serialization, MCP/email chains); these were neither ignored nor changed. The Wiz connector was unavailable; a fully clean comprehensive security claim is not warranted.

Follow-through build: fresh scan has no new findings (only two previously user-ignored). Disabled-only code was published; flowbridge.space `/ops`, `/rewards`, `/earn` HTTP 200 and live `ops-DaUv3NZu.js` (SHA-256 `658b73ec…b169`) contains the unresolved-dismissal and Continue scan safeguards. Legacy Mainnet claims unchanged. Signed-in 320/390/430 Ops/Rewards/Earn: no overflow or runtime errors; the Ops V2 detail panel requires a connected bound wallet, which the headless check could not provide.

## One launch sequence (human-authorized)

1. Owner authorizes exact verified multisig admin, distinct publisher and deployment signer; human signs Testnet acceptance first with a valid Testnet Safe, then separately authorized Mainnet deployment. Constructor remains paused/zero caps; attest exact deployed runtime/token/owner/publisher.
2. Treasury multisig human-signs **only the owner-chosen limited initial FLOW amount**; governance human-signs bounded limits/unpause after backing verification. No illustrative test amount is an authorized budget.
3. Super Admin authorizes a future new-award cutover using existing guards; publisher deliberately prepares/signs one exact batch and waits for confirmed canonical credit. Historical awards stay V1.

User experience: **Claim FLOW = 1 user transaction**; **Claim & Stake Flexible = 2, or 3 with exact approval**. Same EOA, user-paid BOT gas, separate transactions, verified receipt/position before success; claimed funds remain with the user if staking is interrupted.

Minimal missing human input: one Vault-specific authorization naming the chain-968 admin Safe (at least 3 distinct owners / threshold at least 2), exact deploy signer and distinct publisher. Do not submit private keys. This input alone does not clear software blockers.
## Testnet rehearsal (BOT Testnet 968) — PASS, 2026-11-02
Temporary owner `0x8512…f3dD` (deployer/owner), publisher `0x971E…3f94`, FLOW `0xCE14…41Ac`.
- Vault `0xb11b14a2eed65cefca729f27aafc0c03e5323680` deployed paused (`0x6fff27b0…ec57`)
- Prefund 10 FLOW `0x967154a2…30f8`; setLimits 10/10 `0x4d18685a…aff`; unpause `0xbdc7e6be…fb`
- creditBatch 5 FLOW `0x7d1c2b92…dc9a`; replay and non-publisher credit reverted
- claim `0x483f5b64…eb`: received exactly 5 FLOW; liabilities 0, free 5 FLOW remains in vault
Mainnet unchanged: still requires the approved Safe owner and separate authorization.

## Mainnet deployment (BOT Mainnet 677) — 2026-11-02, owner-directed temporary owner
Owner chose temporary owner wallet `0x8512…f3dD` instead of the 2-of-3 Safe (deliberate exception). Publisher `0x971E…3f94`.
- Vault `0x91f70c91b4273d0129abc3f14373fbb10ca59006` deployed paused `0xc126769fdbe9688ba96c30a54a45d022a1f73ab6539cb80149260636cb1d0252`; runtime exactly matches frozen build, code hash `0xdc9d2b31…75b1`
- Prefund 10,000 FLOW `0xc5eb4e01079558cb38d71f2ebd11ddff1916403829498718000edab49c22c847`
- Initial pending steps (subsequently completed below): setLimits, unpause and app owner-identity exception. Cutover still pending as last recorded.
- setLimits 10,000/10,000 FLOW `0x48a6f1b7f16b914ba92b264d6916a9cf06452fba6f015a12366ee56fc4111d5f`; unpause `0x3caa8effb3205e7ab636be2625766df41f480ad7e3b0bd47980c5e08a09ed663`
- App: owner exception pinned to this vault+owner only (`VAULT_V2_OWNER_EOA_EXCEPTION`); 100 FLOW per wallet per batch enforced in allocator. Cutover pending Super Admin action in Ops.

## Mainnet explorer source verification — PASS, 2026-11-03

- BOTScan: https://scan.botchain.ai/address/0x91f70c91b4273d0129abc3f14373fbb10ca59006?tab=contract
- Submitted the frozen fully inlined Standard JSON input; BOTScan returned `Pass - Verified` and `is_verified=true`, `is_fully_verified=true`, `is_partially_verified=false` at `2026-11-03T02:57:30.909291Z`.
- Compiler `v0.8.20+commit.a1b79de6`, optimizer enabled / 200 runs, Paris, MIT. All 11 published source units exactly match the frozen input. Independent offline compilation twice retained frozen creation/runtime/ABI parity.
- Canonical Mainnet block `28920241`, hash `0xae1aad54151aa95c493ab07c70cf779133126048e5fe4ab7550bc9fc19d29a61`, rechecked unchanged: all seven FLOW immutable slots patched to canonical FLOW; actual 5,615-byte runtime exactly matches. Actual runtime keccak `0xdc9d2b315367b7a56fb3b9f4115ff81f8e954797caadad8d61e77399a16a75b1`.
- Deployment transaction `0xc126769fdbe9688ba96c30a54a45d022a1f73ab6539cb80149260636cb1d0252` succeeded at block `28872174`; creation calldata exactly matches the frozen creation bytecode plus FLOW / temporary owner / publisher constructor arguments.
- Block-pinned state: FLOW `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF`; owner `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD`; publisher `0x971E7790FE6C8F77dc666Bb05D4aedA362653f94`; pending owner zero; paused false; batch/daily caps 10,000 FLOW each; balance/free balance 10,000 FLOW; liabilities zero; max recipients 100.
- This verification submitted public Solidity sources only: no signing, key access, financial transaction, deployment, funding, role change, unpause or cutover occurred. Source verification is not a new security audit or authorization to activate rewards.
