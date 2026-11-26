# BNB V1.16 — Direct-EOA governance readiness

**Status: OWNER_DIRECT_EOA_CHOICE_RECORDED / OWNER_EOA_EXCEPTION_PROPOSED. Development: PASS for non-executable work. Financial launch: HOLD / NO-GO.**

This records a deliberate owner governance preference, not deployment authorization. No mainnet deployment, verification transaction, contract write, wallet signature, approval, funding, fee activation, production publication, BNB/RWA execution or BOT mainnet route change occurred. No private key, recovery phrase or wallet prompt was requested. This is internal engineering evidence, not an independent human audit or certification.

## Exact owner preferences and historical evidence

| Role | Exact owner-provided address | Historical read-only classification | Current decision |
|---|---|---|---|
| Guardian | `0x351E236a636c8be4Fa0B602cb096d72346D1a412` | Empty code at two BNB56 RPCs: EOA-or-undeployed at the snapshot | D-02 direct-EOA preference selected; risk exception acknowledgment PENDING |
| Treasury | `0xb7322660B40561ae7C224F963e51583e923F7fC8` | Empty code at two BNB56 RPCs: EOA-or-undeployed at the snapshot | D-03 recipient selected; fee bps and payable configuration UNSELECTED |

Historic evidence is pinned to BNB chain 56 block **135,782,648**, hash `0xef694504e51e2949ed0b71fa4470cb1a4c1fee3cf60962d14b34be3994c35828`, block time **2026-11-26T04:27:34Z**. BNB Chain official and PublicNode returned identical chain, block and empty-code observations. Both original EIP-55 strings were valid; the addresses are distinct, nonzero and not WBNB, USDT or the Pancake V3 router.

Empty code does **not** prove ownership, key custody, current code status, USDT blocklist status, transferability or balance. The Treasury issuer restriction remains **UNKNOWN**, not safe. The historical evidence must be refreshed at a new pinned block on both providers during final deployment preparation. No off-chain ownership-signature step was authorized or performed.

## Governance architecture exception

The preferred standard remains separate BNB56 Safe multisigs, preferably 2-of-3. `assessSafePolicy` and the existing Safe readiness path were not relaxed. The direct-EOA choice is implemented separately in `assessDirectEoaPair` and is limited to the two exact checksummed addresses above.

The pure function requires:

- exact Guardian and Treasury identities, valid EIP-55 checksums, distinct/nonzero/non-protocol targets;
- exactly two named observations (`BNB_CHAIN_OFFICIAL` and `PUBLICNODE`) for each address;
- chain 56, one expected pinned block/hash, matching empty-code bytes and empty-code keccak at both providers;
- final-preparation evidence no more than 300 seconds old when that mode is assessed; historical evidence is explicitly insufficient;
- Treasury issuer restriction `CLEAR`, separately authorized wallet-control evidence, and explicit acknowledgment of every direct-EOA risk.

UNKNOWN/BLOCKED issuer status, unverified control, missing risk acknowledgment, stale evidence, third-party substitution, wrong chain, changed code/hash or RPC disagreement all fail closed. Even a fully eligible synthetic result returns `releaseReady:false`, `canConfigureRoles:false`, `feeBpsSelected:null` and `safeVerified:false`.

## Inherent direct-EOA risks — explicit acknowledgment still PENDING

The private owner-readable record is `contracts/audit/bnb-v114-community-readiness/DIRECT_EOA_RISK_ACKNOWLEDGMENT.json`. Its status is **PENDING** and the owner preference message is explicitly not treated as acknowledgment.

1. One Guardian private key can pause and unpause every user swap.
2. Guardian key compromise lets an attacker toggle pause and disrupt trading.
3. Lost Guardian key has no recovery or rotation because `GUARDIAN` is immutable; if paused, users may remain blocked indefinitely without redeployment.
4. Treasury key compromise can divert fees already received; future fees remain sent to the immutable `feeRecipient`.
5. USDT issuer/transfer restrictions are not disproven by empty address code and may prevent fee payment.
6. Neither immutable role can be rotated without deploying and separately reviewing a new contract.

A separate explicit owner acknowledgment of every risk is required before any future launch authorization. It is not automatic from this governance choice.

## Private constructor preview and local-only execution tests

`DIRECT_EOA_CONSTRUCTOR_PREVIEW.json` contains only the exact V1.13 argument preview:

- `guardian`: the supplied Guardian EOA;
- `feeRecipient`: the supplied Treasury EOA;
- `feeBps`: `null`, with unselected 0/5/10 scenarios.

It intentionally contains **no encoded constructor calldata**, secret, deployment configuration or public-facing role activation. It is private review evidence only.

`contracts/audit/bnb-v113-community/direct-eoa.v116.evm.test.ts` compiles the frozen source and uses the existing test-only mocks in an isolated EthereumJS VM. It never connects to BNB mainnet and is not a fork, deployment or funded rehearsal. Its **21 tests** prove locally that:

- the exact empty-code EOAs are accepted by the constructor, with no EOA code check and zero constructor fund movement;
- 0, 5 and 10 bps are accepted as illustrations; 11 bps reverts with exact `BadConfig()` selector;
- both swap directions at each illustrative rate pay exact user net and exact Treasury fee with zero adapter residual/allowance;
- the EOA Guardian can pause/unpause, both swap directions stop while paused, and an unauthorized caller gets exact `UnauthorizedGuardian()` selector with no ledger effects;
- WBNB, USDT and Pancake router are each rejected as either Guardian or Treasury with exact `BadConfig()` selector; zero roles are also rejected.

These local tests do not select a fee or establish live-token behavior.

## Decision summary and unchanged gates

- **D-01:** OPEN — quote trust/no signed-quote choice; caller-provided snapshot is not an oracle.
- **D-02:** direct EOA Guardian preference selected; final risk acknowledgment and recovery/pause policy remain open.
- **D-03:** direct EOA Treasury selected; fee rate, issuer-clear evidence and actual payable configuration remain open.
- **D-04:** OPEN — freshness, slippage and size policy.
- **D-05:** OPEN — WalletConnect dependency removal/upstream remediation.

`OWNER_DECISIONS.md` and the V1.15 address-verification record contain the same status. All five decisions remain unresolved for launch because D-02/D-03 still have explicit final gates.

Unchanged: six Slither HIGH reentrancy-balance warnings **OPEN** and unsuppressed; zero substantive signed human reviews; physical devices **UNVERIFIED**; installed WalletConnect transitive Zod HIGH **OPEN** with WalletConnect globally OFF; `BNB_EXECUTION_ENABLED=false`; `LAUNCH_HOLD=true`; `launchGate.go=false`. Solidity was unchanged, so no new Slither run was claimed in this gate.

## Verification results

- Focused governance/address/local-EVM tests: **61/61 PASS** — 29 launch-readiness, 11 address-verification and 21 direct-EOA EVM tests.
- Full application suite: **3,504/3,504 PASS**, **287 files** (baseline 3,472 + 32).
- TypeScript: `oj typecheck -b --noEmit` **PASS**.
- Production build: **PASS**; existing bundler module-directive warnings did not fail the build.
- Compact Swap: **640 assertions / 20 cases PASS** at 320/360/390/430/1280, light/dark and reduced/no-preference motion. The first run timed out during preview initialization; immediate retry passed all cases.
- Fixed compact ads/navigation: **5,036 assertions PASS** at 320/360/390/430/1280 and both motion modes.
- No UI component or styling code changed; these checks confirm existing 32px Swap header, flat bottom navigation and docked compact-ad behavior remain intact.
- Frozen V1.13 source SHA256: **`5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`**, unchanged; candidate-directory diff from head `b0021f132a617f13a7272758b39eccef2dbbf0e1` is empty.
- Private-address isolation check found no application imports/references outside the scoped pure policy and tests. Private packet regeneration and `SHA256SUMS` verification are reproducible; two consecutive generations are identical.

## Next blockers

Obtain substantive signed human review and resolve the six HIGH warnings; separately acknowledge every direct-EOA risk; choose fee bps and payable consent; establish issuer/transfer and wallet-control evidence through separately authorized methods; refresh both address observations at final preparation; resolve D-01/D-04/D-05, dependency and physical-device gates; then seek explicit deployment authorization. None of these is bypassed by the exception. **GO: none. Launch remains HOLD / NO-GO.**
