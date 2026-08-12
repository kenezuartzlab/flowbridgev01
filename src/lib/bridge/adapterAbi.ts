/**
 * Minimal FlowBridge BridgeAdapter ABI — Phase 2/3 scaffolding.
 *
 * Phase 3 uses ONLY `previewSource` (read-only). `bridge`, `claimRefund` and
 * friends stay declared for later phases but are never called from the app.
 */
import { parseAbi } from 'viem';

export const BRIDGE_ADAPTER_ABI = parseAbi([
  'function previewSource(uint256 amount) view returns (uint256 officialFeeAmount, uint256 refundableAmount, uint256 feeBps, uint256 minFeeUnits, uint256 minAmountUsd, uint256 maxAmountUsd, bool bridgePaused, bool tokenPaused)',
  'function bridge(address destinationRecipient, address refundRecipient, uint256 amount, uint256 minRefundableAmount, uint256 deadline) returns (uint256 gatewayNonce)',
  'function requestState(uint256 gatewayNonce) view returns (uint8 state)',
  'function canClaimRefund(uint256 gatewayNonce) view returns (bool)',
  'function claimRefund(uint256 gatewayNonce)',
  'event BridgeRequested(uint256 indexed gatewayNonce, address indexed sender, address destinationRecipient, uint256 amount, uint256 deadline)',
]);
