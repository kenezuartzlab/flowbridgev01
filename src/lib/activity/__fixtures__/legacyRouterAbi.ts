/**
 * TEST-ONLY fixture: historical legacy (non fee-bound) Router selectors that are
 * NOT present on the extended Router V4. Used solely to prove the verifier
 * rejects such calldata. Never import from production code.
 */
import { parseAbi } from 'viem';

export const HISTORICAL_LEGACY_ROUTER_ABI = parseAbi([
  'function swapV2(uint256 routerId, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapTokenToNative(uint256 routerId, address tokenIn, uint24 feePool, uint256 swapAmount, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256 amountOut)',
]);
