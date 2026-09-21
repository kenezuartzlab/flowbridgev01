// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title FlowBridgeMultiSend
/// @notice Non-custodial multi-recipient executor for one source wallet per on-chain call.
/// @dev
///  - One -> Many: one wallet calls once with many recipients.
///  - Many -> One: the app groups one destination per source; each independent source authorizes its own call.
///  - Many -> Many: the app groups rows by source; each independent source authorizes one call for its rows.
///  - Smart accounts may batch those calls at the wallet/account-abstraction layer.
///  - This contract never swaps, bridges, stakes, mints, or performs arbitrary user-selected calls.
contract FlowBridgeMultiSend is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant DEFAULT_FEE_BPS = 1; // 0.01%
    uint16 public constant MAX_FEE_BPS = 100; // hard cap: 1.00%
    uint16 public constant HARD_MAX_RECIPIENTS = 500;

    uint16 public feeBps = DEFAULT_FEE_BPS;
    uint16 public maxRecipients = 100;
    uint64 public configNonce;
    address public feeRecipient;

    error EmptyBatch();
    error TooManyRecipients(uint256 supplied, uint256 maximum);
    error LengthMismatch(uint256 recipientsLength, uint256 amountsLength);
    error InvalidRecipient(uint256 index, address recipient);
    error RecipientIsSender(uint256 index);
    error InvalidAmount(uint256 index);
    error InvalidToken(address token);
    error InvalidFeeBps(uint16 supplied);
    error InvalidMaxRecipients(uint16 supplied);
    error InvalidFeeRecipient(address recipient);
    error FeeRecipientIsSender(address sender);
    error FeeChanged(uint16 expected, uint16 current);
    error ConfigChanged(uint64 expected, uint64 current);
    error TransactionExpired(uint256 deadline, uint256 currentTimestamp);
    error IncorrectNativeValue(uint256 expected, uint256 received);
    error NativeTransferFailed(address recipient, uint256 amount);
    error InexactTokenTransfer(address token, address recipient, uint256 expected, uint256 received);
    error RenounceOwnershipDisabled();

    /// @notice token == address(0) denotes the native network asset.
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

    event FeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps, uint64 configNonce);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient, uint64 configNonce);
    event MaxRecipientsUpdated(uint16 previousMaxRecipients, uint16 newMaxRecipients, uint64 configNonce);
    event NativeRescued(address indexed recipient, uint256 amount);
    event TokenRescued(address indexed token, address indexed recipient, uint256 amount);

    constructor(address initialOwner, address initialFeeRecipient) Ownable(initialOwner) {
        if (initialFeeRecipient == address(0) || initialFeeRecipient == address(this)) {
            revert InvalidFeeRecipient(initialFeeRecipient);
        }
        feeRecipient = initialFeeRecipient;
    }

    // ---------------------------------------------------------------------
    // Native asset execution
    // ---------------------------------------------------------------------

    function sendNative(
        bytes32 clientBatchId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        recipientsTotal = _validateAndSum(recipients, amounts);
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);

        uint256 requiredValue = recipientsTotal + serviceFee;
        if (msg.value != requiredValue) revert IncorrectNativeValue(requiredValue, msg.value);

        uint256 length = recipients.length;
        for (uint256 i; i < length; ) {
            _sendNative(recipients[i], amounts[i]);
            unchecked {
                ++i;
            }
        }

        _sendNative(feeRecipient, serviceFee);
        _emitBatch(clientBatchId, address(0), length, recipientsTotal, serviceFee);
    }

    function sendNativeEqual(
        bytes32 clientBatchId,
        address[] calldata recipients,
        uint256 amountPerRecipient,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        _validateRecipientCount(recipients.length);
        if (amountPerRecipient == 0) revert InvalidAmount(0);

        uint256 length = recipients.length;
        for (uint256 i; i < length; ) {
            _validateBatchRecipient(i, recipients[i]);
            unchecked {
                ++i;
            }
        }

        recipientsTotal = amountPerRecipient * length;
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);

        uint256 requiredValue = recipientsTotal + serviceFee;
        if (msg.value != requiredValue) revert IncorrectNativeValue(requiredValue, msg.value);

        for (uint256 i; i < length; ) {
            _sendNative(recipients[i], amountPerRecipient);
            unchecked {
                ++i;
            }
        }

        _sendNative(feeRecipient, serviceFee);
        _emitBatch(clientBatchId, address(0), length, recipientsTotal, serviceFee);
    }

    // ---------------------------------------------------------------------
    // ERC-20 execution
    // ---------------------------------------------------------------------

    function sendToken(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        _validateToken(token);
        recipientsTotal = _validateAndSum(recipients, amounts);
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);

        _executeTokenBatch(IERC20(token), recipients, amounts, serviceFee);
        _emitBatch(clientBatchId, token, recipients.length, recipientsTotal, serviceFee);
    }

    function sendTokenEqual(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256 amountPerRecipient,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        _validateToken(token);
        _validateRecipientCount(recipients.length);
        if (amountPerRecipient == 0) revert InvalidAmount(0);

        uint256 length = recipients.length;
        for (uint256 i; i < length; ) {
            _validateBatchRecipient(i, recipients[i]);
            unchecked {
                ++i;
            }
        }

        recipientsTotal = amountPerRecipient * length;
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);

        IERC20 erc20 = IERC20(token);
        for (uint256 i; i < length; ) {
            _safeExactTransferFrom(erc20, msg.sender, recipients[i], amountPerRecipient);
            unchecked {
                ++i;
            }
        }
        _safeExactTransferFrom(erc20, msg.sender, feeRecipient, serviceFee);

        _emitBatch(clientBatchId, token, length, recipientsTotal, serviceFee);
    }

    /// @notice EIP-2612 convenience path: permit exact required spend and execute in one call.
    /// @dev Reverts for tokens that do not implement IERC20Permit. Standard approve + sendToken remains the fallback.
    function sendTokenWithPermit(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        _validateToken(token);
        recipientsTotal = _validateAndSum(recipients, amounts);
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);

        uint256 requiredSpend = recipientsTotal + serviceFee;
        IERC20Permit(token).permit(msg.sender, address(this), requiredSpend, permitDeadline, v, r, s);

        _executeTokenBatch(IERC20(token), recipients, amounts, serviceFee);
        _emitBatch(clientBatchId, token, recipients.length, recipientsTotal, serviceFee);
    }

    function sendTokenEqualWithPermit(
        bytes32 clientBatchId,
        address token,
        address[] calldata recipients,
        uint256 amountPerRecipient,
        uint16 expectedFeeBps,
        uint64 expectedConfigNonce,
        uint256 deadline,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused returns (uint256 recipientsTotal, uint256 serviceFee) {
        _checkSnapshot(expectedFeeBps, expectedConfigNonce, deadline);
        _validateToken(token);
        _validateRecipientCount(recipients.length);
        if (amountPerRecipient == 0) revert InvalidAmount(0);

        uint256 length = recipients.length;
        for (uint256 i; i < length; ) {
            _validateBatchRecipient(i, recipients[i]);
            unchecked {
                ++i;
            }
        }

        recipientsTotal = amountPerRecipient * length;
        serviceFee = quoteFee(recipientsTotal);
        _checkFeeRecipientForSender(serviceFee);
        uint256 requiredSpend = recipientsTotal + serviceFee;

        IERC20Permit(token).permit(msg.sender, address(this), requiredSpend, permitDeadline, v, r, s);

        IERC20 erc20 = IERC20(token);
        for (uint256 i; i < length; ) {
            _safeExactTransferFrom(erc20, msg.sender, recipients[i], amountPerRecipient);
            unchecked {
                ++i;
            }
        }
        _safeExactTransferFrom(erc20, msg.sender, feeRecipient, serviceFee);

        _emitBatch(clientBatchId, token, length, recipientsTotal, serviceFee);
    }

    // ---------------------------------------------------------------------
    // Quotes and configuration
    // ---------------------------------------------------------------------

    function quoteFee(uint256 recipientsTotal) public view returns (uint256) {
        return Math.mulDiv(recipientsTotal, feeBps, BPS_DENOMINATOR);
    }

    function quoteRequiredSpend(uint256 recipientsTotal) external view returns (uint256) {
        return recipientsTotal + quoteFee(recipientsTotal);
    }

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFeeBps(newFeeBps);
        uint16 previous = feeBps;
        feeBps = newFeeBps;
        uint64 nonce = _bumpConfigNonce();
        emit FeeBpsUpdated(previous, newFeeBps, nonce);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0) || newRecipient == address(this)) {
            revert InvalidFeeRecipient(newRecipient);
        }
        address previous = feeRecipient;
        feeRecipient = newRecipient;
        uint64 nonce = _bumpConfigNonce();
        emit FeeRecipientUpdated(previous, newRecipient, nonce);
    }

    function setMaxRecipients(uint16 newMaximum) external onlyOwner {
        if (newMaximum == 0 || newMaximum > HARD_MAX_RECIPIENTS) {
            revert InvalidMaxRecipients(newMaximum);
        }
        uint16 previous = maxRecipients;
        maxRecipients = newMaximum;
        uint64 nonce = _bumpConfigNonce();
        emit MaxRecipientsUpdated(previous, newMaximum, nonce);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Disabled: fee administration and emergency pause require an accountable owner.
    function renounceOwnership() public override onlyOwner {
        revert RenounceOwnershipDisabled();
    }

    // ---------------------------------------------------------------------
    // Recovery for assets accidentally/forcibly sent to the contract.
    // Normal ERC-20 batches transfer sender -> recipient directly and are not custodied.
    // ---------------------------------------------------------------------

    function rescueNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        _validateRecoveryRecipient(recipient);
        _sendNative(recipient, amount);
        emit NativeRescued(recipient, amount);
    }

    function rescueToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        _validateToken(token);
        _validateRecoveryRecipient(recipient);
        IERC20(token).safeTransfer(recipient, amount);
        emit TokenRescued(token, recipient, amount);
    }

    // ---------------------------------------------------------------------
    // Internal execution and validation
    // ---------------------------------------------------------------------

    function _executeTokenBatch(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 serviceFee
    ) internal {
        uint256 length = recipients.length;
        for (uint256 i; i < length; ) {
            _safeExactTransferFrom(token, msg.sender, recipients[i], amounts[i]);
            unchecked {
                ++i;
            }
        }
        _safeExactTransferFrom(token, msg.sender, feeRecipient, serviceFee);
    }

    /// @dev Rejects fee-on-transfer / deflationary behavior by requiring exact recipient balance delta.
    function _safeExactTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        uint256 beforeBalance = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        uint256 afterBalance = token.balanceOf(to);
        if (afterBalance < beforeBalance) {
            revert InexactTokenTransfer(address(token), to, amount, 0);
        }
        uint256 received = afterBalance - beforeBalance;
        if (received != amount) {
            revert InexactTokenTransfer(address(token), to, amount, received);
        }
    }

    function _checkSnapshot(uint16 expectedFeeBps, uint64 expectedConfigNonce, uint256 deadline) internal view {
        if (block.timestamp > deadline) revert TransactionExpired(deadline, block.timestamp);
        if (expectedFeeBps != feeBps) revert FeeChanged(expectedFeeBps, feeBps);
        if (expectedConfigNonce != configNonce) revert ConfigChanged(expectedConfigNonce, configNonce);
    }

    function _checkFeeRecipientForSender(uint256 serviceFee) internal view {
        if (serviceFee != 0 && feeRecipient == msg.sender) revert FeeRecipientIsSender(msg.sender);
    }

    function _validateRecipientCount(uint256 length) internal view {
        if (length == 0) revert EmptyBatch();
        if (length > maxRecipients) revert TooManyRecipients(length, maxRecipients);
    }

    function _validateBatchRecipient(uint256 index, address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidRecipient(index, recipient);
        }
        if (recipient == msg.sender) revert RecipientIsSender(index);
    }

    function _validateAndSum(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) internal view returns (uint256 totalAmount) {
        uint256 length = recipients.length;
        _validateRecipientCount(length);
        if (length != amounts.length) revert LengthMismatch(length, amounts.length);

        for (uint256 i; i < length; ) {
            _validateBatchRecipient(i, recipients[i]);
            uint256 amount = amounts[i];
            if (amount == 0) revert InvalidAmount(i);
            totalAmount += amount;
            unchecked {
                ++i;
            }
        }
    }

    function _validateToken(address token) internal view {
        if (token == address(0) || token == address(this) || token.code.length == 0) {
            revert InvalidToken(token);
        }
    }

    function _validateRecoveryRecipient(address recipient) internal view {
        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidRecipient(type(uint256).max, recipient);
        }
    }

    function _sendNative(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert NativeTransferFailed(recipient, amount);
    }

    function _emitBatch(
        bytes32 clientBatchId,
        address token,
        uint256 recipientCount,
        uint256 recipientsTotal,
        uint256 serviceFee
    ) internal {
        emit BatchExecuted(
            clientBatchId,
            msg.sender,
            token,
            recipientCount,
            recipientsTotal,
            serviceFee,
            feeBps,
            configNonce
        );
    }

    function _bumpConfigNonce() internal returns (uint64) {
        unchecked {
            configNonce += 1;
        }
        return configNonce;
    }
}
