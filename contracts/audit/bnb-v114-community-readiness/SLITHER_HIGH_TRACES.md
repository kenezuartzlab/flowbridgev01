# Six Slither HIGH traces — V1.13 (all OPEN)

PRIVATE. Source: `high-dispositions.json` (Slither 0.11.6, 0 suppressions). AI-prepared; not human-reviewed. Status changes require a named human reviewer in ATTESTATIONS.md.

## 1. `swapExactBnbForUsdt|deposit|wbnbBefore`
- Slither id: `35bbdd20078e1184ac60bb820046e27ed822c6b0b4d5afe4b93a15db21ab7190`
- External call: WBNB.deposit L108
- Balance read: wbnbBefore L105 -> delta!=amountIn L109
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: WBNB fixed WETH9-style code, no callbacks; lock held. Donation only causes revert. Ported: token hook point 1, forced donations.
- BOT comparison: BOT swapNativeToTokenV3MultiSafe: wBefore then deposit (BOT Slither reentrancy-balance, same shape)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**

## 2. `swapExactUsdtForBnb|_safeTransferFrom|wbnbBefore`
- Slither id: `39e09e6f46da48fcc6637535a3b9e68eee3d28e0824aacb871a95734f7d2311a`
- External call: USDT.transferFrom L127
- Balance read: wbnbBefore L124 -> delta!=gross L130
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: BSC USDT has no hooks; mocked hooks points 4/5 receive Reentrancy(). Earlier snapshot only makes check stricter.
- BOT comparison: BOT swapTokenToNativeV3MultiSafe wBefore read after pull (BOT reads later; BNB earlier)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**

## 3. `swapExactUsdtForBnb|_swap|wbnbBefore`
- Slither id: `643f5e0602aefd6a089f4c1f47c3b480c40efd862a9280d9f9efc0a0de4a0042`
- External call: Pancake exactInputSingle
- Balance read: wbnbBefore L124 -> delta!=gross L130
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: Lock + fixed router; in-callback donation/under-report rejected (ported modes 5/6/7).
- BOT comparison: BOT swapTokenToNativeV3MultiSafe wBefore/_v3ExactInput (BOT Slither HIGH)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**

## 4. `swapExactBnbForUsdt|_swap|usdtBefore`
- Slither id: `be23b08d0d903b9351a60acae031b18c0e8eebda8d91d548a981504a9ca86d4f`
- External call: Pancake exactInputSingle L146-149
- Balance read: usdtBefore L106 -> got!=gross L112
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: Router reentry -> Reentrancy() (ported both directions); under/over-report modes 5/7 revert.
- BOT comparison: BOT _v3ExactInput + outBefore delta (BOT Slither reentrancy-balance)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**

## 5. `swapExactUsdtForBnb|_safeTransferFrom|usdtBefore`
- Slither id: `c6ff56409ede0d3e80f9c35555eb7abc485d20e1c0c07a72f52387c59ad9d176`
- External call: USDT.transferFrom L127
- Balance read: usdtBefore L125 -> delta!=amountIn L128
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: This delta IS the fee-on-transfer rejection; removing it weakens safety (ported FeeOnTransfer).
- BOT comparison: BOT _collectExactTokenInput (BOT Slither reentrancy-balance HIGH)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**

## 6. `swapExactBnbForUsdt|deposit|usdtBefore`
- Slither id: `d34aa27be72a6343f53d92f611f0082b8e1c60a5272c143d0f5771e019b313a1`
- External call: WBNB.deposit L108 (precedes router)
- Balance read: usdtBefore L106 -> got!=gross L112
- Lock/callback: guarded(): locked!=1 -> Reentrancy(); lock also blocks setPaused
- State mutation: only lock flag; no stored balances/credits
- Destinations: fixed WBNB/USDT/ROUTER constants; immutable FEE_RECIPIENT, output to msg.sender
- Hostile repro: In-call USDT donation makes got!=gross revert (ported mode 6); no credit to caller.
- BOT comparison: BOT swapNativeToTokenV3MultiSafe: outBefore=balanceOf(to)
- Exploit reproduced: False
- Residual: depends on fixed WBNB/USDT/Pancake code staying hook-free on BNB56; mocks do not prove live-token behaviour; reviewer must confirm.
- Status: **OPEN**
