// Centralized Smart Contract Configurations & ABIs for BOT Chain / BNB Chain
import { parseAbi } from 'viem';

export const COMMUNITY_FEE_RECIPIENT = "0x3d8a7fa490f9db09dd8006b74688213ace9c0164";

export const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) public returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
]);

export const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] memory amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] memory amounts)'
]);

export const FLOWBRIDGE_ROUTER_ABI = parseAbi([
  'function swapExactTokensForTokensSupportingFee(uint256 amountIn, uint256 feeAmount, address feeRecipient, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactETHForTokensSupportingFee(uint256 feeAmount, address feeRecipient, uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETHSupportingFee(uint256 amountIn, uint256 feeAmount, address feeRecipient, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactTokensForTokensV3SupportingFee(address tokenIn, address tokenOut, uint24 feePool, uint256 amountIn, uint256 feeAmount, address feeRecipient, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapExactETHForTokensV3SupportingFee(address tokenOut, uint24 feePool, uint256 feeAmount, address feeRecipient, uint256 amountOutMinimum, address to, uint256 deadline) payable returns (uint256 amountOut)',
  'function swapExactTokensForETHV3SupportingFee(address tokenIn, uint24 feePool, uint256 amountIn, uint256 feeAmount, address feeRecipient, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
  'function bridgeWithFee(address token, uint256 amountIn, uint256 feeAmount, address feeRecipient, address targetBridge) returns (bool)'
]);

// CaryPact CaSwapRouter contract is compatible with the standard Uniswap V2 Router ABI for swaps
export const CASWAP_ROUTER_ABI = UNISWAP_V2_ROUTER_ABI;

export const UNISWAP_V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function fee() view returns (uint24)'
]);

export const UNISWAP_V3_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)'
]);

export const UNIVERSAL_ROUTER_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) external payable',
  'function execute(bytes commands, bytes[] inputs) external payable'
]);

// FlowBridgeRouter v3 — registry-router + configurable fee dispatcher on BOT Chain.
// Registered router IDs (mainnet & testnet): 0 = CaSwap V2, 1 = BDex V2, 2 = BDex V3.
export const FLOW_BRIDGE_ROUTER_V3_ABI = parseAbi([
  // Fee views
  'function computeRouterFee(uint256 routerId, uint256 swapAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function computeBridgeFee(uint256 bridgeId, uint256 bridgeAmount, address user) view returns (uint256 fee, uint256 effectiveBps)',
  'function getFeeConfig() view returns (uint256 globalFeeBps, uint256 maxFeeBps, address feeTreasury)',
  // Swap entry points
  'function swapV2(uint256 routerId, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapV3Single(uint256 routerId, address tokenIn, address tokenOut, uint24 feePool, uint256 swapAmount, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapNativeToToken(uint256 routerId, address tokenOut, uint24 feePool, uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256 amountOut)',
  'function swapTokenToNative(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256 amountOut)',
  // Bridge (used in Phase 2)
  'function bridgeWithFee(uint256 bridgeId, address token, uint256 bridgeAmount) returns (bool)'
]);


export interface ChainContracts {
  caToken: string;
  caStake: string;
  caPool: string;
  caSwapFactory: string;
  caSwapRouter: string;
  routerWhitelist: string;
  bdexFactory: string;
  bdexRouter: string;
  wbot: string;
  caWbot: string;
  usdtBot: string;
  usdtBnb: string;
  botBridgeProxy: string;
  bnbBridgeProxy: string;
  flowBridgeRouter: string;
  flowBridgeRouterV3: string;
  usdtBotPoolV3: string;

}

export const MAINNET_CONTRACTS: ChainContracts = {
  caToken: "0x546307af427902a75771434df831d88219784e19",
  caStake: "0xb24952ced79e39a947ef17a27492040bd9212a53",
  caPool: "0x59f6fdfbce098f16072daff7284ff68a237cb8b2",
  caSwapFactory: "0xebb8e27312af5ef867dd481eddb74fafe75f21a2",
  caSwapRouter: "0x5508ec3006e6d82ec3a3219f9c041ffcd5791cd3",
  routerWhitelist: "0x90aca2aa71ddf917679f7f9d9713131815eb59d6",
  bdexFactory: "0x117115f3b72c8d1989178089a67d0c26f8ee0aa3",
  bdexRouter: "0xaE6ae8630f7A888dEc0B9195C85F7515d5887655",
  wbot: "0xd5452816194a3784dba983426cce7c122f4abd30",
  caWbot: "0x68caea9104419203cf8b8f0b222e75709b97bfc6",
  usdtBot: "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c",
  usdtBnb: "0x55d398326f99059ff775485246999027b3197955", // default BSC mainnet template address
  botBridgeProxy: "0xef8dc669eca13e612b67ff09478352e85bd6cc53",
  bnbBridgeProxy: "0x3cd6fb6b0cddd3610f0f4769aa7bb686cd4a4b55",
  flowBridgeRouter: "0x19784e19546307af427902a75771434df831d882",
  usdtBotPoolV3: "0x64f418471a1a7932a190e10da5a8551db5abec05"
};

export const TESTNET_CONTRACTS: ChainContracts = {
  caToken: "0x4cf0ce056b1c39032c41ee97e09bc8e72c7d69f4", // CaryPact testnet CA address from documents
  caStake: "0xa2d83d074ff9752b9f1553ab8fb6fb9520efff92",
  caPool: "0x04f8f4822d5232926a435e37fdfc96eabfe8bd3d",
  caSwapFactory: "0x3e59aeeeb66cf1960d4d64451f5e79b9da2476da",
  caSwapRouter: "0xa5fa045ff3672e64a88c1ef03a9a59c0c8bc1747",
  routerWhitelist: "0x397b670a24bc11e2dc7432f921d6a22fa29fe293",
  bdexFactory: "0x65b8e98cea190d8c28b3e4716402027f634d15a3",
  bdexRouter: "0xd6425a02f0845b8d99e349c34d2e7a576e177345",
  wbot: "0xd5452816194a3784dba983426cce7c122f4abd30",
  caWbot: "0xf704ad4be6d75c62550571f3ead025efe7ca30d1",
  usdtBot: "0x75edc9335175fc0552d51d48439f229c10420fe3", // Tether USD on BOT testnet
  usdtBnb: "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",  // standard USDT on BSC testnet
  botBridgeProxy: "0xef8dc669eca13e612b67ff09478352e85bd6cc53", // fallbacks since actual is verify
  bnbBridgeProxy: "0x3cd6fb6b0cddd3610f0f4769aa7bb686cd4a4b55",
  flowBridgeRouter: "0x72c7d69f44cf0ce056b1c39032c41ee97e09bc8e",
  usdtBotPoolV3: "0x64f418471a1a7932a190e10da5a8551db5abec05"
};

export const getContracts = (isMainnet: boolean): ChainContracts => {
  return isMainnet ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
};
