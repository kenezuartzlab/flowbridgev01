# BNB Trading V1.7 — Owner Decision Sheet (nothing is configured or authorized by this document)
Please do not sign, pay or send anything because of this sheet.

| # | Decision | Options (illustrative) | Evidence |
|---|---|---|---|
| 1 | Fee strategy | 0 bps (direct) / 5 bps / 10 bps | 5 bps costs users ≈5.0–10.6 bps total vs direct; 10 bps ≈10.0–15.6 (V1.7 §2) |
| 2 | Fee recipient on chain 56 | owner-controlled EOA or multisig (immutable in V1.6) | must be chosen and verified by owner |
| 3 | Provider | direct only / 0x plan (needs API key + terms review) / V1.6 adapter | 0x BLOCKED: no credentials; 0.15% 0x fee on select pairs |
| 4 | 0x API key | create at dashboard.0x.org, add via Lovable secrets editor only | not requested in chat |
| 5 | Slippage / TTL | proposal 50 bps / 60 s | V1.5 sandwich tests |
| 6 | Max order size | proposal 1,000 USDT eq. | sampled up to 1,000 |
| 7 | Minimum order size | ≥ 3× break-even at current gas (≈17 USDT at 5 bps) | V1.7 §2 |
| 8 | Independent audit scope | V1.6 source, Slither HIGHs, native refund, fee path, immutables | V1.6 report checklist |
| 9 | Funded rehearsal | separate written approval, capped amount | none done |
| 10 | Deployment | separate written approval after audit | none done |
| 11 | Legal | USDT/region terms; XAUt/RWA stays BLOCKED | open |
