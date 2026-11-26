# REQUEST AT THE RIGHT TIME — owner inputs deferred

Current status: **GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER**. This is deliberate, not a development failure and not a fabricated configuration. Do not request or invent addresses now.

Request the following only after independent human review, wallet acceptance readiness and explicit separately authorized deployment planning:

1. **Guardian Safe:** a deployed BNB-chain (chain ID 56) Safe contract address. Independently read its deployed code, owners and threshold at a recorded block. Prefer **2-of-3** (proposal only, not configured).
2. **Treasury Safe:** a different deployed BNB-chain Safe contract address. Independently read its code, owners and threshold at a recorded block. Prefer **2-of-3**. Reject WBNB, USDT, the Pancake router, zero/placeholder addresses, duplicate owners, threshold below 2 and fully overlapping owner sets.
3. **Fee and payout consent:** choose 0, 5 or 10 bps and explicitly consent to output-fee payment to the Treasury Safe. No rate or recipient is selected now.
4. **Pause/recovery policy:** document who proposes, approves and executes pause/unpause and how Safe owner recovery is handled. The candidate guardian is immutable and pause-only; there is no sweep or upgrade role.
5. **Review limits:** confirm slippage, maximum size and whether to retain user-approved `minNetOut` without server quote signing or introduce a separately reviewed signed-quote trust root. Current candidate ceilings are 1 BNB / 1,000 USDT input, 30 seconds / 100 blocks quote freshness and 120-second deadline ceiling.
6. **Final source acceptance:** record the UTC date on which the exact reviewed source SHA256 is accepted. Any later source change creates a new candidate and resets review.

**Never request private keys, seed phrases, recovery phrases, session keys or signed deployment transactions.**
