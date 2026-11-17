# FlowBridge BNB Swap Adapter V1.6 — LOCAL CANDIDATE (NOT DEPLOYED, NOT AUDITED)

Supersedes V1.4 as the working candidate; V1.4 (`../bnb-swap-adapter-v1`) stays frozen and unedited.
Change vs V1.4: USDT→BNB platform fee is paid as WBNB (ERC-20 transfer) instead of a native call to the fee recipient,
removing a recipient-controlled DoS/gas-grief path (EIP-7702 lets an EOA gain code after construction).
Unsolicited balances (forced native, donated USDT/WBNB) are ignored by per-call deltas and are permanently unrecoverable: no sweep by design.
Not registered anywhere; fenced by `src/lib/bnb/adapterCandidateFence.test.ts`. Automated review only — not a professional audit.

## V1.6 delta
Logic identical to frozen V1.5 (only pragma, contract name and header comments differ). Compiled with solc 0.8.38 (npm `solc-0.8.38`), optimizer 200 runs, evmVersion `cancun` (PUSH0/TSTORE/TLOAD/MCOPY probed live on BNB Chain via eth_call). Reproduce: `node contracts/candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs`. LOCAL CANDIDATE — NOT DEPLOYED, NOT AUDITED, NOT REGISTERED.
