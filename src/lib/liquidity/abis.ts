import { parseAbi } from "viem";

export const V2_ROUTER_ABI = parseAbi([
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function WBOT() view returns (address)",
  "function addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256,uint256,uint256)",
  "function addLiquidityETH(address token,uint256 amountTokenDesired,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline) payable returns (uint256,uint256,uint256)",
  "function removeLiquidity(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256,uint256)",
  "function removeLiquidityETH(address token,uint256 liquidity,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline) returns (uint256,uint256)",
]);

export const V2_FACTORY_ABI = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
]);

export const V2_PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export const ERC20_LITE_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

export const V3_FACTORY_ABI = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
  "function feeAmountTickSpacing(uint24) view returns (int24)",
]);

export const V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function tickSpacing() view returns (int24)",
]);

export const NPM_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function positions(uint256) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "struct IncreaseLiquidityParams { uint256 tokenId; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }",
  "function increaseLiquidity(IncreaseLiquidityParams params) payable returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "struct DecreaseLiquidityParams { uint256 tokenId; uint128 liquidity; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }",
  "function decreaseLiquidity(DecreaseLiquidityParams params) payable returns (uint256 amount0,uint256 amount1)",
  "struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }",
  "function collect(CollectParams params) payable returns (uint256 amount0,uint256 amount1)",
  "function burn(uint256 tokenId) payable",
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
]);

export const MAX_UINT128 = (1n << 128n) - 1n;
