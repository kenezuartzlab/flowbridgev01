# Real-device manual acceptance — ALL UNVERIFIED

No physical-device run, wallet signature, funded trade or transaction submission has been done. Simulated EIP-1193 unit/browser checks are not device acceptance. BNB execution is disabled, so every BNB row must remain preview/blocked. WalletConnect must be absent from every wallet list.

Devices: Android + TokenPocket, Android + MetaMask, Rabby desktop extension (Rabby mobile only if it exposes an injected provider).

| # | Case | Expected | TokenPocket | MetaMask | Rabby |
|---|---|---|---|---|---|
| 1 | Open review disconnected | No account request/signature; disconnected state | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 2 | Explicitly connect injected wallet | One account request; no signature prompt | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 3 | Reject connection | Clear rejection; no review or signature | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 4 | WalletConnect option | Not shown on preview or production | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 5 | Switch account mid-review | Quote invalidated | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 6 | Switch BOT 677 <-> BNB 56 | Network badge follows; BNB 677 mismatch rejected | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 7 | Token/tier/amount change mid-review | Quote invalidated | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 8 | Quote age 30/31 sec and 100/101 blocks | Boundary accepted/stale respectively | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 9 | Fee and NET output | Exact fee once; NET after fee; no fee chosen by app | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 10 | Slippage acknowledgement / above ceiling | Required / rejected | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 11 | 0x indicative price | Display-only; cannot sign or execute | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 12 | Gas unavailable / simulated | Honest unavailable / clearly simulated label | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 13 | Disconnect mid-review | Review invalidated; no sign/send | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 14 | Official BNB logo in picker/badge | Correct original proportions/colors; BOT distinct | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 15 | RPC/quote error | Fails closed, readable error | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 16 | Swap title 32px single line; flat five-tab nav; docked ad X 44px | Geometry intact; no extra Trade-header row | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 17 | No live BNB Swap CTA | No sign/send action exists | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 18 | BOT swap quote + rewards page | Existing behavior unchanged; funded trade only if separately authorized | UNVERIFIED | UNVERIFIED | UNVERIFIED |

Tester / device model / OS / wallet version / date: _______
