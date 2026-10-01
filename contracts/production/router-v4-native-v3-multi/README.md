# Router V4 — Native V3 Multi-Pool Extension (new candidate, BOT Testnet only)

Built on the final size-safe Router V4 (19,720 bytes). Purely additive: zero
lines of the baseline removed or changed (see `SOURCE_DIFF_vs_final_19720.patch`).
Historical testnet V4 `0xEcd8…089A` and the unconfigured Mainnet V4 are untouched.
Router V3 is unchanged.

## Build (deterministic)
solc 0.8.20, optimizer 200, viaIR, shanghai, metadata ipfs.

| | bytes | sha256 |
|---|---|---|
| baseline runtime | 19,720 | — |
| extended runtime | 21,838 | `a42e53b15977c57b81fa63c575b9cb39100b873c50a523b68f02df7bd8bec41d` |
| extended creation | 22,138 | `0d8edf638018bbab64d54b304dd578792fd290bdd5111dad537defe6e70db3c1` |
| EIP-170 headroom | 2,738 | |

Clean rebuild reproduces the same runtime hash. On-chain runtime at the testnet
candidate equals the local hash exactly.

## Source changes
- errors `InsufficientOutput`, `ResidualBalance`
- `swapNativeToTokenV3MultiSafe(routerId, tokenOut, encodedPath, swapAmount, amountOutMinimum, to, deadline, maxProtocolFee)` payable
- `swapTokenToNativeV3MultiSafe(routerId, tokenIn, encodedPath, swapAmount, amountOutMinimum, to, deadline, maxProtocolFee)`
- internal `_nativeV3Prologue` (zero amount/recipient, deadline, active V3 router, WBOT start/end, existing `_validateV3Path`, fee bound) and `_v3ExactInput` (exact approval, `exactInput`, allowance clear, exact-pull residual check)
- Fee once on original input; `msg.value == swapAmount + fee`; output measured by balance delta and re-checked against `amountOutMinimum`; native-out unwraps only the WBOT delta; failed delivery reverts all.
- `HopParams`, `swapMultiHopSafe` and all existing functions unchanged. No calldata execution, no multicall.

## Tests (forge)
Old V4: 35/35. New: 32/32 (`test/V31_NativeV3Multi.t.sol`), all at a non-zero fee.
Test-harness fix only: `MockERC20.transferFrom` marked `virtual` (the old suite did not compile without it).
Fork simulations (`test/fork`): BOT→USDT→FLOW and back PASS on BOT Mainnet and Testnet copies.
Slither (`SLITHER.txt`): 6 medium/high-class hits, all triaged — fee send to owner-set treasury (pre-existing), intentional strict-equality residue checks, guarded reentrancy (pre-existing), intentionally ignored `exactInput` return (balance delta used).

## BOT Testnet candidate (chain 968)
- Router `0xd985B142F7d614577f08e2736C67d6b5Bcd41C1E`, deploy tx `0xb51fef2419bca9082e2dd29a0a0bc56e85f4efd6a8b5e36fcd9f900f28302365`
- Owner: rehearsal wallet `0x8512…f3dD` (testnet only); treasury `0xFA3D…7e47` (same as historical testnet V4)
- Activation delay 120 s `0xcc0df3…8a21`; register BDEX V3 SwapRouter only `0x60f972…5173`; fee 1 bps `0x1c6fad…5e94`; activate after delay `0xd01b14…10f0`
- BOT→USDT→FLOW: `0x2631d49cd21a62a539eb6d6a3d24c498c1c649266da2748becb1fc06dbe13d37` — 0.01 tBOT in, 979.1678 FLOW out, fee 0.000001 tBOT once, 1 SwapActivity, gas 257,737
- FLOW→USDT→BOT: `0xd69626f33e73d293ec29de8b7757099a7247a70bcb746a2ce973d098e57921bb` — 0.74517 FLOW in, 0.00000744 tBOT out, fee 0.0000745 FLOW once, gas 283,225 (approve `0x7e564f…a98b`)
- After both: router BOT/WBOT/USDT/FLOW = 0, all allowances = 0. Slippage probe reverts.

## CaSwap → BDEX V2 via existing swapMultiHopSafe
Not available on BOT Mainnet: CaSwap only lists CA/caWBOT; BDEX V2 only USDT/WBOT; caWBOT ≠ WBOT, so no shared intermediate. Mixed-router V2 hop logic is proven with mocks only.
