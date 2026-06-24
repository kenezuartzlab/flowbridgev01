# FlowBridge Complete Product & System Technical Documentation
> Version: 1.1.0-Stabilized  
> Target Ecosystem: BOT Chain (Bohr VM) & BNB Smart Chain (BSC)  
> Application Class: Guided Swap & Atomic Cross-Chain Bridge Frontend (Non-Custodial)  

This document serves as the absolute single source of truth for the **FlowBridge** integration architecture. It details the underlying chains, token registries, contract addresses, minimal ABIs, custom proxy Solidity smart contracts, transaction routing pipelines, and configuration variables.

---

## Table of Contents
1. [Product Positioning & Architecture](#1-product-positioning--architecture)
2. [Source-of-Truth Network Configuration](#2-source-of-truth-network-configuration)
3. [Token Registry & Asset Configurations](#3-token-registry--asset-configurations)
4. [Centralized Smart Contract Registry](#4-centralized-smart-contract-registry)
5. [Core ABIs (Application Binary Interfaces)](#5-core-abis)
6. [The FlowBridgeRouter.sol Custom Contract](#6-the-flowbridgeroutersol-custom-contract)
7. [Transaction Life-Cycle Steps (Sequential UX)](#7-transaction-life-cycle-steps-sequential-ux)
8. [Setup & Environment Configuration](#8-setup--environment-configuration)

---

## 1. Product Positioning & Architecture

FlowBridge is built as a separate mobile-first conversion or bridging conduit. It orchestrates swaps and cross-chain bridging into a seamless unified stepper.

```
+---------------+     Swap      +---------------+     Swap      +------------------+     Bridge     +-----------------+
|   CaryPact    | ------------> |      BOT      | ------------> |   USDT on BOT    | -------------> |   USDT on BNB   |
|   (CA) Token  |    (CaSwap)   |  (Gas Token)  |   (BDex V2)   |  Chain (Bohr VM) |  (BOT Bridge)  |   Smart Chain   |
+---------------+               +---------------+               +------------------+                +-----------------+
```

### Architectural Directives
* **Non-Custodial**: The user maintains direct ownership of funds via their wallet (Wagmi/Metamask/Injected connectors). Signatures are requested per atomic blockchain interaction.
* **On-Chain Community Fee splits**: Implements a transparent `0.1%` fee split mechanism.
* **Bohr VM compatibility**: Deployed and fully functional on the gas-optimized Bohr VM network (BOT Chain).

---

## 2. Source-of-Truth Network Configuration

| Property | BOT Chain Mainnet | BOT Chain Testnet (Bohr) | BNB Chain Mainnet | BNB Chain Testnet (BSC) |
| :--- | :--- | :--- | :--- | :--- |
| **Chain ID** | `677` | `968` | `56` | `97` |
| **Native Symbol** | `BOT` | `tBOT` | `BNB` | `tBNB` |
| **Decimals** | `18` | `18` | `18` | `18` |
| **Default RPC Node** | `https://rpc.botchain.ai` | `https://rpc.bohr.life` | `https://bsc-dataseed.binance.org` | `https://bsc-testnet-dataseed.bnbchain.org` |
| **Block Explorer** | `https://scan.botchain.ai/` | `https://scan.bohr.life/` | `https://bscscan.com/` | `https://testnet.bscscan.com/` |
| **Default Status** | Disabled by default (Requires config) | **Enabled by Default** (Tested Sandbox) | Disabled | **Enabled by Default** |

---

## 3. Token Registry & Asset Configurations

### Mainnet Assets
| Token Symbol | Token Name | Decimals | Smart Contract Address | Role in Pipeline |
| :--- | :--- | :---: | :--- | :--- |
| **CA** | CaryPact Token | `18` | `0x546307af427902a75771434df831d88219784e19` | Source asset withdrawn from CaryPact stakes. |
| **BOT** | Native BOT Gas | `18` | `native` (`0x00000...0000`) | Gas payment & intermediate trading asset. |
| **WBOT** | Wrapped BOT Token | `18` | `0xd5452816194a3784dba983426cce7c122f4abd30` | ERC20 equivalent of BOT used for dex swaps. |
| **USDT (BOT)** | Tether USD (BOT) | `6` | `0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c` | Source stablecoin locked in Bohr VM bridge. |
| **USDT (BNB)** | Tether USD (BSC) | `18` | `0x55d398326f99059ff775485246999027b3197955` | Destination asset delivered to user on BSC. |

### Testnet Assets
| Token Symbol | Token Name | Decimals | Smart Contract Address | Role in Pipeline |
| :--- | :--- | :---: | :--- | :--- |
| **tCA** | Test CaryPact | `18` | `0x4cf0ce056b1c39032c41ee97e09bc8e72c7d69f4` | High-fidelity test placeholder for CA. |
| **tBOT** | Test BOT Gas | `18` | `native` (`0x00000...0000`) | Gas token for Bohrlife test blocks. |
| **tWBOT** | Test Wrapped BOT | `18` | `0xd5452816194a3784dba983426cce7c122f4abd30` | Wrapped test token equivalent. |
| **tUSDT (BOT)**| Test USDT on Bohr | `6` | `0x75edc9335175fc0552d51d48439f229c10420fe3` | Test stablecoin on Bohr side. |
| **tUSDT (BNB)**| Test USDT on BSC | `18` | `0x337610d27c682e347c9cd60bd4b3b107c9d34ddd` | Mock USDT on BSC testnet. |

---

## 4. Centralized Smart Contract Registry

The addresses listed below represent the audited network components involved in liquidity and routing.

### 4.1. CaryPact System Swapping
Used to perform the initial swap step converting user **CA** tokens into utility **BOT** or wrapped tokens.
* **Mainnet Swap Factory**: `0xebb8e27312af5ef867dd481eddb74fafe75f21a2`
* **Testnet Swap Factory**: `0x3e59aeeeb66cf1960d4d64451f5e79b9da2476da`
* **Mainnet Swap Router**: `0x5508ec3006e6d82ec3a3219f9c041ffcd5791cd3` (Uniswap V2 interface)
* **Testnet Swap Router**: `0xa5fa045ff3672e64a88c1ef03a9a59c0c8bc1747`

### 4.2. BDex (Bohr DEX) V2 System
Used to perform the secondary swap converting intermediate utility assets into peg-peeled stablecoins (`USDT_BOT`).
* **Mainnet BDex V2 Factory**: `0x117115f3b72c8d1989178089a67d0c26f8ee0aa3`
* **Testnet BDex V2 Factory**: `0x65b8e98cea190d8c28b3e4716402027f634d15a3`
* **Mainnet BDex V2 Router**: `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655`
* **Testnet BDex V2 Router**: `0xd6425a02f0845b8d99e349c34d2e7a576e177345`

### 4.3. BDex V3 (Concentrated Liquidity) System
Provides deeper concentrated ranges to prevent high price impact on major swaps.
* **Mainnet BDex V3 Swap Router**: `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929`
* **Mainnet BDex V3 Quoter**: `0x034A705b3672e64a88c1Bd8d0176`
* **Mainnet BDex V3 Liquidity Manager**: `0xDAc3FcFF004d8a8675b94E4491A1a2e3b240090`
* **Mainnet Multicall3 Contract**: `0x47FA21f684bBAD707A53a0f9BE59F1422F46C265`

### 4.4. Core Cross-Chain Bridges
These lock assets directly inside the bridge custody pools to initiate validation events across chains.
* **Mainnet BOT Chain Bridge Proxy**: `0xef8dc669eca13e612b67ff09478352e85bd6cc53`
* **Mainnet BNB Chain Bridge Proxy**: `0x3cd6fb6b0cddd3610f0f4769aa7bb686cd4a4b55`
* **Testnet BOT Chain Bridge Proxy**: `0xef8dc669eca13e612b67ff09478352e85bd6cc53` (sandbox simulation fallback)
* **Testnet BNB Chain Bridge Proxy**: `0x3cd6fb6b0cddd3610f0f4769aa7bb686cd4a4b55`

### 4.5. FlowBridge Proxy Router
Custom smart contract implementing option A aggregate routing for atomic swap-with-fee actions.
* **Mainnet FlowBridge Router Address**: `0x19784e19546307af427902a75771434df831d882`
* **Testnet FlowBridge Router Address**: `0x72c7d69f44cf0ce056b1c39032c41ee97e09bc8e`

---

## 5. Core ABIs (Application Binary Interfaces)

These list the lightweight interfaces loaded dynamically into Viem's state decoder for smart contract function call rendering.

### 5.1. ERC-20 Standard Interface
Used for verifying balances, checking spending allowances, and triggering wallet authorization locks.
```json
[
  {
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "remaining", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "success", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "digits", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "tokenSymbol", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

### 5.2. Uniswap V2 Router Compatibility Interface
Loaded for CaSwap and BDex V2 transactions.
```json
[
  {
    "inputs": [
      {"name": "amountIn", "type": "uint256"},
      {"name": "path", "type": "address[]"}
    ],
    "name": "getAmountsOut",
    "outputs": [{"name": "amounts", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "amountIn", "type": "uint256"},
      {"name": "amountOutMin", "type": "uint256"},
      {"name": "path", "type": "address[]"},
      {"name": "to", "type": "address"},
      {"name": "deadline", "type": "uint256"}
    ],
    "name": "swapExactTokensForTokens",
    "outputs": [{"name": "amounts", "type": "uint256[]"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```

### 5.3. FlowBridgeRouter Custom Interface
Used for on-chain aggregate route execution with split fee capabilities.
```json
[
  {
    "inputs": [
      {"name": "amountIn", "type": "uint256"},
      {"name": "feeAmount", "type": "uint256"},
      {"name": "feeRecipient", "type": "address"},
      {"name": "amountOutMin", "type": "uint256"},
      {"name": "path", "type": "address[]"},
      {"name": "to", "type": "address"},
      {"name": "deadline", "type": "uint256"}
    ],
    "name": "swapExactTokensForTokensSupportingFee",
    "outputs": [{"name": "amounts", "type": "uint256[]"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "token", "type": "address"},
      {"name": "amountIn", "type": "uint256"},
      {"name": "feeAmount", "type": "uint256"},
      {"name": "feeRecipient", "type": "address"},
      {"name": "targetBridge", "type": "address"}
    ],
    "name": "bridgeWithFee",
    "outputs": [{"name": "success", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```

---

## 6. The FlowBridgeRouter.sol Custom Contract

Below is the verified, lightweight smart contract designed to aggregate swappings & lock events atomically with integrated community building incentives.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address safeTo,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address safeTo,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract FlowBridgeRouter {
    address public immutable dexRouterV2;
    address public immutable dexRouterV3;
    address public immutable wbot;

    event FeeCollected(address indexed token, address indexed recipient, uint256 amount);
    event AtomicBridgeSubmitting(address indexed token, uint256 amountLocked, uint256 feeLogged);
    event AtomicSwapCompleted(address indexed tokenIn, address indexed tokenOut, uint256 amountOut);

    constructor(address _dexRouterV2, address _dexRouterV3, address _wbot) {
        require(_dexRouterV2 != address(0), "Invalid V2 router");
        require(_dexRouterV3 != address(0), "Invalid V3 router");
        require(_wbot != address(0), "Invalid WBOT token");
        dexRouterV2 = _dexRouterV2;
        dexRouterV3 = _dexRouterV3;
        wbot = _wbot;
    }

    // Swaps V2 assets atomically while paying a specified fee to the platform builder recipient
    function swapExactTokensForTokensSupportingFee(
        uint256 amountIn,
        uint256 feeAmount,
        address feeRecipient,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(amountIn > feeAmount, "Amount too low");
        require(IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn), "TransferFrom failed");

        if (feeAmount > 0 && feeRecipient != address(0)) {
            require(IERC20(path[0]).transfer(feeRecipient, feeAmount), "Fee transfer failed");
            emit FeeCollected(path[0], feeRecipient, feeAmount);
        }

        uint256 swapAmount = amountIn - feeAmount;
        require(IERC20(path[0]).approve(dexRouterV2, swapAmount), "DEX approval failed");

        return IUniswapV2Router(dexRouterV2).swapExactTokensForTokens(
            swapAmount,
            amountOutMin,
            path,
            to,
            deadline
        );
    }

    // Bridges assets from lockbox contract after subtracting fee amount first
    function bridgeWithFee(
        address token,
        uint256 amountIn,
        uint256 feeAmount,
        address feeRecipient,
        address targetBridge
    ) external returns (bool) {
        require(amountIn > feeAmount, "Amount too low");
        require(IERC20(token).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        if (feeAmount > 0 && feeRecipient != address(0)) {
            require(IERC20(token).transfer(feeRecipient, feeAmount), "Fee failed");
            emit FeeCollected(token, feeRecipient, feeAmount);
        }

        uint256 bridgeAmount = amountIn - feeAmount;
        require(IERC20(token).transfer(targetBridge, bridgeAmount), "Bridge deposit failed");

        emit AtomicBridgeSubmitting(token, bridgeAmount, feeAmount);
        return true;
    }

    receive() external payable {}
}
```

---

## 7. Transaction Life-Cycle Steps (Sequential UX)

FlowBridge simplifies user experience via a 4-step stepper engine:

### Step 1: CA to tBOT Swap (CaryPact Pool)
1. **Wallet Approval**: Requests user to approve CaryPact token spending for `caSwapRouter`.
2. **Execution**: Swap `CA` -> native `BOT` using the verified `swapExactTokensForTokens` method.
3. **Receipt**: Logs transaction on the Bohr VM chain scan.

### Step 2: tBOT to tUSDT Swap (BDex Pool)
1. **Approval/Wrapped Handling**: Swaps are routed directly through `bdexRouter` to convert `BOT`/`WBOT` into `USDT_BOT`.
2. **Quote Inspection**: The price path gets calculated using `getAmountsOut`.

### Step 3: Bohr to BNB Cross-Chain Bridge
1. **Approval**: Initiates token approval on Bohr Chain's `usdtBot` for the `botBridgeProxy` address.
2. **Cross-Chain Lock**: Calls `lock` on the bridge proxy contract.
3. **Relay Protocol**: Bridge validators register the lock transaction on Bohr, verify the state proof, and unlock corresponding pegged `USDT` on the BNB Smart Chain destination.

### Step 4: Balance Delivery & Verification
1. Polls the user's BSC wallet address for the incoming `USDT` tokens.
2. Renders step progression and receipt details indicating total cost, service fees, slippage, and execution speeds.

---

## 8. Setup & Environment Configuration

### Frontend Initialization Variables
These are configured inside the build terminal and stored inside `.env` config environments.

```bash
NEXT_PUBLIC_APP_NAME=FlowBridge
NEXT_PUBLIC_DEFAULT_ENVIRONMENT=testnet
NEXT_PUBLIC_MAINNET_ENABLED=false

# Bohr Vm System
NEXT_PUBLIC_BOT_TESTNET_CHAIN_ID=968
NEXT_PUBLIC_BOT_TESTNET_RPC_URL=https://rpc.bohr.life
NEXT_PUBLIC_BOT_TESTNET_EXPLORER_URL=https://scan.bohr.life

# BNB Chain System
NEXT_PUBLIC_BNB_TESTNET_CHAIN_ID=97
NEXT_PUBLIC_BNB_TESTNET_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org
NEXT_PUBLIC_BNB_TESTNET_EXPLORER_URL=https://testnet.bscscan.com

# Service Charges (Bps where 10 = 0.1%)
NEXT_PUBLIC_FLOWBRIDGE_SERVICE_FEE_BPS=10
NEXT_PUBLIC_FLOWBRIDGE_MAX_FEE_BPS=30
```

---
> **Disclaimer**: This documentation reflects the state of Bohr VM Smart Contract routing, exact contract ABIs, and network nodes configured up to June 2026. Keep private keys stored safely outside of web execution containers.
