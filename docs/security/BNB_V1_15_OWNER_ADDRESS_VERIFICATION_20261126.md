# BNB V1.15 — Owner-provided Guardian/Treasury address verification

**Snapshot result: both addresses are VERIFIED_EOA. Governance policy: FAILS_SAFE_POLICY. Launch: HOLD / NO-GO.**

This was read-only identity verification of owner-provided public inputs, not deployment planning, role selection, fee activation, ownership inference or an independent human audit. No mainnet write, signature, approval, deployment, Safe creation, funds movement, production publication or BNB/RWA execution occurred. V1.13 Solidity is unchanged at SHA256 `5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425`.

## Exact observation

Private evidence: `contracts/audit/bnb-v114-community-readiness/OWNER_ADDRESS_VERIFICATION.json`. Generated at **2026-11-26T04:27:36.757Z**.

Two fixed public RPC providers were used: BNB Chain official `https://bsc-dataseed.bnbchain.org` (source: https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/) and PublicNode `https://bsc-rpc.publicnode.com` (source: https://bsc.publicnode.com/). Both returned chain ID **56** and the same pinned block:

- Number: **135,782,648** (`0x817e0f8`).
- Hash: `0xef694504e51e2949ed0b71fa4470cb1a4c1fee3cf60962d14b34be3994c35828`
- Time: **2026-11-26T04:27:34.000Z**
- Total JSON-RPC calls: **13**; write/send/sign methods: **0**.

| Proposed role | Owner input and EIP-55 canonical result | Code bytes / keccak at both endpoints | Separate status |
|---|---|---|---|
| Guardian | `0x351E236a636c8be4Fa0B602cb096d72346D1a412` | 0 / `0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470` | **VERIFIED_EOA** |
| Treasury | `0xb7322660B40561ae7C224F963e51583e923F7fC8` | 0 / `0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470` | **VERIFIED_EOA** |

Both supplied strings already had valid EIP-55 mixed-case checksums; canonical casing is unchanged. The addresses are distinct, nonzero, and neither is WBNB, USDT nor the Pancake V3 router. Empty `eth_getCode` at the same chain/block on two providers supports EOA-or-undeployed classification at that snapshot; it does not identify or prove wallet ownership. Safe ABI probes were correctly skipped because neither address has contract code, so owners, threshold, VERSION, domain, implementation and handler are not applicable.

## Recipient blocklist and governance decision

The Treasury recipient was checked against BSC USDT using the recognizable `isBlackListed(address)` and `getBlackListStatus(address)` methods at the pinned block on both providers. Every call reverted, so no authoritative supported method was established: **UNKNOWN**, not “clear” and not “blocked.” No unsupported inference was made.

Existing V1.15 policy requires two distinct verified Safe-compatible multisigs with threshold ≥2. Both EOAs fail that policy independently:

- `GUARDIAN_NOT_VERIFIED_SAFE`, `GUARDIAN_THRESHOLD_BELOW_2`
- `TREASURY_NOT_VERIFIED_SAFE`, `TREASURY_THRESHOLD_BELOW_2`

The recommendation is to create or retarget separate BNB56 Safe multisigs with threshold ≥2 only through separately authorized deployment planning. The policy was not relaxed. Neither supplied address was inserted into Solidity, frontend/public assets, production configuration, deployment manifests, wallet auto-connect, signing, Guardian selection or Treasury/fee activation. D-02/D-03 and fee bps remain pending; explicit deployment-gate approval is still required even if suitable Safes are supplied later.

## Implementation and verification

- `src/lib/bnb/addressVerification.ts`: pure EIP-55 assessment, two-provider consensus classification, Safe-compatible evidence checks and threshold-≥2 policy; no transport or role configuration.
- `scripts/bnb-owner-address-verify.ts`: fixed endpoints/targets, pinned reads, method/field allowlists, Safe ABI/proxy probes when code exists, recipient-method checks and redacted owner-set hashes. It can be rerun for future real RPC observations.
- `src/lib/bnb/addressVerification.test.ts`: 11 tests covering exact owner inputs, checksum correction/malformed input, zero/protocol targets, EOA vs contract, non-Safe ABI errors, matching Safe facts, partial/mismatched responses, chain/RPC/block/code failures, threshold policy and forbidden send/sign methods.
- Focused address + adjacent governance tests: **29/29 PASS**.
- Full suite: **3,472/3,472 PASS**, 286 files (V1.15 baseline 3,461 + 11).
- Typecheck: **PASS**. Production build: **PASS**.
- Frozen V1.13 diff: **empty**. `BNB_EXECUTION_ENABLED=false`; global WalletConnect security hold remains ON. BOT mainnet trading/rewards/staking and XAUt restrictions were not changed.

## Remaining gates

Six Slither HIGH findings remain OPEN, genuine human attestations remain 0, physical devices remain unverified, D-01…D-05 remain pending, installed dependency advisories remain open, and both proposed governance addresses fail multisig policy. Development evidence may continue; **GO: none. Launch remains HOLD / NO-GO.**
