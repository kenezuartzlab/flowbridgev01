# V30.2B P2B — Mainnet Activity Canonicalization Gate — PASS

Repair of the canonical economic identity of the four historical BOT Mainnet
(677) FlowBridgeRouter v3 core swaps, followed by a re-run of the P2A Genesis
Core Swap Canary eligibility at the frozen cutoff block **21,553,131**.

Evidence: `contracts/production/v30-2b-activity-canonicalization/P2B_CANONICALIZATION.json`
Script: `contracts/production/v30-2b-activity-canonicalization/scripts/p2b-canonicalize.mjs`

## Verified event source (exact deployed Router v3)

- Router v3: `0x986962de6F00D0eC571b1a34Fa70AEeB445b5445` (live, unchanged, not promoted)
- `SwapExecuted(uint256 indexed routerId, address indexed tokenIn, address indexed tokenOut, address sender, address recipient, uint256 swapAmount, uint256 amountOut, uint256 fee)`
- topic0 `0x927ca8b36d4e2f5dfd8714cd69677b2deda6f17ad7ed9b304b6525a1643d9b46`
- Canonical amount is the on-chain `swapAmount`. Client-supplied amounts are never used.

Chain 677 was added to the verifier as an **evidence-only** path
(`executionEnabled: false`). Router V4 was not promoted; no route, bridge or
feature configuration changed.

## Canonicalized activities (actual receipt log indexes)

| tx | block | txIndex | actual log index | verified activity id |
| --- | --- | --- | --- | --- |
| `0x396b25…c0516` | 20,400,804 | 0 | 5 | `0xc81fb5c9…6c4b3060` |
| `0x716faf…9ac9f` | 20,400,922 | 0 | 5 | `0x1b560adb…30520307` |
| `0xb4348e…65f3` | 20,401,190 | 0 | 5 | `0x9aad7576…362368f1` |
| `0xd5be1d…4f56` | 20,419,230 | 0 | 8 | `0x12af76b9…e194dc31` |

All four previously stored a placeholder `:0` activity key with a null log index
and no canonical verified-activity mapping.

## Zero economic delta

| metric | before | after |
| --- | --- | --- |
| ledger rows | 23 | 23 |
| total FLOW Points | 3,986 | 3,986 |
| total base points | 3,991 | 3,991 |
| verified USD | 3,800.495660890672 | 3,800.495660890672 |

Points, base points, USD attribution, multipliers, APR and reward rates were not
recalculated. Historical chain 968/1024 ledger rows were not touched.

## Integrity results

- 43/43 checks pass; verdict **PASS**.
- Every repair is idempotent: a full second apply reported `inserted: false`,
  `bound: false`, no row changes.
- Collision scan clean — no two ledger rows collapse onto one canonical identity.
- Fail-closed unit coverage: wrong chain, wrong router target, reverted tx,
  foreign emitter, actor mismatch, zero amount, missing log, duplicate matching
  logs, and non-sender wallet all reject.
- Evidence-only verified activities carry no fabricated intent hash or nonce; a
  database constraint enforces that signed-intent records still require both.

## P2A rerun at frozen cutoff 21,553,131

- Status: **PASS**
- Winner (earliest canonical activity): `0x3d8a7fa490f9db09dd8006b74688213ace9c0164`
  via `677:0x396b25…c0516:5`, block 20,400,804
- Entitlement: exactly `1000000000000000000` wei (1 FLOW), one recipient

## State changes

Signatures 0 · broadcasts 0 · FLOW transfers 0 · campaign-budget changes 0 ·
Merkle roots 0 · epochs 0 · points awarded 0 · feature flags changed 0 ·
route promotions 0.

The 1 FLOW campaign budget remains unset, no root or epoch exists, the Root
Publisher remains unfunded, and claims remain impossible.
