/**
 * Minimal FlowBridge BridgeAdapter ABI — Phase 2 scaffolding.
 *
 * Contains ONLY the frontend surface we intend to use. Not wired into any
 * live execution path yet (see `isBridgeAdapterTestnetEnabled`).
 */
import { parseAbi } from 'viem';

export const BRIDGE_ADAPTER_ABI = parseAbi([
  'function previewSource(uint256 amount) view returns (uint256 sourceAmount, uint256 fee, uint256 destinationAmount)',
  'function bridge(address destinationRecipient, address refundRecipient, uint256 amount, uint256 minRefundableAmount, uint256 deadline) returns (uint256 gatewayNonce)',
  'function requestState(uint256 gatewayNonce) view returns (uint8 state)',
  'function canClaimRefund(uint256 gatewayNonce) view returns (bool)',
  'function claimRefund(uint256 gatewayNonce)',
  'event BridgeRequested(uint256 indexed gatewayNonce, address indexed sender, address destinationRecipient, uint256 amount, uint256 deadline)',
]);
