# BNB V1.14 — Community launch readiness & security gate closure (2026-11-26)

**Status: HOLD / NO-GO.** Base commit `043f717df182649e43e2b9d425dde56b757694d8`. Preview-only. No BNB mainnet deployment, no mainnet transaction, no wallet signature, no approval, no fee, no guardian/treasury selection, no RWA activation, no publish, no paid engagement. AI-prepared evidence is **not** an independently signed human audit. Human reviewer sign-off: **PENDING (0)**.

"V1.14" names this readiness gate only. **No V1.14 Solidity candidate was created**: no concrete Solidity bug was found. V1.13 source SHA256 `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425` (verified unchanged; `git diff 043f717d -- contracts/candidates` empty), solc 0.8.38, optimizer 200, cancun.

## 1. WalletConnect / Zod HIGH (GHSA-mrhx-c7xc-m3w5, zod <4.6.6)
Package graph (bun.lock, before = after; no dependency changed):
```text
@walletconnect/ethereum-provider@2.23.10 -> @reown/appkit@1.8.19 -> @reown/appkit-wallet@1.8.19 -> zod@3.22.4 (exact pin)
@coinbase/cdp-sdk@1.54.0 -> zod@3.25.76 (also <4.6.6; flagged by bun audit, not by the production scan)
app root zod@4.6.6 (patched)
```
Upstream options checked on npm: latest `@walletconnect/ethereum-provider@2.26.0` still uses `@reown/appkit@1.8.19`; latest `@reown/appkit-wallet@2.0.0` still pins `zod@3.22.4`. **No compatible upstream fix exists.** A zod 4 override would be a major-version override into code written for zod 3 — rejected as unsafe.

Mitigation implemented: `WALLETCONNECT_SECURITY_HOLD = true` in `src/lib/wallet/walletConnectFlag.ts` disables WalletConnect on every host (preview, localhost, production), and env `true` cannot re-enable it. `PRODUCTION_WALLETCONNECT_ON` set to `false` (it was `true` in code at the base commit — corrected here). Injected MetaMask/Rabby/TokenPocket and wallet binding are unaffected (tests).

Classification: **UNREACHABLE but INSTALLED. The HIGH finding stays OPEN.** Removing the dependency awaits owner decision D-05.

## 2. Governance & decisions (non-executable)
`src/lib/bnb/launchReadiness.ts` (+15 tests): EIP-55 checksum, chain 56, code present, threshold ≥2, no protocol target, guardian ≠ treasury. No real addresses provided → **NOT_CONFIGURED**; `canConfigureRoles` is always `false`; `launchGate` can never return GO. Fee illustration 0/5/10 bps (on 1000 USDT gross: 0 / 0.5 / 1 USDT), `chosen: false`. Decisions D-01…D-05 all `OWNER_DECISION_PENDING`. Tests confirm a user-approved min output is required and that network/account/tier/amount changes and stale quotes are rejected. The quote snapshot is caller-provided, not an oracle; a sandwich within the user's slippage remains possible.

## 3. Private human review packet
`contracts/audit/bnb-v114-community-readiness/` (PRIVATE, not imported, not published): README, exact ABI/creation/runtime bytecode (`creation keccak 0x84b4f23b…112e`, runtime `0x8410959b…469f`, both reproduce MANIFEST), six HIGH traces, threat model, checklist, blank human-only attestations, device plan, SHA256SUMS over 24 files incl. BOT V4 crosswalk/fork evidence/tests. Regenerate: `node scripts/bnb-v114-packet.mjs` (fails on drift).

## 4. Device acceptance
`DEVICE_ACCEPTANCE.md`: 12 manual cases × TokenPocket/MetaMask/Rabby, all **UNVERIFIED**. Automated: `scripts/swap-chain-selector-check.py` **PASS 640 assertions / 20 cases** (320/360/390/430/1280 × normal/reduced motion; 32px Swap title). Only change to the checker: page wait timeout raised to 30s after a cold-load timeout; no assertion changed.

## 5. Results
| Check | Result |
|---|---|
| Full suite | **3,434 / 3,434** pass, 283 files (baseline 3,418 + 15 readiness + 1 net WalletConnect test) |
| Wallet focused | 128 / 128 |
| Typecheck / build | pass / build OK |
| Slither 0.11.6 fresh, 0 suppressions | 18 findings: 6 High, 6 Low, 6 Informational — same as before; **6 HIGH OPEN** |
| Production dependency scan | 1 HIGH (WalletConnect→zod), OPEN |
| bun audit (prod+dev) | 1 high (zod), 1 moderate (minimatch, dev) |
| Read-only BNB RPC | block 135,747,936, chain 56; code present WBNB 3,124 B, USDT 4,413 B, router 12,154 B; zero writes |
| Local Anvil fork | **NOT RUN** this gate (anvil/forge not available in sandbox); prior fork evidence at block 135,686,033 included by hash |
| Mutation tests | not re-run |

## 6. Gates still open
Human reviewer sign-off; D-01…D-05; guardian and treasury Safes (NOT_CONFIGURED); real-device tests; Zod HIGH (installed); minimatch moderate (dev); six Slither HIGH; separate authorization for any deployment/funded trade. **HOLD remains.**
