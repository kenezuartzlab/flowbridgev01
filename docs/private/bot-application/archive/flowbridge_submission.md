# BOT Chain Builder Challenge #1 — FlowBridge Submission

> Ready-to-paste answers for the Google Form. Focus: **FlowBridgeRouter + guided swap on BOT Chain**. FlowExecutor (on-chain limit orders + keeper) is listed under Roadmap.

---

## Section 1 · Basic Info

- **Name / Team Name:** FlowBridge
- **Telegram Handle:** _<your @handle>_
- **Email Address:** kentrosh2002@gmail.com
- **Prize Wallet Address (USDT/EVM):** _<your EVM address>_
- **Submission Type:** ✅ Project Submission

---

## Section 2 · Project Submission

### Project Name
**FlowBridge — Guided Swap & Cross-Chain Router for BOT Chain**

### Track
✅ **EVM Deployment** (primary) — also touches **DApp Integration**, **DEX**, **Bridge**

### Project Summary (3–6 sentences)
FlowBridge is a mobile-first, non-custodial routing dApp that turns a multi-step BOT Chain journey — CaryPact **CA → BOT → USDT (BOT) → USDT (BNB)** — into one guided, atomic-per-leg experience. At its core is **FlowBridgeRouter.sol**, a custom Solidity aggregator deployed on BOT Chain that executes swaps through CaSwap V2 and BDex V2/V3 while transparently splitting a 0.1% community fee on-chain in the same transaction. The frontend uses Viem + Wagmi to quote paths (`getAmountsOut` / V3 quoter), simulate calls, and step the user through approvals, swaps, and the Bohr↔BNB bridge with real receipts and progress tracking. The result: a CA holder can go from CaryPact stakes to spendable USDT on BSC without ever touching a raw DEX UI or copy-pasting contract addresses. Deployed live at **flowbridge.space** against BOT Chain mainnet contracts.

### GitHub Repo or Live Demo URL
- **Live Demo:** https://flowbridge.space
- **Mirror:** https://flowbridgev01.lovable.app

### Contract Address or Transaction Hash (proof of BOT Chain integration)
- **FlowBridgeRouter (BOT Chain mainnet):** `0x19784e19546307af427902a75771434df831d882`
- **FlowBridgeRouter (BOT Chain testnet / Bohr):** `0x72c7d69f44cf0ce056b1c39032c41ee97e09bc8e`
- Routes through:
  - CaSwap Router: `0x5508ec3006e6d82ec3a3219f9c041ffcd5791cd3`
  - BDex V2 Router: `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655`
  - BDex V3 Swap Router: `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929`
  - BOT Bridge Proxy: `0xef8dc669eca13e612b67ff09478352e85bd6cc53`
- Explorer: https://scan.botchain.ai/address/0x19784e19546307af427902a75771434df831d882

### X Post URL (must @BOTChain_ai)
_<paste your tweet URL — must tag @BOTChain_ai>_

### BOT Chain Integration (multi-select)
✅ Smart Contract Deployment · ✅ DApp Integration · ✅ Wallet · ✅ DEX · ✅ Bridge · ✅ Explorer

### Technical Implementation

**Architecture.** FlowBridge is a TanStack Start (React 19 + Vite 7) SSR app deployed to Cloudflare Workers, with a non-custodial Wagmi/Viem client that talks directly to BOT Chain (chainId **677**, RPC `https://rpc.botchain.ai`) and BNB Smart Chain. All value transfer happens on-chain — the backend only stores anonymized route sessions, ledger receipts, and community-incentive accounting; keys never leave the user's wallet.

**FlowBridgeRouter.sol (custom contract on BOT Chain).** A lightweight aggregator that:
1. Pulls `amountIn` from the user via `transferFrom`.
2. Transfers a caller-specified `feeAmount` to `feeRecipient` (the community fee split, capped at 30 bps client-side, currently 10 bps = 0.1%) and emits `FeeCollected`.
3. Approves the target DEX router for the remainder and executes `swapExactTokensForTokens` (CaSwap V2 / BDex V2) or `exactInputSingle` (BDex V3) atomically, so either the fee + swap both succeed or the whole tx reverts — no dangling approvals, no partial fee capture.
4. Exposes `bridgeWithFee(token, amountIn, feeAmount, feeRecipient, targetBridge)` to atomically split the fee and forward the remainder to the Bohr↔BNB bridge proxy, emitting `AtomicBridgeSubmitting` for indexers.

Key ABI surface: `swapExactTokensForTokensSupportingFee(amountIn, feeAmount, feeRecipient, amountOutMin, path, to, deadline)` and `bridgeWithFee(...)`. Contract source is included in `/public/flowbridge_technical_documentation.md`.

**Guided Swap pipeline (the user-facing flow).**
- **Step 1 — CA → BOT** via CaSwap V2 (`swapExactTokensForTokens`, path `[CA, caWBOT]` unwrapped to native BOT).
- **Step 2 — BOT → USDT(BOT)** via BDex V3 concentrated pool (`exactInputSingle`, feePool 3000), quoted through the V3 quoter with slippage guard.
- **Step 3 — USDT(BOT) → USDT(BNB)** via the audited Bohr bridge proxy `0xef8d…cc53`; the frontend polls the destination BSC address for the incoming USDT.
- Every leg goes through `FlowBridgeRouter` where applicable so the 0.1% community fee is collected in the same tx as the swap — no separate "fee tx", no MEV/reorg race between fee and trade.

**Frontend engineering.**
- Route-level type-safe routing (TanStack Router file routes) with per-route SEO/OG metadata.
- Viem `simulateContract` before every write for accurate revert messages and gas estimates.
- Token registry + contract map are environment-aware (mainnet 677 / testnet 968 / BSC 56 / BSC testnet 97) — a single flag flips the whole app safely.
- Persisted route sessions (`src/store/routeSession.ts`) so a mobile user can background the app mid-bridge and resume with full step state and tx hashes.
- SIWE (`/api/public/siwe.*`) for wallet-bound ledger reads without server-side custody of any keys.
- Emails, receipts, and a real-time bridge tracker modal give the user block-explorer-grade confirmations without leaving the app.

**Security & correctness.** RLS on every backend table, service-role isolated to verified webhooks, all wallet-authored endpoints gated by SIWE nonce/verify. Contract-side, the router requires `amountIn > feeAmount`, checks all `transferFrom`/`approve` return values, and uses immutable router addresses set in the constructor — no admin, no upgradability, no pause switch that could rug a mid-flight user.

### Roadmap / Next Steps

1. **FlowExecutor — on-chain limit orders with a public keeper (in progress).** A deployed `FlowLimitOrderExecutor` at `0x7FE51363C6694ACddf3EBBF64B2d4A7Ef970ecB4` stores user orders (`placeOrder` / `cancelOrder`) routed to a single registered DEX (CaSwap V2 or BDex V3). A public keeper endpoint (`/api/public/hooks/keeper-tick`) scans open orders every minute, simulates `executeOrder(orderId, v2Path)` via `eth_call`, and fills any that clear their `minAmountOut` — the contract pays the keeper tip in native BOT so anyone can run one. This turns FlowBridge into an open orderbook backed entirely by BOT Chain DEX liquidity.
2. **V3 multi-hop routing** through `FlowBridgeRouter` (CA → BOT → USDT single-tx) using BDex V3 `exactInput` with encoded path, removing the current two-step CA↔USDT UX.
3. **Community proposals & incentives ledger** (already scaffolded under `/api/proposals` and `/api/users.incentives`) — fee-share dashboard for CaryPact holders, funded by the on-chain fee split the router already emits.
4. **BOT Chain native mobile wallet deeplinks** and WalletConnect v2 session persistence for a fully installable PWA experience.
5. **Public analytics** — an indexer over `FeeCollected` / `AtomicBridgeSubmitting` events for a transparent BOT Chain routing dashboard.

---

## Section 4 · Consent

- **Project Showcase Consent:** ✅ Yes
- **Info accuracy confirmation:** ✅ Confirmed

---

_Contract addresses, ABIs, and the full FlowBridgeRouter.sol source are in `flowbridge_technical_documentation.md` (also served from this app's `/public` folder)._
