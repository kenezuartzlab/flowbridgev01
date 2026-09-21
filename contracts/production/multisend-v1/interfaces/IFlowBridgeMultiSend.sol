// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IFlowBridgeMultiSend {
    event BatchExecuted(
        bytes32 indexed clientBatchId,
        address indexed sender,
        address indexed token,
        uint256 recipientCount,
        uint256 recipientsTotal,
        uint256 serviceFee,
        uint16 feeBps,
        uint64 configNonce
    );

    function feeBps() external view returns (uint16);
    function feeRecipient() external view returns (address);
    function maxRecipients() external view returns (uint16);
    function configNonce() external view returns (uint64);
    function quoteFee(uint256 recipientsTotal) external view returns (uint256);
    function quoteRequiredSpend(uint256 recipientsTotal) external view returns (uint256);

    function sendNative(
        bytes32 clientBatchId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external payable returns (uint256 recipientsTotal, uint256 serviceFee);

    function sendNativeEqual(
        bytes32 clientBatchId,
        address[] calldata recipients,
        uint256 amountPerRecipient,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external payable returns (uint256 recipientsTotal, uint256 serviceFee);

    function sendToken(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external returns (uint256 recipientsTotal, uint256 serviceFee);

    function sendTokenEqual(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256 amountPerRecipient,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external returns (uint256 recipientsTotal, uint256 serviceFee);
}
