// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOtherToken is ERC20 {
    constructor() ERC20("Other Token", "OTHER") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockBridgeCore {
    struct TokenInfo {
        uint8 assetsType;
        address tokenAddress;
        bool pause;
        uint256 decimalScale;
        bool burnable;
        bool mintable;
    }

    mapping(bytes32 => TokenInfo) public tokenInfo;
    mapping(uint256 => mapping(bytes32 => uint256)) public chainAndTokenFee;

    uint256 public minFee;

    constructor(
        bytes32 resourceId,
        address token,
        uint256 decimalScale,
        uint256 minFee_
    ) {
        tokenInfo[resourceId] = TokenInfo({
            assetsType: 2,
            tokenAddress: token,
            pause: false,
            decimalScale: decimalScale,
            burnable: false,
            mintable: false
        });

        minFee = minFee_;
    }

    function setFee(
        uint256 destinationChainId,
        bytes32 resourceId,
        uint256 feeBps
    ) external {
        chainAndTokenFee[destinationChainId][resourceId] = feeBps;
    }

    function setTokenPause(bytes32 resourceId, bool value) external {
        tokenInfo[resourceId].pause = value;
    }

    function getTokenInfoByResourceId(bytes32 resourceId)
        external
        view
        returns (uint8, address, bool, uint256, bool, bool)
    {
        TokenInfo memory t = tokenInfo[resourceId];
        return (
            t.assetsType,
            t.tokenAddress,
            t.pause,
            t.decimalScale,
            t.burnable,
            t.mintable
        );
    }
}

contract MockBotBridgeGatewayRefund {
    using SafeERC20 for IERC20;

    struct DepositRecord {
        address tokenAddress;
        address sender;
        address recipient;
        uint256 amount;
        uint256 fee;
        uint256 destinationChainId;
    }

    struct RefundData {
        address sender;
        uint256 depositReceiveAmount;
        bool depositIsLock;
        bool refunded;
        uint8 assetsType;
        address tokenAddress;
        uint256 fee;
        uint256 originAmount;
    }

    IERC20 public immutable token;
    bytes32 public immutable resourceId;
    address public immutable feeSink;
    MockBridgeCore public immutable core;

    uint256 public localNonce;
    uint256 public minAmountUsd = 10;
    uint256 public maxAmountUsd = 1_000_000;
    bool public bridgePause;

    mapping(uint256 => DepositRecord) public depositRecords;
    mapping(uint256 => RefundData) public refundDatas;
    mapping(uint256 => bool) public executionConfirmed;

    constructor(
        address token_,
        bytes32 resourceId_,
        address feeSink_,
        uint256 feeBps,
        uint256 minFeeUnits
    ) {
        token = IERC20(token_);
        resourceId = resourceId_;
        feeSink = feeSink_;

        core = new MockBridgeCore(
            resourceId_,
            token_,
            1e6,
            minFeeUnits
        );

        core.setFee(968, resourceId_, feeBps);
    }

    function Bridge() external view returns (address) {
        return address(core);
    }

    function getMinAmountUsd() external view returns (uint256) {
        return minAmountUsd;
    }

    function getMaxAmountUsd() external view returns (uint256) {
        return maxAmountUsd;
    }

    function getMinFee() external view returns (uint256) {
        return core.minFee();
    }

    function getBridgePause() external view returns (bool) {
        return bridgePause;
    }

    function setBridgePause(bool value) external {
        bridgePause = value;
    }

    function deposit(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) external payable {
        _deposit(destinationChainId, resourceId_, recipient, amount);
    }

    function depositWithBotGas(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) external payable {
        _deposit(destinationChainId, resourceId_, recipient, amount);
    }

    function _deposit(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) internal {
        require(!bridgePause, "bridge paused");
        require(resourceId_ == resourceId, "resource mismatch");
        require(amount >= minAmountUsd * 1e6, "below min");

        uint256 feeBps = core.chainAndTokenFee(
            destinationChainId,
            resourceId_
        );

        uint256 feeAmount = (amount * feeBps) / 10_000;

        if (feeAmount > 0) {
            uint256 minimum = core.minFee() * 1e6;
            if (feeAmount < minimum) feeAmount = minimum;
        }

        require(amount > feeAmount, "amount too small");

        uint256 receiveAmount = amount - feeAmount;

        token.safeTransferFrom(msg.sender, address(this), receiveAmount);
        if (feeAmount > 0) {
            token.safeTransferFrom(msg.sender, feeSink, feeAmount);
        }

        uint256 nonce = ++localNonce;

        depositRecords[nonce] = DepositRecord({
            tokenAddress: address(token),
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            fee: feeAmount,
            destinationChainId: destinationChainId
        });

        refundDatas[nonce] = RefundData({
            sender: msg.sender,
            depositReceiveAmount: receiveAmount,
            depositIsLock: true,
            refunded: false,
            assetsType: 2,
            tokenAddress: address(token),
            fee: feeBps,
            originAmount: amount
        });
    }

    function simulateRefund(uint256 nonce) external {
        RefundData storage r = refundDatas[nonce];

        require(r.sender != address(0), "missing");
        require(!r.refunded, "already refunded");
        require(!executionConfirmed[nonce], "already executed");

        r.refunded = true;
        token.safeTransfer(r.sender, r.depositReceiveAmount);
    }

    function markExecutionConfirmed(uint256 nonce) external {
        require(refundDatas[nonce].sender != address(0), "missing");
        executionConfirmed[nonce] = true;
    }
}


contract MockFeeOnTransferUSDT is ERC20 {
    uint256 public immutable transferFeeBps;

    constructor(uint256 feeBps_) ERC20("Fee-On-Transfer USDT", "fotUSDT") {
        transferFeeBps = feeBps_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (
            from != address(0) &&
            to != address(0) &&
            transferFeeBps != 0
        ) {
            uint256 feeAmount = (value * transferFeeBps) / 10_000;
            uint256 netAmount = value - feeAmount;

            super._update(from, to, netAmount);
            if (feeAmount != 0) {
                super._update(from, address(0), feeAmount);
            }
            return;
        }

        super._update(from, to, value);
    }
}

contract MockReentrantUSDT is ERC20 {
    address public callbackTarget;
    bool public attackEnabled;
    bool private _callbackEntered;
    bool public reentrancyGuardObserved;

    constructor() ERC20("Reentrant USDT", "rUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureAttack(address target, bool enabled) external {
        callbackTarget = target;
        attackEnabled = enabled;
        reentrancyGuardObserved = false;
    }

    function transferFrom(address from, address to, uint256 value)
        public
        override
        returns (bool)
    {
        if (
            attackEnabled &&
            !_callbackEntered &&
            callbackTarget != address(0)
        ) {
            _callbackEntered = true;

            (bool ok, bytes memory result) = callbackTarget.call(
                abi.encodeWithSignature("claimRefund(uint256)", uint256(999999))
            );

            if (!ok && result.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(result, 32))
                }

                // OpenZeppelin ReentrancyGuardReentrantCall()
                if (
                    selector ==
                    bytes4(keccak256("ReentrancyGuardReentrantCall()"))
                ) {
                    reentrancyGuardObserved = true;
                }
            }

            _callbackEntered = false;
        }

        return super.transferFrom(from, to, value);
    }
}


/**
 * @dev Test-only gateway used to exercise the exact external-call pattern flagged
 *      by Slither's reentrancy-balance detector.
 */
contract MockAdversarialGateway {
    using SafeERC20 for IERC20;

    struct DepositRecord {
        address tokenAddress;
        address sender;
        address recipient;
        uint256 amount;
        uint256 fee;
        uint256 destinationChainId;
    }

    struct RefundData {
        address sender;
        uint256 depositReceiveAmount;
        bool depositIsLock;
        bool refunded;
        uint8 assetsType;
        address tokenAddress;
        uint256 fee;
        uint256 originAmount;
    }

    IERC20 public immutable token;
    bytes32 public immutable resourceId;
    address public immutable feeSink;
    MockBridgeCore public immutable core;

    uint256 public localNonce;
    uint256 public minAmountUsd = 10;
    uint256 public maxAmountUsd = 1_000_000;
    bool public bridgePause;

    mapping(uint256 => DepositRecord) public depositRecords;
    mapping(uint256 => RefundData) public refundDatas;
    mapping(uint256 => bool) public executionConfirmed;

    address public callbackTarget;
    address public callbackRecipient;
    bool public attackReenter;
    uint256 public injectResidueAmount;

    bool public claimReentrancyGuardObserved;
    bool public bridgeReentrancyGuardObserved;

    constructor(
        address token_,
        bytes32 resourceId_,
        address feeSink_,
        uint256 feeBps,
        uint256 minFeeUnits
    ) {
        token = IERC20(token_);
        resourceId = resourceId_;
        feeSink = feeSink_;

        core = new MockBridgeCore(
            resourceId_,
            token_,
            1e6,
            minFeeUnits
        );

        core.setFee(968, resourceId_, feeBps);
    }

    function Bridge() external view returns (address) {
        return address(core);
    }

    function getMinAmountUsd() external view returns (uint256) {
        return minAmountUsd;
    }

    function getMaxAmountUsd() external view returns (uint256) {
        return maxAmountUsd;
    }

    function getMinFee() external view returns (uint256) {
        return core.minFee();
    }

    function getBridgePause() external view returns (bool) {
        return bridgePause;
    }

    function configureAttack(
        address target,
        address recipient,
        bool reenter,
        uint256 residueAmount
    ) external {
        callbackTarget = target;
        callbackRecipient = recipient;
        attackReenter = reenter;
        injectResidueAmount = residueAmount;
        claimReentrancyGuardObserved = false;
        bridgeReentrancyGuardObserved = false;
    }

    function deposit(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) external payable {
        _deposit(destinationChainId, resourceId_, recipient, amount);
    }

    function depositWithBotGas(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) external payable {
        _deposit(destinationChainId, resourceId_, recipient, amount);
    }

    function _deposit(
        uint256 destinationChainId,
        bytes32 resourceId_,
        address recipient,
        uint256 amount
    ) internal {
        require(!bridgePause, "bridge paused");
        require(resourceId_ == resourceId, "resource mismatch");
        require(amount >= minAmountUsd * 1e6, "below min");

        if (attackReenter && callbackTarget != address(0)) {
            (bool claimOk, bytes memory claimResult) = callbackTarget.call(
                abi.encodeWithSignature(
                    "claimRefund(uint256)",
                    uint256(999999)
                )
            );

            if (!claimOk && claimResult.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(claimResult, 32))
                }

                if (
                    selector ==
                    bytes4(keccak256("ReentrancyGuardReentrantCall()"))
                ) {
                    claimReentrancyGuardObserved = true;
                }
            }

            (bool bridgeOk, bytes memory bridgeResult) = callbackTarget.call(
                abi.encodeWithSignature(
                    "bridge(address,address,uint256,uint256,uint256)",
                    callbackRecipient,
                    callbackRecipient,
                    uint256(1),
                    uint256(0),
                    block.timestamp + 1 hours
                )
            );

            if (!bridgeOk && bridgeResult.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(bridgeResult, 32))
                }

                if (
                    selector ==
                    bytes4(keccak256("ReentrancyGuardReentrantCall()"))
                ) {
                    bridgeReentrancyGuardObserved = true;
                }
            }
        }

        uint256 feeBps = core.chainAndTokenFee(
            destinationChainId,
            resourceId_
        );

        uint256 feeAmount = (amount * feeBps) / 10_000;

        if (feeAmount > 0) {
            uint256 minimum = core.minFee() * 1e6;
            if (feeAmount < minimum) feeAmount = minimum;
        }

        require(amount > feeAmount, "amount too small");

        uint256 receiveAmount = amount - feeAmount;

        token.safeTransferFrom(msg.sender, address(this), receiveAmount);
        if (feeAmount > 0) {
            token.safeTransferFrom(msg.sender, feeSink, feeAmount);
        }

        uint256 nonce = ++localNonce;

        depositRecords[nonce] = DepositRecord({
            tokenAddress: address(token),
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            fee: feeAmount,
            destinationChainId: destinationChainId
        });

        refundDatas[nonce] = RefundData({
            sender: msg.sender,
            depositReceiveAmount: receiveAmount,
            depositIsLock: true,
            refunded: false,
            assetsType: 2,
            tokenAddress: address(token),
            fee: feeBps,
            originAmount: amount
        });

        // Simulate an upstream gateway/token side effect that changes the
        // Adapter balance during the official external call. The Adapter's
        // residual-balance invariant must make the whole source tx revert.
        if (injectResidueAmount != 0) {
            token.safeTransfer(msg.sender, injectResidueAmount);
        }
    }
}
