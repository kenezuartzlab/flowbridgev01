# Liquidity V1 completion acceptance — 2026-10-28

## Result: production HOLD
No production deployment, contract deployment, approval signature or financial transaction was performed.

## Completed corrections
- Shared signature boundary enforces account, chain, adapter target and supported action before approvals and again after simulation.
- Exact allowance sequencing resets excess allowances, verifies resulting allowance, and does not count approvals as completed liquidity operations.
- Pool initialization and V2 initial deposit ratios use bigint math; flipped prices no longer lose scientific-scale precision.
- V2 removals use actual reserves instead of reconstructed rounded underlying balances.
- V3 increase previews show minimums/slippage/deadline; out-of-range token-1 deposits use token-1 decimals.
- Account/network changes reset reviews; stale discovery reads do not replace newer results; failed LP balance reads are not treated as zero holdings.
- Unknown receipts stay unresolved, retain hashes and block subsequent actions; failed approval cleanup is shown, not silently discarded.
- Invalid slippage blocks review instead of silently substituting a default. Mobile tabs wrap.
- Smart Trade and CaSwap swap routing were not modified.

## Fresh Mainnet reads
At block **28,243,155**, RPC reported chain **677**:
- BDEX V2 router `0x1414eD29FdFD322c3c0a830330ed982E2D629e76`: 21,987 code bytes; factory `0x117115f3B72C8d1989178089A67D0C26f8EE0AA3`; wrapped-native `0xD5452816194a3784dBa983426cCe7c122F4abd30`.
- CaSwap router `0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD`: 15,009 code bytes; runtime factory `0x9c937EBC3748825026677e20B13b5e306494a38d`; **its own** WBOT `0x68CAeA9104419203cF8b8f0B222E75709B97bfc6`.
- Runtime CaSwap CA/WBOT pair `0x0A0cfC8c3756D000bE19F0809A23f57522a594F6` passed token identity/reserve reads (84038367 CA raw units, 16566580112457 wrapped raw units).
- BDEX V3 manager `0xDAc3FcFF004d8a8675b94E44941A1a2e3b240090`: 23,444 code bytes; factory `0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419`; WETH9 `0xD5452816194a3784dBa983426cCe7c122F4abd30`.
- A separate live read at block 28,242,863 confirmed CA/WBOT/USDT decimals 18/18/6. The recorded CaSwap factory is not the router's runtime factory. The CaSwap wrapped address is a token, not a V2 pair; calling pair getters on it is not valid pool verification.

These reads establish identity and wiring, not a full external-contract security audit or token-transfer accounting proof.

## Acceptance evidence
- Full regression: **203 files / 2,068 tests passed**.
- Final liquidity + swap regressions: **12 files / 127 tests passed** (66 liquidity tests).
- Harness compilation: build OK.
- Fresh basic security scan: no new findings; two existing user-ignored findings unchanged.
- Playwright: Pools/Add/Create/My Positions at 320/390/430/1280px, no document overflow, no page errors, invalid slippage rejected, Mainnet Review disabled. Latest mobile screenshot inspected.
- These UI checks were disconnected/read-only; no actual connected-wallet signing or rejection flow was verified.

## Mandatory blockers
- Mainnet canaries require separate owner authorization and successful wallet acceptance; the canonical Mainnet write flag remains false.
- CaSwap public add/create remains allowlist-restricted; existing-LP removal lacks a signed rehearsal.
- Receipt-timeout records safely block retry but still need authoritative recovery acceptance before production write readiness can be asserted.
- Connected-wallet Add/Create/Increase/Decrease/Collect/Remove, failed signature and receipt-recovery acceptance remain unverified. No private key or wallet transaction was used to manufacture evidence.
- Production publication withheld because mandatory write acceptance has not passed.