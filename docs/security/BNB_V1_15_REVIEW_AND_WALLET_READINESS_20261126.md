# BNB V1.15 — Owner-input-deferred community review + wallet dry-run acceptance

**Development: PASS for non-executable review/testing. Launch: HOLD / NO-GO.** Base: `d2aa1c22915f8f97125116543be63c478ed0baee`. Preview-only. No V1.15 Solidity candidate was created because no concrete contract defect required one.

No deployment, mainnet write, wallet signature, funded rehearsal, fee activation, Guardian/Treasury selection, Safe deployment, production publication, reward change, live BNB/RWA route or secret collection occurred. This is AI-prepared evidence, **not an independent audit, external certification or human sign-off**.

## 1. Frozen identity and deferred owner input

V1.13 is byte-for-byte unchanged from the base commit:

- Source SHA256 `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`
- ABI SHA256 `d4453c306a097b9141ef62403bcefa3c436a7fd90dcc888805e75d94e5b9b856`
- Unlinked runtime file SHA256 `f9919c16f1ac98b1c0195150b7373006113d33b1c83385aafca7b8d77ade8f9e`
- Creation keccak `0x84b4f23b60097ccb65b0e817a703e3a0e9eee5e5426bb81e60fefd2bdb22112e`
- Unlinked runtime keccak `0x8410959bb5c8d0d69f4a1ab9c3c4cc9a4748e6cf35af58c73f6fa53ae059469f`
- solc 0.8.38, optimizer 200, cancun; no deployed BNB adapter address exists.

`src/lib/bnb/launchReadiness.ts` now exposes `GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER` and `developmentReadiness()`: development may pass while `LAUNCH_HOLD`, `BNB_EXECUTION_ENABLED=false` and no financial authorization remain. Missing addresses return `NOT_CONFIGURED`, never READY.

Future `SafeFacts` require chain 56, deployed code, read-only RPC provenance, a positive observation block, valid unique nonzero owners and threshold ≥2. Synthetic tests cover valid distinct 2-of-3 facts and rejection of zero/placeholders, protocol targets, duplicate owners, wrong chain, missing code/provenance, same Guardian/Treasury and low threshold. Even valid facts return only `READY_FOR_HUMAN_REVIEW`; `canConfigureRoles` is always false and `launchGate` can never return GO.

The request-at-right-time checklist is `contracts/audit/bnb-v114-community-readiness/OWNER_INPUT_REQUEST.md`: two distinct BNB-chain Safes with independently read code/owners/threshold (2-of-3 preferred only), 0/5/10 bps and payout consent, pause/recovery policy, slippage/size/quote policy and final source-hash acceptance date. **No addresses were requested or invented. Never request private keys or recovery phrases.**

## 2. Private substantive human-review workflow

The existing private packet at `contracts/audit/bnb-v114-community-readiness/` now contains:

- exact artifact identities and reproducible compile/test commands (`REPRODUCE.md`);
- six exact Slither IDs and traces (`SLITHER_HIGH_TRACES.md`) plus harness mapping (`EXPLOIT_HARNESS.md`);
- independent reviewer questionnaire, blank response template and human-only attestation register;
- 90-day response expiry and immediate invalidation on Solidity/ABI/runtime change; source changes require a new candidate and reset review;
- owner-input checklist and physical-device matrix, all UNVERIFIED.

`src/lib/bnb/communityPeerReview.ts` validates exact hashes, dates, signature presence and all six finding dispositions. It supports **FINDING_CONFIRMED**, **FALSE_POSITIVE_WITH_JUSTIFICATION** (detailed justification required), and **UNVERIFIED**. Status is explicitly **ZERO_REVIEWERS**, **ONE_REVIEWER**, or **MULTIPLE_REVIEWERS**; duplicate reviewer contacts are deduplicated. AI/bot sign-off, wrong hashes, expired/incomplete responses and empty justifications are rejected. Responses never confer launch approval or certification.

**Actual status: ZERO_REVIEWERS, 0 substantive signed human responses, 0 human attestations.** The blank template is not a response. No reviewer was contacted and nothing was uploaded publicly.

Packet regeneration twice produced the same 43-file `SHA256SUMS`; manifest SHA256 `b999b2510ab3ea528ce497e1b10e4ce4b617eaaa6c9802f742321d945dc0d002`. `sha256sum -c` passed every entry.

## 3. Non-funded injected-wallet review dry-run

`src/lib/bnb/walletDryRun.ts` is pure preview review infrastructure with no transport, calldata, allowance, signer or live CTA. Its simulated EIP-1193 provider supports only account connection/reads and explicitly throws for `personal_sign`, `eth_sign*`, `eth_signTransaction`, `eth_sendTransaction` and `eth_sendRawTransaction`.

Tests cover MetaMask, TokenPocket and Rabby: no passive connection; explicit account request only; connection rejection; BNB 56 versus BOT 677; wrong network; account/token/tier/amount change; disconnect; 30/31-second and 100/101-block boundaries; exact 0/5/10 bps fee and NET output; slippage acknowledgement; 0x indicative non-execution; gas unavailable versus clearly simulated estimate. Gas is never fabricated as a wallet quote.

`WALLET_REVIEW_POLICY` states that visible review is separate from on-chain checks, the user-supplied snapshot is **not a verified oracle**, and sandwich loss within the approved floor remains possible. `reviewBnbSwap` still always returns `canSign:false`; dry-run adds `canSubmit:false`.

Chromium ran the real Trade preview at 390×844 with simulated providers for all three wallets: exact fee `0.003` and NET `5.997` on a gross 6-unit fixture, only `EXECUTION_DISABLED`, zero WalletConnect SDK requests, zero wallet write requests, no page errors and no Swap/Approve/Connect action in the BNB locked view. Screenshot: `/tmp/browser/bnb-v115-wallet/390-bnb-no-execution.png` (temporary QA evidence). **Physical MetaMask/TokenPocket/Rabby devices: NOT VERIFIED.**

## 4. Dependency and actual bundle reachability

The global `WALLETCONNECT_SECURITY_HOLD` remains ON on every host; only a code change may lift it. No package was removed, upgraded or overridden. D-05 remains OWNER PENDING and the HIGH is **not patched**.

Final production build graph (`docs/security/bnb-v115-evidence/bundle-import-graph.json`):

- client entry `index-D7iyRWRI.js`, SHA256 `0dfab4c062ddb9c71d33c8306017c28b39304b4ebd85b26328d83e81ebef5a9b`;
- 261 client JS files; 32 files in the static entry closure;
- eager `wagmi-DSQECd5j.js` contains only the connector wrapper/dynamic edge, not the SDK;
- SDK entry `dist-BBEmemwr.js` is absent from static entry; its dynamic closure has 69 files;
- Reown/W3m schema `ApiController-CBrB2BrO.js` is dynamic-only and absent from static entry;
- patched app Zod 4 code is eager in `schemas-C6Rg-Knd.js`; this is distinct from WalletConnect Zod 3;
- no `@coinbase/cdp-sdk` client chunk was found.

This proves the vulnerable WalletConnect SDK/schema path is not in the entrypoint static bundle in this build; it does **not** remove installed code or prove every possible future build safe. The hold remains required.

Current lockfile graph:
- `@walletconnect/ethereum-provider@2.23.10` → `@reown/appkit-wallet@1.8.19` → `zod@3.22.4` (HIGH, installed, dynamic-only in this build).
- `wagmi` → `@wagmi/connectors` → `@base-org/account` → `@coinbase/cdp-sdk@1.54.0` → `zod@3.25.76` (below fixed 4.6.6; no CDP client chunk found).
- Root `zod@4.6.6` is patched.
- Production dependency scan: **1 HIGH** (WalletConnect transitive Zod).
- All-scope `bun audit`: **1 HIGH + 1 MODERATE**. The moderate is minimatch globparts amplification; installed copies are 3.1.5, 10.2.5 and 11.0.5 across ESLint/typescript-eslint/react-email tooling. It remains reported, not suppressed or claimed fixed.

## 5. Six HIGH findings and data/security quality

Fresh Slither **0.11.6** with exact solc **0.8.38**, optimizer 200, cancun and zero suppressions: **18 findings = 6 High + 6 Low + 6 Informational**. Running by basename in the candidate directory reproduced the packet IDs exactly:

1. `35bbdd20078e1184ac60bb820046e27ed822c6b0b4d5afe4b93a15db21ab7190`
2. `39e09e6f46da48fcc6637535a3b9e68eee3d28e0824aacb871a95734f7d2311a`
3. `643f5e0602aefd6a089f4c1f47c3b480c40efd862a9280d9f9efc0a0de4a0042`
4. `be23b08d0d903b9351a60acae031b18c0e8eebda8d91d548a981504a9ca86d4f`
5. `c6ff56409ede0d3e80f9c35555eb7abc485d20e1c0c07a72f52387c59ad9d176`
6. `d34aa27be72a6343f53d92f611f0082b8e1c60a5272c143d0f5771e019b313a1`

All remain **OPEN** and unsuppressed. Full traces are in `docs/security/bnb-v115-evidence/slither-summary.json`. Existing mocks probe every warned callback point, output/donation mismatch, exact deltas, allowance clearing and rollback: **257/257** harness tests passed (85 BOT parity + 74 adapter + 98 community review). No exploit was reproduced. More repetitions of identical mocks cannot decisively prove live WBNB/USDT/router behavior or future upgrades; real-bytecode reviewer/fork evidence and human analysis remain necessary. No source change was justified.

## 6. Exact verification results

| Check | Final result |
|---|---|
| Full suite | **3,461 / 3,461**, 285 files (baseline 3,434 + 27) |
| Focused wallet suite | **138 / 138**, 16 files |
| New + adjacent focused checks | **87 / 87**, 6 files |
| Local exploit/review harness | **257 / 257**, 3 files |
| Typecheck | **PASS** (`oj typecheck -b --noEmit`) |
| Production build | **PASS** |
| Simulated Chromium wallets | **PASS** for MetaMask/TokenPocket/Rabby; 0 SDK/write requests |
| Swap responsive/theme/motion | **640 assertions / 20 cases**, widths 320/360/390/430/1280, light/dark, reduced/no-preference |
| Bottom ad + flat navigation | **5,036 assertions PASS**, same five widths; 360 coverage added |
| Official BNB branding | **201 checks / 20 cases + fallback PASS** |
| Private packet | **43 files**, all hashes OK, repeated generation identical |
| Slither | **18 findings; 6 HIGH OPEN**, no suppressions |

Evidence indexes: `docs/security/bnb-v115-evidence/validation-results.json`, `wallet-browser.json`, `bundle-import-graph.json`, `slither-summary.json`, and `bun-audit-all.txt`.

## 7. Decisions, verified boundaries and next gate

D-01 quote trust, D-02 Guardian/recovery, D-03 Treasury/fee/consent, D-04 freshness/size/slippage and D-05 WalletConnect removal are all **OWNER_DECISION_PENDING**. Guardian and Treasury are deliberately deferred, not placeholders. Public BOT mainnet swaps, rewards and staking were not changed.

**Verified:** pure/mock/unit behavior, simulated browser behavior, actual production bundle graph, responsive layout and reproducible packet. **Mocked:** EIP-1193 wallets, tokens/router/EVM targets. **Untested:** physical devices, real wallet prompts, live Safe ownership, deployment, funded transactions and independent human review. No external certification is claimed.

**GO: none. Development gate: PASS. Launch: NO-GO / HOLD.** Next gate: obtain genuine signed human responses and disposition the six HIGH findings; complete physical-device acceptance and owner D-01…D-05 decisions. Only after those and explicit separately authorized deployment planning may the owner-supplied Safes be collected and validated read-only. Deployment, fees and any funded BNB/RWA action require further separate authorization.
