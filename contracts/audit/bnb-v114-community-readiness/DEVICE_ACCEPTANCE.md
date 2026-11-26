# Real-device manual acceptance — ALL UNVERIFIED

No physical-device run and no funded trade has been done. Funded trades require separate owner authorization; BNB execution is disabled so BNB rows can only verify preview/blocked states.

Devices: Android + TokenPocket, Android + MetaMask, Rabby (desktop extension; Rabby mobile only if it exposes an injected provider). WalletConnect must be **absent** from every wallet list.

| # | Case | Expected | TokenPocket | MetaMask | Rabby |
|---|---|---|---|---|---|
| 1 | Connect injected wallet | Connects, no signature prompt | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 2 | WalletConnect option | Not shown on preview or production | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 3 | Bind wallet, reject signature | Clear error, nothing bound | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 4 | Bind wallet, approve signature | Bound once | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 5 | Switch account mid-review | Quote invalidated | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 6 | Switch BOT 677 <-> BNB 56 | Network badge follows; BNB shows unavailable | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 7 | Official BNB logo in picker/badge | Correct, original proportions | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 8 | BNB min output + fee preview | Preview only, no sign button | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 9 | Slippage above ceiling | Rejected with message | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 10 | RPC/quote error | Fails closed, readable error | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 11 | Swap title 32px single line; flat 5-tab nav; docked ad X 44px | Geometry intact | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 12 | BOT swap quote + rewards page | Works as before (funded trade only if authorized) | UNVERIFIED | UNVERIFIED | UNVERIFIED |

Tester / device model / OS / wallet version / date: _______
