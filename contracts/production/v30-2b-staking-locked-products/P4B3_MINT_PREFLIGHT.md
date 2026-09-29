# P4B.3 Mint Preflight — BLOCKED (mainnet writes: 0)

Block 24899120, tick 367401 (inside medium 362800–373000 and narrow 364600–371200).
Position manager: 0xDAc3FcFF004d8a8675b94E44941A1a2e3b240090. Signer: 0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD.

| Position | FLOW | USDT | Liquidity |
|---|---|---|---|
| Medium | 4,342,266.600817 | 571.802141 | 222448044190473256 |
| Narrow | 39,080,399.407356 | 5,732.707708 | 3147967365201244583 |
| Total | 43,422,666.008173 | 6,304.509849 | |

Committed FLOW after: 49,999,999.99999 (<= 50M). Post-mint 30%: down $1,231.64 / up $698.82; both covered.
Oracle 0x0, EPOCH_ROLE/PUBLISHER_ROLE unassigned, no router/rewards calls.

Blocker: both mint simulations revert `STF` (token transfer failed). Signer holds 11,874.10 FLOW and
0.000002 USDT, with 0 allowance to the position manager. Needs 43,422,666.01 FLOW + 6,304.51 USDT and two exact approvals.

Note: the 50M layout-C 30% figure is ~$692–699 (the ~$1,446 figure in P4B3_OWNER_DECISION.md was the 100M result).
Unsigned calldata: P4B3_MINT_PREFLIGHT.json -> unsigned.tx1 / tx2 (deadline expires 30 min after the block; regenerate before signing).
