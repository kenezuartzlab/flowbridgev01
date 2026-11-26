# Independent human reviewer questionnaire

A response is substantive only when a real human independently performs the work, answers every question, covers all six Slither IDs and signs the exact source/ABI/runtime identity. AI assistance may be disclosed as tooling but cannot be the reviewer or signature.

## Identity and reproduction
1. Did `SHA256SUMS` verify? List any mismatch.
2. Did solc 0.8.38 / optimizer 200 / cancun reproduce the ABI, creation keccak and unlinked runtime keccak? State exact commands and deviations.
3. Which candidate tests, BOT V4 tests and local exploit harness commands did you personally run? Give counts, failures and environment.
4. Did you inspect real BNB-chain target source/code separately? What remains mocked, archived, unavailable or UNKNOWN?

## Six required finding dispositions
For each exact Slither ID below, choose **FINDING_CONFIRMED**, **FALSE_POSITIVE_WITH_JUSTIFICATION**, or **UNVERIFIED**. “Looks safe”, similarity to BOT V4, a passing test suite or another AI review is not sufficient justification.

1. `35bbdd20078e1184ac60bb820046e27ed822c6b0b4d5afe4b93a15db21ab7190` — `swapExactBnbForUsdt|deposit|wbnbBefore`
2. `39e09e6f46da48fcc6637535a3b9e68eee3d28e0824aacb871a95734f7d2311a` — `swapExactUsdtForBnb|_safeTransferFrom|wbnbBefore`
3. `643f5e0602aefd6a089f4c1f47c3b480c40efd862a9280d9f9efc0a0de4a0042` — `swapExactUsdtForBnb|_swap|wbnbBefore`
4. `be23b08d0d903b9351a60acae031b18c0e8eebda8d91d548a981504a9ca86d4f` — `swapExactBnbForUsdt|_swap|usdtBefore`
5. `c6ff56409ede0d3e80f9c35555eb7abc485d20e1c0c07a72f52387c59ad9d176` — `swapExactUsdtForBnb|_safeTransferFrom|usdtBefore`
6. `d34aa27be72a6343f53d92f611f0082b8e1c60a5272c143d0f5771e019b313a1` — `swapExactBnbForUsdt|deposit|usdtBefore`

For every disposition provide: attack precondition, external call and callback capability, lock state, balance snapshots, exact value destination, rollback behavior, test/fork evidence and residual assumptions. A confirmed finding needs a concrete reproduction and impact; a false positive needs a detailed proof argument; otherwise use UNVERIFIED.

## Differential and economic review
7. Are token pulls exact, allowances exact and zero afterward in success and failure?
8. Is the output fee charged once with correct rounding, and is `minNetOut` enforced after fee in both directions?
9. Can donations, fee-on-transfer behavior, under/over-delivery, failed native delivery or hostile callbacks create value extraction or permanent accounting corruption?
10. Are chain 56, WBNB/USDT/router and tiers 500/2500 fixed against arbitrary substitution?
11. Does the caller-supplied quote snapshot act as an oracle? Explain sandwich loss possible within the approved floor and the separate on-chain checks.
12. Are guardian/treasury Safes, fee bps, deployment and financial activation correctly absent and separately gated?

## Conclusion
State confirmed findings, justified false positives and UNVERIFIED residuals separately. Do not issue a certification or launch approval. Sign the response with PGP, a Safe message or a GitHub-signed commit that can be independently associated with the named reviewer.
