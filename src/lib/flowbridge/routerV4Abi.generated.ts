/**
 * GENERATED — do not edit by hand.
 * Source: contracts/production/router-v4-native-v3-multi (compiled with solc
 * 0.8.20, optimizer 200, viaIR, shanghai). Regenerate from the compiled
 * artifact; the ABI parity test fails if this drifts from the artifact JSON.
 */
export const FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "initialFeeTreasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "MAX_REGISTRY_ACTIVATION_DELAY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "bridgeActivationTime",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeFeeBps",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeProxyExecutionEnabled",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeResourceId",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeSupportsBotGas",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridgeTokenSupported",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bridges",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "bridge",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainName",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "computeBridgeFee",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bridgeAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "fee",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "effectiveBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "computeRouterFee",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "fee",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "effectiveBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeConfigNonce",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeExempt",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeTreasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBridgeSupportedTokens",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getFeeConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "_globalFeeBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_maxFeeBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_feeTreasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "globalFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerBotBridge",
    "inputs": [
      {
        "name": "bridge",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainName",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "supportedTokens",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "resourceIds",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      },
      {
        "name": "supportsBotGas",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerBridge",
    "inputs": [
      {
        "name": "bridge",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainName",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "destChainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "supportedTokens",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerRouter",
    "inputs": [
      {
        "name": "router",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rtype",
        "type": "uint8",
        "internalType": "enum FlowBridgeRouterV4.RouterType"
      },
      {
        "name": "wrappedNative",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registryActivationDelay",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rescueERC20",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rescueNative",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "routerActivationTime",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "routerCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "routerFeeBps",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "routers",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "router",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rtype",
        "type": "uint8",
        "internalType": "enum FlowBridgeRouterV4.RouterType"
      },
      {
        "name": "wrappedNative",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setBridgeActive",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBridgeFeeBps",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBridgeProxyExecutionEnabled",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "enabled",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBridgeSupportsBotGas",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "supported",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBridgeTokenResource",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "resourceId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFeeExempt",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "exempt",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFeeTreasury",
    "inputs": [
      {
        "name": "newTreasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setGlobalFeeBps",
    "inputs": [
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMaxFeeBps",
    "inputs": [
      {
        "name": "newMax",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRegistryActivationDelay",
    "inputs": [
      {
        "name": "newDelay",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRouterActive",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRouterFeeBps",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapMultiHopSafe",
    "inputs": [
      {
        "name": "hops",
        "type": "tuple[]",
        "internalType": "struct FlowBridgeRouterV4.HopParams[]",
        "components": [
          {
            "name": "routerId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "path",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "amountOutMin",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "finalAmountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapNativeToTokenSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feePool",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "amountOutMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "swapNativeToTokenV3MultiSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "encodedPath",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMinimum",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "swapTokenToNativeSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feePool",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapTokenToNativeV3MultiSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "encodedPath",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMinimum",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address payable"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapV2Safe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amounts",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapV3MultiSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "encodedPath",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMinimum",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapV3SingleSafe",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feePool",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amountOutMinimum",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxProtocolFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateBridgeSupportedTokens",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokens",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateRouterWrappedNative",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newWrappedNative",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BridgeActivity",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "resourceId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "destinationChainId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "protocolFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "withBotGas",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeBotGasSupportSet",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "supported",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeFeeBpsSet",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeProxyExecutionSet",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "enabled",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeRegistered",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "bridge",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "destChain",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "destChainId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeStatusChanged",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeSubmitted",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "bridgeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "destChainId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BridgeTokenResourceSet",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "resourceId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeeCollected",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "treasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeeExemptSet",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "exempt",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeeTreasurySet",
    "inputs": [
      {
        "name": "oldTreasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newTreasury",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GlobalFeeBpsSet",
    "inputs": [
      {
        "name": "oldBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IntegrationActivationScheduled",
    "inputs": [
      {
        "name": "kind",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "activationTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MaxFeeBpsSet",
    "inputs": [
      {
        "name": "oldMax",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newMax",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MultiHopExecuted",
    "inputs": [
      {
        "name": "tokenIn",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RegistryActivationDelaySet",
    "inputs": [
      {
        "name": "oldDelay",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newDelay",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterFeeBpsSet",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "bps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterRegistered",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "router",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "rtype",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum FlowBridgeRouterV4.RouterType"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RouterStatusChanged",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SwapActivity",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "routerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "protocolFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SwapExecuted",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenOut",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "swapAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ActivationDelay",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BelowGlobalFee",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BridgeNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ContractPaused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DeactivateFirst",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DeadlinePassed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DelayTooLong",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DestinationRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicatePathToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExceedsAbsoluteMax10",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExceedsMaxfeebps",
    "inputs": []
  },
  {
    "type": "error",
    "name": "HopTokenMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Hops210",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IdenticalEndpoints",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IdenticalTokens",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IncorrectMsgValue",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientOutput",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidBridge",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPathToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRecipient",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRouter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTokenin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTokenout",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTreasury",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidWrappednative",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LengthMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MalformedV3Path",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MultiHopV2Only",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NameRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeDeliveryFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeFeeFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotV2",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotV3",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerNotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerNotPending",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathInputMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathMustEndWrappedNative",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathMustStartWrappedNative",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathOutputMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathTooShort",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ProtocolFeeChanged",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RescueFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ResidualBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ResourceRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterInactive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenCallFailed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokenNotContract",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokenNotSupported",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenOperationFailed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokensRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnsupportedTransferToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "V3InputMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "V3OutputMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "V3PathTooShort",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;

export const FLOW_BRIDGE_ROUTER_LENS_GENERATED_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "flowRouter_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "findBestV2Rate",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "found",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "bestRouterId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bestAmountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "flowRouter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IFlowBridgeRouterV4View"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActiveBridges",
    "inputs": [],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "names",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "destChainNames",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "destChainIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "addrs",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActiveRouters",
    "inputs": [],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "names",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "versions",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "types_",
        "type": "uint8[]",
        "internalType": "enum FlowBridgeRouterLens.RouterType[]"
      },
      {
        "name": "addrs",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBestV2Rate",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "bestRouterId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bestAmountOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "allAmountsOut",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBridgeRouteConfig",
    "inputs": [
      {
        "name": "bridgeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "gateway",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "destinationChainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "resourceId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tokenSupported",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "botGasSupported",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "proxyExecutionEnabled",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBridgesPage",
    "inputs": [
      {
        "name": "start",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "addrs",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "destChainIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "actives",
        "type": "bool[]",
        "internalType": "bool[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRouter",
    "inputs": [
      {
        "name": "routerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "router",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rtype",
        "type": "uint8",
        "internalType": "enum FlowBridgeRouterLens.RouterType"
      },
      {
        "name": "wrappedNative",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoutersPage",
    "inputs": [
      {
        "name": "start",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "addrs",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "actives",
        "type": "bool[]",
        "internalType": "bool[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getV2RatesPage",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "path",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "start",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "amountsOut",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "BridgeIdOutOfRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicatePathToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IdenticalEndpoints",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFlowRouter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPathToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PathTooShort",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterIdOutOfRange",
    "inputs": []
  }
] as const;
