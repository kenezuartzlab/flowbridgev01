## Goal

Extend the existing bridge from BOT↔BNB to also support **BOT↔ETH** (EVM) and **BOT↔TRX** (non-EVM via TronLink), driven by a destination dropdown inside the Bridge card. Zero regression to BOT↔BNB.

## Scope

### 1. Config foundation (done)
- Added ETH/Tron gateway + USDT addresses and a `USDT_BRIDGE_RESOURCE_ID` constant to `src/lib/contracts.ts`, sourced from `docs/bridge/README.md`.

### 2. Chain registration
- Add `ethereum` (chainId 1, RPC `https://eth.llamarpc.com`, explorer `https://etherscan.io`) and `sepolia` (11155111) to `src/lib/wagmi.ts` with matching transports and register in `wagmiConfig.chains`.

### 3. Bridge direction model
- Replace the two-value `bridgeDirection` union in `src/App.tsx` with:
  ```
  type BridgePeer = 'BNB' | 'ETH' | 'TRX';
  type BridgeSide = 'OUT' | 'IN'; // OUT = BOT→peer, IN = peer→BOT
  ```
  Store `{ peer, side }` in state. Derive legacy `BOT_TO_X`/`X_TO_BOT` strings where still needed for logging/labels.
- Chain-id lookup table keyed by `peer` + `isMainnet` (BNB → 56/97, ETH → 1/11155111, TRX → no EVM id).
- Bridge-gateway + USDT-address + decimals lookup keyed by peer (BNB: 18, ETH: 6, TRX: 6).

### 4. UI: destination dropdown in `BridgeCard`
- Add a compact "Destination" segmented dropdown at the top of the card (`BNB · ETH · TRX`) with the token icon. Selecting a peer updates parent state via a new `onPeerChange` prop.
- The existing swap-direction toggle stays; it flips OUT/IN for the selected peer.
- Show a small non-blocking note for TRX: "Signed via TronLink (base58)."
- When peer is TRX and TronLink isn't detected, the CTA becomes "Install TronLink" linking to `https://www.tronlink.org/`.

### 5. Recipient handling
- Keep 0x…40-hex validation for BNB and ETH.
- For TRX, validate base58 T-addresses (34 chars, starts with `T`) using a lightweight regex + `window.tronWeb.isAddress` when present.
- Auto-populate recipient with the connected EVM address (BNB/ETH) or the TronLink address (TRX). Allow override via the existing `ConfirmDestinationModal`.

### 6. Execution paths
Refactor `completeStep3` into a peer-dispatched flow (keep the current BNB code exactly as-is inside the `peer === 'BNB'` branch):

- **BOT→peer (OUT)** for BNB/ETH/TRX peers:
  Call `botBridgeProxy.deposit(destChainId, USDT_BRIDGE_RESOURCE_ID, recipient, amount)` on BOT Chain. For TRX destination, use TRX's registered destination chain id from docs (published as decimal in the BOT registry; use `728126428` — the standard BOT Chain Bridge Tron chain id — but read it from a `TRX_DEST_CHAIN_ID` constant so we can adjust). For the ETH destination, `destChainId = isMainnet ? 1n : 11155111n`.

- **BNB→BOT / ETH→BOT (IN, EVM)**:
  Approve USDT on the external gateway, then `bnbBridgeProxy.deposit(...)` / `ethBridgeProxy.deposit(...)` with `destChainId = 677n | 968n`. Reuses the existing BNB code path — ETH is the same shape.

- **TRX→BOT (IN, non-EVM)**:
  New helper `src/lib/tronBridge.ts`:
  - Detect `window.tronWeb?.ready`.
  - Build TRC-20 approve for `usdtTron` → `tronBridgeProxy`.
  - Call `tronBridgeProxy.deposit(destChainId, resourceId, recipientHex, amount)` via `tronWeb.transactionBuilder.triggerSmartContract`, sign with `tronWeb.trx.sign`, broadcast with `tronWeb.trx.sendRawTransaction`.
  - Return tx hash; explorer prefix `https://tronscan.org/#/transaction/`.

### 7. Balances + allowances
- Add `useReadContract` reads for USDT-ETH balance/allowance on Ethereum chain (mirrors the existing BNB reads).
- Add a TronLink balance fetch via `tronWeb.contract().at(usdtTron).balanceOf(base58Addr).call()` on peer change / interval.
- `BridgeCard` `balance` / `exactBalance` / `symbol` come from the peer lookup.

### 8. Status panel
- Extend `REQUIRED_CONFIRMATIONS` in `BridgeStatusPanel` with ETH mainnet (`12`) and Sepolia (`3`). Add a TRX branch that skips the EVM `getTransactionReceipt` polling and instead polls `tronWeb.trx.getTransactionInfo(hash)` for `blockNumber`; require ≥19 confirmations on Tron mainnet.

### 9. Safety guards (non-negotiable)
- Reject if `peer==='ETH'` and `ethBridgeProxy === zeroAddress` (testnet stub) — button shows "ETH bridge unavailable on testnet".
- Reject if `peer==='TRX'` and `tronBridgeProxy === ''` on testnet.
- Reject if recipient fails the peer-specific format check.
- Enforce `> 10 USDT` minimum for every direction.
- Fee logic:
  - Into BOT (peer→BOT): 0 USDT.
  - Out of BOT (BOT→peer): `max(amount * 0.001, 1 USDT)` — display separately and included in the receive estimate.

### 10. Copy + logging
- `logTransactionToDb('BRIDGE', <peer>_<side>, ...)` uses the derived legacy string so history stays consistent.
- Explorer prefixes lookup by peer (`bscscan` / `etherscan` / `tronscan`).

## Non-goals
- No changes to swap, limit-order, rewards, or auth code.
- No wagmi connector for Tron (TronLink exposes `window.tronWeb` directly — no adapter needed).
- No new tables or migrations.

## Verification
- Build passes with strict TS.
- Manual: switch BNB/ETH/TRX in the dropdown, verify balances render, verify the OUT/IN toggle correctly swaps source/destination labels, verify the CTA disables correctly for testnet-unavailable peers and for missing TronLink, verify recipient validation rejects mismatched formats (0x for TRX, T… for EVM).
- eth_call simulate the ETH→BOT `deposit` before signing to catch address-mismatch reverts early.
- Regression: BOT↔BNB path executes byte-for-byte the same calldata as today.
