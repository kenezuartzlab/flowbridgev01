# V30.1D.4 — Deployment Readiness Freeze

## Verdict: FLOWBRIDGE V30.1D.4 DEPLOYMENT READINESS FREEZE BLOCKED

All three production Safes now VERIFY against live BOT Mainnet 677 chain state
(exact 3-owner membership, threshold 2). The only remaining blocker is procedural:
no owner decision is recorded in the append-only store for this decision version.
Non-technical compliance and feature-only liquidity decisions no longer block
technical readiness. Public writes performed: **zero**.

Decision version `V30.1D.4` · candidate digest `fnv1a64:19671fd13a81be19` ·
manifest hash `fnv1a64:8d8e875bd65595b1` (zero owner decisions recorded).

## 1. Read-only Safe verification (chain 677, `https://rpc.botchain.ai`)

Methods used: `eth_chainId`, `eth_getCode`, `eth_call getOwners()` (`0xa0e67e2b`),
`eth_call getThreshold()` (`0xe75235b8`). No transaction, no signature.
All three addresses carry 171 bytes of proxy code with code hash
`0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`.

| Authority | Address | Live owners | Live threshold | State |
| --- | --- | --- | --- | --- |
| Governance | `0x88A4…9507` | 3 | 2 | VERIFIED |
| Operations | `0x1Ce0…59eF` | 3 | 2 | VERIFIED |
| Treasury | `0xeFc1…9Ea4` | 3 | 2 | VERIFIED |

Treasury Safe `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` returns exactly the
approved owner set — `0xF951…b25e`, `0xAbe9…75E1`, `0x2eA5…a1F0` — with
threshold 2. Owner count (3) and threshold (2) are exact on all three Safes and
no mismatch remains.

## 2. Staking semantics correction

Reward-treasury **inventory** and Year-1 **distribution authority** are now
separate quantities:

- Approved funded inventory: **10,000,000 FLOW** — accepted, no longer a blocker.
- Year-1 maximum distribution: **≤ 3,000,000 FLOW** (Genesis ≤ 1,000,000,
  standard ≤ 2,000,000) — still hard-capped.
- Maximum weekly reward budget: **≤ 50,000 FLOW** per 7-day epoch, and it must
  annualise (×52) within the approved Year-1 maximum.
- A launch product set still requires funded reserves plus an explicit owner
  activation approval; deployment readiness never implies activation.

## 3. Gating classification

| Gating | Decisions |
| --- | --- |
| `DEPLOYMENT` | FLOW economics, three Safe plans, Root Publisher, Activity Attester, timelock, rewards launch, staking launch, gas budget, dependency snapshot |
| `FEATURE_ONLY` | Liquidity and oracle plan — gates swap/oracle feature activation only |
| `NON_TECHNICAL` | Legal sign-off — informational, never a technical gate |

`LIQUIDITY_AND_ORACLE_PLAN` and `LEGAL_SIGNOFF` are reported separately as
`featureOutstanding` and `deferredNonTechnical`; neither can block
`DEPLOYMENT_READY`.

## 4. Staged model preserved

`SOURCE_READY → DEPLOYMENT_READY → DEPLOYED_VERIFIED → FUNDED_READY →
FEATURE_ACTIVE` is unchanged. Current staged readiness: **SOURCE_READY**, because
no owner decision is recorded in the append-only store for this decision version.
Router swaps, direct bridge, rewards claims, staking genesis/floors, dynamic
staking and the activity registry all stay inactive. The dynamic staking bonus
stays 0 while the FLOW/USDT TWAP source is `PENDING_POOL`. BridgeAdapter mainnet
execution stays disabled.

## 5. Closure requirement

Supply the Treasury Safe owner set that matches chain state exactly (replace
`0x2eA5…a1F0` with the live `0x2c9f…19cc`, or change the live Safe), then record
the three Safe decisions plus the remaining deployment decisions against
candidate digest `fnv1a64:19671fd13a81be19`.

## 6. Application gates

36 release-freeze tests pass; full suite green; typecheck clean; production build
OK. No V26–V30 regression.

## 7. Zero-public-write confirmation

Safe creations 0 · Safe configuration changes 0 · mainnet deployments 0 · testnet
deployments 0 · wallet signatures 0 · blockchain transactions 0 · FLOW
transfers/funding 0 · liquidity actions 0 · rewards claims 0 · staking actions 0.
All chain access this session was read-only JSON-RPC.
