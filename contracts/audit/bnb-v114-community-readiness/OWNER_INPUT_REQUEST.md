# OWNER INPUTS — direct-EOA exception recorded, final gates pending

Current status: **OWNER_DIRECT_EOA_CHOICE_RECORDED / OWNER_EOA_EXCEPTION_PROPOSED**. This is not deployment, role-configuration, fee, funding or publication authorization.

The earlier deferred Safe-collection checklist is retained as the preferred governance standard: separate BNB56 Safes, preferably 2-of-3. The owner has instead deliberately preferred these direct regular-wallet EOAs:

- Guardian: `0x351E236a636c8be4Fa0B602cb096d72346D1a412`
- Treasury: `0xb7322660B40561ae7C224F963e51583e923F7fC8`

The following remain separate decisions or evidence gates:

1. **Explicit risk acknowledgment:** read and separately accept every item in `DIRECT_EOA_RISK_ACKNOWLEDGMENT.json`. The owner preference message itself does not acknowledge those risks.
2. **Fee and payout consent:** select 0, 5 or 10 bps and explicitly consent to payment to the direct EOA Treasury. The recipient preference is recorded, but no rate or actual payable configuration is selected.
3. **Issuer/transfer evidence:** Treasury USDT issuer restriction is **UNKNOWN**, not safe or clear. Empty address code does not establish blocklist status, balance or transferability.
4. **Pause/recovery policy:** document single-key pause/unpause operations and the absence of Guardian or Treasury rotation without redeployment. Never collect keys or recovery phrases.
5. **Control verification:** do not claim ownership or key custody unless a deliberate off-chain signature-verification step is separately authorized and completed. No signature is requested now.
6. **Fresh final-preparation evidence:** repeat both exact address observations on BNB Chain official and PublicNode at one new pinned chain-56 block, with matching block hash and empty code. Historic block 135,782,648 is not final-preparation evidence.
7. **Review limits:** confirm slippage, maximum size and user-approved `minNetOut` without server quote signing, or separately review a new signed-quote trust root.
8. **Final source acceptance:** record the UTC date for the exact reviewed source SHA256. Any later Solidity change creates a new candidate and resets review.

**Never request private keys, seed phrases, recovery phrases, session keys or signed deployment transactions.**
