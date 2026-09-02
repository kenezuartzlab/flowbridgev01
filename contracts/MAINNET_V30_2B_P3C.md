# FlowBridge V30.2B P3C — Locked Genesis Products Fast-Track Preflight

BOT Mainnet 677 · read-only · **no blockchain write was part of this gate**

Evidence: `contracts/production/v30-2b-staking-locked-products/P3C_PREFLIGHT.json`
Script: `contracts/production/v30-2b-staking-locked-products/scripts/p3c-preflight.mjs`
Fresh block: **21831690** (ts 1788357632)

## Result

```text
P3C: PASS
30D: CANARY_READY
90D: BLOCKED
180D: BLOCKED
365D: BLOCKED
```

## Gates reconfirmed (unchanged)

| Item | Live value |
| --- | --- |
| Controller oracle | `0x0000…0000` (unset) |
| Controller emergencyMode | false |
| Vault paused | false |
| Standard epoch committed (controller / vault) | 0 / 0 |
| EPOCH_ROLE → Controller | false |
| PUBLISHER_ROLE → `0x05F7…aB22` | false |
| Standard / dynamic staking | DISABLED |
| Vault totalPrincipal | 0 (no open liability) |
| Rewards Distributor `0x7b80…b922` | untouched, live |
| P3B Flexible product 0 | active, lock 0s, floor 0bps — unchanged |

## Live capacity

| Item | FLOW |
| --- | --- |
| Reward treasury free balance | 9,999,999.999993013698630138 |
| Treasury total obligations | 0.000000279680365296 (P3B canary dust) |
| Genesis Year-1 remaining | 999,999.999993013698630138 |
| Standard Year-1 remaining | 2,000,000 |
| Canary wallet FLOW balance | 1.000006706621004566 |
| Canary allowance → vault | 0 (Flexible approval fully consumed, not reusable) |
| Canary lifetime Genesis quota remaining | 7,774,776s of 7,776,000s |

## Deployed-contract product truth (controller R5)

Every value below was read from the verified deployed ABI, then independently
reproduced with the deployed integer arithmetic and required to equal
`FlowStakingVaultV2.quoteOpen()` exactly. All four matched exactly.

| id | Product | lock | Genesis APR | floor | min | Genesis grant | Genesis reservation | floor reservation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 30 Days | 2,592,000s | 2700bps | 800bps | 1 FLOW | 2,592,000s (30.00d) | 0.022191780821917808 | 0.006575342465753424 |
| 2 | 90 Days | 7,776,000s | 3600bps | 1000bps | 1 FLOW | 7,774,776s (89.99d) | 0.088753150684931506 | 0.024657534246575342 |
| 3 | 180 Days | 15,552,000s | 4800bps | 1200bps | 1 FLOW | 7,774,776s (89.99d) | 0.118337534246575342 | 0.059178082191780821 |
| 4 | 365 Days | 31,536,000s | 6000bps | 1500bps | 1 FLOW | 7,774,776s (89.99d) | 0.147921917808219178 | 0.150000000000000000 |

Locked products reserve the **entire** floor obligation at entry from the
standard Year-1 budget and from funded treasury inventory, or `openPosition`
reverts `FloorNotReservable`. User principal is never counted as reward
inventory. Reservations for all four fit inside live capacity.

## Simulation matrix

`openPosition(productId, 1 FLOW)` was simulated from the canary wallet against
current mainnet state. All four reverted with exactly one error:

```text
ERC20InsufficientAllowance (0xfb8f41b2)
spender  0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D
allowance 0
needed    1 FLOW
```

No fabricated oracle value, epoch, role, price or frontend-only rate was used.
Insufficient allowance is the only remaining prerequisite for the economic path.

## Per-product decisions

**30D — CANARY_READY.** Genesis grants the full 2,592,000s term, so maturity
occurs strictly inside the Genesis-covered reward period. The floor obligation
is reserved in full at entry. No post-Genesis standard-rate dependency can arise
before principal becomes withdrawable. No oracle or epoch dependency. Only
blocker is the (expected) missing exact allowance.

**90D — BLOCKED.** The product itself is Genesis-covered to maturity
(lock == 90 days == GENESIS_MAX_SECONDS), but the designated canary wallet has
already consumed 1,224s of its lifetime Genesis quota on the P3B Flexible
canary. A 90D canary from this wallet would leave a 1,224s tail covered only by
the reserved floor rate rather than by Genesis, which fails the P3C rule
"fully Genesis-covered through maturity". Unblocking requires a wallet with an
untouched 90-day Genesis quota — not a contract or funding change.

**180D / 365D — BLOCKED.** `GENESIS_MAX_SECONDS` is 90 days, so the locked term
outlives the Genesis window by 7,776,000s and 23,760,000s respectively. That
tail is contractually defined only by the fixed floor rate reserved at entry;
the variable tier stays zero while no epoch exists, so nothing is undefined or
unfunded — but the post-Genesis locked period has no proven live lifecycle, and
its safety is explicitly not inferred from the Flexible canary. They remain
non-executable until each is separately proven through maturity.

## Locked-principal canary boundary (honoured)

- No locked `openPosition` transaction was broadcast or auto-signed.
- The Flexible canary approval is not reusable (allowance is 0); any locked
  canary requires a fresh exact allowance equal to the exact principal.
- Unlimited approval is never prepared; `exactAllowanceWei === principalWei`.
- Only one locked canary may be open at a time (`openLockedPositionCount > 0`
  blocks preparation).
- Before any signature request the UI must show product name, exact principal,
  exact maturity timestamp, exact maximum Genesis reservation, floor reservation
  and earliest normal withdrawal time — all present in the prepared quote.
- Locked products have no early exit: earliest withdrawal == maturity.

## Code

- `src/lib/staking/mainnetLockedProducts.ts` — locked-product policy,
  deployed-arithmetic reproduction, canary quote preparation, terms-freeze
  fingerprint. `isLockedProductPubliclyExecutable()` returns `false`
  unconditionally, so feature-flag drift alone can never expose a locked
  product as executable.
- `src/lib/staking/mainnetLockedProducts.test.ts` — 17 deterministic tests
  covering productId identity, minimums, maturity, Genesis duration clamping,
  reservation math, insufficient reserve, wrong network, paused/emergency,
  stale terms between prepare and sign, allowance exactness, and explicit
  180D/365D post-Genesis dependency drift guards.
- No UI change: `/stake` continues to expose only Flexible Genesis as
  executable and 30D/90D/180D/365D as **Not executable**.

## No-go changes confirmed absent

No oracle configuration, no manual FLOW/USD price, no EPOCH_ROLE or
PUBLISHER_ROLE grant, no standard/dynamic epoch publication, no treasury
top-up, no new contract, no Router / Rewards / tokenomics change, no old-stack
reuse, and no public executable button for any locked product.

NEXT: obtain a wallet with an untouched 90-day Genesis quota (or explicitly
accept a floor-covered tail) before any 90D canary; the only immediately
authorizable action is a user-signed exact 1 FLOW allowance plus one 30D
`openPosition`, which needs separate explicit authorization and cannot be
declared full lifecycle PASS until maturity on 2026-10-02 and exact principal
withdrawal are proven.
