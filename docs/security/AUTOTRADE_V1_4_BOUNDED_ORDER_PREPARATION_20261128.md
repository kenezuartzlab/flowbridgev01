# AutoTrade V1.4 — bounded gas and first-order preparation

Base: `6b0281a756054295a94ee8f6116501bd53ecdc9f`. Owner update: 2026-11-28 04:22 UTC, “Proceed gas and order until complete and success.” Recorded as **gas estimation and first-order preparation only**, within the approved **5 USDT-equivalent CA/BOT single cycle**. No exact gas cap or buy/sell price has been approved. No market fill is promised.

## Review proposal (historical, not executable)

Evidence: `autotrade-v1_4/bounded-review-observation.json` records exact observation time, block/hash and both prices. Read-only pinned BOT block **31,807,437**, observed **04:27:14.125 UTC**, quote/gas expiry **04:27:24.125 UTC**, proposed default order expiry **05:27:14.125 UTC** on Nov 28. Both ecosystem endpoints agree but are **same-operator**, not independent infrastructure. The proposal is now expired. Requote for review and again at actual order creation.

| Item | Proposed value |
| --- | --- |
| Trade ceiling | 5 USDT equivalent, including Router input fee, excluding gas |
| Indicative trade budget | 0.3925824220906443 BOT (rounded here; exact wei in evidence) |
| Gas ceiling | **0.02726992 BOT**, **0.347315 USDT** rounded upward |
| Estimated gas before contingency | 0.01136244 BOT |
| Bounded contingency | 0.01590748 BOT; 20% ceiling-rounded gas units per effect and 2x observed 20-gwei fee |
| Total proposed exposure | **5.347315 USDT**, approximately 0.4198523420906443 BOT |
| Gas fee ceiling | 40 gwei, no unbounded replacements/retries |
| Maximum buy / minimum sell | **Not selected**, user-entered BOT per CA |
| Maximum slippage | Review default 50 bps (0.5%), editable; policy range 1–300 bps, not owner approval |
| Order expiry | Review default 60 minutes, editable; proposed absolute UTC expiry returned with each ticket |
| Quote/gas proposal expiry | 10 seconds; changing parameters/wallet or expiry clears the displayed ticket |
| Authorization | Gas approval pending; exact order authorization pending; no order created |

The gas allowance is **additional** to the trade ceiling and requires separate explicit approval; total funding/spending is not authorized. This is an exact arithmetic proposal using measured local gas footprints revalued at observed mainnet fees, **not an exact future mainnet gas prediction**. Dedicated-account calldata/balance/allowance simulation must replace the footprint before gas approval. A market sell could remain unfilled; no forced loss-making sell or automatic repeat is authorized.

## Exact local simulation

Reproduce on the existing disposable local Anvil fork, literal `http://127.0.0.1:8547`, chain 677:

```text
bun scripts/autotrade/v14-bounded-gas-fork.ts
bunx vitest run src/lib/autotrade src/lib/swap/routeComparison.test.ts --maxWorkers=2
node scripts/check-bnb-swap-embargo.mjs
bunx vitest run --maxWorkers=2
```

`bounded-gas-fork.json` contains local block/hash, quote conversion, pre-effect gas estimates, exact receipts, crash recovery and zero residuals/allowances. The fixture spends $5-equivalent **disposable local** BOT and uses synthetic test bounds, not owner prices. Four effects completed:

| Effect | Simulated units | Bounded units |
| --- | ---: | ---: |
| Buy | 232,718 | 279,262 |
| Exact CA approval | 46,976 | 56,372 |
| Sell | 261,448 | 313,738 |
| Revoke | 26,980 | 32,376 |

The local fixture fee is 1 gwei, hence its own gas proposal is 0.001363496 BOT; it must **not** be represented as the mainnet 20-gwei proposal. Buy crash-after-broadcast recovered with no second signature/send; four local signatures/broadcasts, zero external signatures and zero mainnet writes. Existing high-fee rejection, nonce, reorg, approval finality, four-pair and reward-exclusion tests remain unchanged.

Actual receipt gas used differs from the pre-effect `eth_estimateGas` bounds above: buy **187,932**, approve **46,976**, sell **207,410**, revoke **26,980**. The proposal conservatively uses simulated units, not gas-refund-adjusted receipts. Implementation commit: `f060ac4d5794cd06de5047c961eff165006ca8dd`.

## Implemented ticket boundary

`canaryTicket.ts` owns pure integer/ceiling math, fresh conversion, bounds, blank targets and non-executable facts. Server preparation reads the generated local gas evidence only server-side, revalues each effect and returns total exposure. Ops has separate canary review inputs; no preview creates or populates an order, and no ticket authorizes effects. HTTP inputs are bounded before quote reads; authorized mock read-back and invalid-parameter tests verify the real handler. Live/public/registry gates remain OFF, BNB Swap embargo unchanged.

## Actual release and worker status

- **Not published or deployed.** No funds, account provisioning, external signatures or trades.
- Schedule **334** freshly read: **paused**, correct `/api/public/hooks/autotrade-worker` target. Published unsigned POST **404**; preview unsigned POST **401**. No successful scheduler invocation/new production heartbeat is claimed; historical worker samples are not current evidence.
- Signed-in owner browser reached Ops → AutoTrade and received **403**, with “Connect the wallet bound to this admin account to continue.” Actual ticket acceptance is blocked; no test-wallet spoofing or gate bypass was used.
- Source BNB release firewall PASS. Production artifact/revision and whole pending diff still unverified, so publication conditions have **not** passed. No unrelated release or security hold was changed.
- This is AI-assisted verification, **not independent human security approval**. Existing six BNB Slither HIGH findings, WalletConnect/Zod hold, human sign-offs and real-device checks remain open; no audit finding was suppressed or marked fixed.

## Shortest concrete next actions

1. Owner connects the wallet already bound to the Ops admin account; review the ticket and complete paper acceptance. Enter actual max-buy/min-sell BOT/CA, max slippage and expiry. Current defaults are proposals only.
2. Provision a separately operated BOT 677 RPC and collect seven continuous days of common-height block/hash, receipt/log/quote parity, lag/age, availability and latency evidence; zero mismatches. A second BOT hostname is not independent. Use HTTPS:443, no query/embedded credentials, no redirects; disable node administrative APIs.
3. After explicit provisioning authorization, create non-exportable secp256k1 KMS/HSM SIGN/VERIFY key and authenticated sign-only policy broker. Derive its actual EOA from public key; only then record a dedicated account address. Do not import a main-wallet seed or fund it. Broker contract: `POST /v1/transactions/sign`, exact chain 677/calldata/account/nonce/gas/fee/idempotency binding, DER/low-s/parity correctness, no export/admin permissions. Any broker credential belongs only in **Project Settings → Secrets**, never chat/client code.
4. Finish reviewed chain-677 atomic approved-order/outbox adapter and bind immutable owner-approved order parameters; paper store remains isolated at -677. Keep the source kill switch OFF. Independently review signer/IAM, RPC and durable effect recovery.
5. Obtain exact production revision/artifact, review the complete pending diff with BNB/RWA embargo intact, and complete bound-wallet acceptance before any restricted paper release. Only after reviewed deployment verify authenticated worker calls, resume schedule 334 and measure actual heartbeat/coverage/resources.
6. With the real dedicated account and exact calldata, independently requote $5→BOT and resimulate approval/buy/sell/revoke. Present fresh bounded gas, total exposure and expiry; obtain **exact gas cap, exact order and any funding authorization**. Only after all infrastructure/security/release gates pass may a separately reviewed source change be proposed for a single live canary. Public remains OFF.

## Verification results

- Focused regression: **170/170 tests**, 10 files.
- Local four-effect fixture: PASS, exact gas estimates, $5-equivalent conversion, crash recovery, zero residuals/allowances.
- Automatic preview compilation/typecheck: build OK after implementation. No manual build/typecheck run; no hosted build/deployment claimed.
- Full regression: **3,769/3,769 tests**, **303 files**, 215.09 seconds; all passed. No dependency or contract changes. Implementation commit `f060ac4d5794cd06de5047c961eff165006ca8dd`; this evidence follow-up changes documentation only.