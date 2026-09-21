import { parseAbi } from "viem";

/** FlowBridgeMultiSend V1 — frozen V1 ABI surface used by the app. */
export const MULTISEND_ABI = parseAbi([
  // Configuration reads
  "function feeBps() view returns (uint16)",
  "function maxRecipients() view returns (uint16)",
  "function configNonce() view returns (uint64)",
  "function feeRecipient() view returns (address)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function MAX_FEE_BPS() view returns (uint16)",
  "function HARD_MAX_RECIPIENTS() view returns (uint16)",
  "function quoteFee(uint256 recipientsTotal) view returns (uint256)",
  "function quoteRequiredSpend(uint256 recipientsTotal) view returns (uint256)",
  // Execution — one source wallet per call
  "function sendNative(bytes32 clientBatchId, address[] recipients, uint256[] amounts, uint16 expectedFeeBps, uint64 expectedConfigNonce, uint256 deadline) payable returns (uint256 recipientsTotal, uint256 serviceFee)",
  "function sendNativeEqual(bytes32 clientBatchId, address[] recipients, uint256 amountPerRecipient, uint16 expectedFeeBps, uint64 expectedConfigNonce, uint256 deadline) payable returns (uint256 recipientsTotal, uint256 serviceFee)",
  "function sendToken(bytes32 clientBatchId, address token, address[] recipients, uint256[] amounts, uint16 expectedFeeBps, uint64 expectedConfigNonce, uint256 deadline) returns (uint256 recipientsTotal, uint256 serviceFee)",
  "function sendTokenEqual(bytes32 clientBatchId, address token, address[] recipients, uint256 amountPerRecipient, uint16 expectedFeeBps, uint64 expectedConfigNonce, uint256 deadline) returns (uint256 recipientsTotal, uint256 serviceFee)",
  // Owner controls
  "function setFeeBps(uint16 newFeeBps)",
  "function setFeeRecipient(address newRecipient)",
  "function setMaxRecipients(uint16 newMaximum)",
  "function pause()",
  "function unpause()",
  // Events
  "event BatchExecuted(bytes32 indexed clientBatchId, address indexed sender, address indexed token, uint256 recipientCount, uint256 recipientsTotal, uint256 serviceFee, uint16 feeBps, uint64 configNonce)",
]);
