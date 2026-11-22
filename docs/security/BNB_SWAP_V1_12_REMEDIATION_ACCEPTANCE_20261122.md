# BNB V1.12 remediation acceptance — 2026-11-22

**Preview/source only. Independent audit NOT DONE. Release HOLD.** V1.11 completed and committed before remediation (40dba5d7 / cca3646d). Frozen V1.4–V1.11 files unchanged. No public deployment, signature, real funds, live fee, database/admin change, BNB/RWA activation or publication. BOT execution untouched.

## Actual fixes and differential proof
- Hono override 4.13.11 → 4.13.19 (compatible patch, pure Web Standards runtime). Production dependency scanner: **9 → 1 rows**, eight moderate Hono rows removed. Bun audit: **7 → 2 advisories** (Hono's four moderate plus one low removed). Hono CSRF text/ping regression proves cross-origin rejected and same-origin accepted.
- V1.12 rejects adapter-as-guardian: V1.11 differential test demonstrates unusable pause authority accepted; new candidate rejects it. No guardian/address selected.
- Router amountOutMinimum now exact fee-aware gross floor for user net, rather than one wei. Differential test proves V1.11 passed one wei; V1.12 checks concrete gross floors for 0/5/10 bps with rounding. Original final net/delta checks preserved; this is defense-in-depth, NOT a claimed user fund-loss exploit fix.
- Retired stale npm package-lock.json; bun.lock is authoritative. Attempting npm synchronization hit existing exact-override conflicts and produced a divergent graph with 18 advisories; discarded that graph instead of deploying it. Existing launch-editor/Vite range declarations aligned with identical installed/override versions; no framework upgrade.

## HIGH findings: honest before/after
Same Slither 0.11.5, solc 0.8.38, optimizer 200, Cancun, 101 detectors: **18 → 18 findings; HIGH 6 → 6, LOW 6 → 6, informational 6 → 6; zero suppression**. Each path and exploit precondition is documented in bnb-v112-evidence/high-trace-review.json. No reentrancy profit reproduced. Balance snapshots remain essential for rejecting transfer-tax, mismatch, unexpected donation and stale-balance settlement. Removing them to silence Slither would weaken safety.

72 inherited/extended candidate tests plus two V1.11 differential tests = **74 V1.12 tests**. Token deposit/withdraw/approve/transferFrom/transfer callback points each attempt both swap entry points and pause; all blocked by the already-set lock. Router callback and native payout hooks blocked. False/malformed approve, empty success return, false transfer, fee-recipient blacklist, under/overpay, callback donations, unauthorized pause/unpause, two tiers, refunds, min floor, 128 seeded alternating swaps and stranded donation behavior covered. Callback mocks intentionally exceed real target capabilities; real bytecode evidence is separate.

Fixed WBNB deposit/withdraw and USDT transfers are non-hook token operations; Pancake router has canonical pool callbacks, not arbitrary adapter calls. Immutable target identity is verified on the local fork. A malicious replacement token that lies consistently about balances is outside those assumptions. Guardian censorship, chain/USDT governance, unswept donations, MEV within user slippage, meaningful quote floors and permission/legal/audit remain open. Caller snapshots are not an oracle or single-use authorization. No third-party sign-off claimed.

## Dependencies that remain
- **Production HIGH:** Zod 3.22.4 via @walletconnect/ethereum-provider → @reown/appkit-wallet. App root Zod 4.6.6 is already patched. Latest wallet provider 2.26.0 and even AppKit wallet 2.0.0 still require Zod 3.22.4; latest stable Zod 3.25.76 remains in advisory range. No blind major override to Zod 4: it violates the pinned consumer API and risks wallet boot/signing. Requires upstream compatible migration/backport and physical-wallet validation; not suppressed.
- **Dev-only moderate:** minimatch 10.2.5 via TypeScript ESLint, outside production scanner; fix requires 11.0.1 major outside consumer ^10.2.2. Left explicit, no blind override.
- **Picomatch:** no fresh advisory; installed 4.0.7 / 2.3.2 as applicable. No unnecessary major change.

## Fresh verification
- Full suite **3,021 / 3,021 PASS**, 270 files; checkable full-tests-final.log preserved. First full run caught one ABI qualified internalType mismatch; wire ABI parity normalized only the candidate name, then entire suite rerun successfully.
- Real-bytecode local fork **15 local-only transactions PASS**, both tiers/directions, guardian pause/unpause and hostile native payout; mainnet transactions/signatures/real fees **0**. 0.001 BNB direct 0.539178134528230267 USDT, candidate net 0.538908545460966152 at illustrative 5 bps; extra gas 69,078. These are fork observations, not an approved economic decision.
- Selector **640 assertions / 20 cases PASS**; logo **201 / 20 cases + asset fallback PASS**; dock/nav **3,786 PASS**; RWA **288 PASS** after replacing a 350ms temporary checker wait with actual state readiness (first run six cases then timing failure; no application changes). Mobile/desktop screenshots reviewed; official logo and 32px heading preserved.
- Harness automatic build **OK** (fresh log checked). Manual build/typecheck intentionally not run under platform rules. Physical wallets and funded swaps not tested, as not authorized.
- Fresh backend scan completed; ignored-by-user findings untouched. Persisted security results also contain unrelated application warnings, outside this BNB/dependency gate; not cleared. No overall clean-security claim.

## Frozen identities / audit packet
Source Keccak: `0xb5d725ee678e28c1e6f235b8b4fd1ef62b35780ddbbc6003aa5f3b45b5c8a478`

Creation bytecode Keccak: `0xa6f9011514704f5d9c64431eebc73266459e809185a80ad0f98b12d9844d2f53`

Unlinked runtime Keccak: `0x2a612be879adb602f0b1f8f0179883d8b920407136510130b4719e6dbecb1866`; runtime 6582 bytes. Constructor immutables require patched runtime comparison, not comparing this hash to a deployed instance.

Full source closure, ABI, creation/runtime bytecode, immutable offsets, file SHA256 and six OPEN HIGH traces: BNB_SWAP_V1_12_AUDITOR_HANDOFF_20261122.json, regenerated by scripts/bnb-v112-audit-handoff.mjs. Before/after raw Slither, dependency audits, fork/test/browser logs and trace review in bnb-v112-evidence/. Exact compiler is in MANIFEST.json. Candidate remains outside production imports/tooling.

Independent auditor sign-off, compatible upstream Zod fix, guardian policy, owner financial choices, phone wallets, logo permission and all launch approvals remain separate external gates.
