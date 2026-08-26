// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IBotBridgeGatewayRefund {
    function deposit(
        uint256 destinationChainId,
        bytes32 resourceId,
        address recipient,
        uint256 amount
    ) external payable;

    function depositWithBotGas(
        uint256 destinationChainId,
        bytes32 resourceId,
        address recipient,
        uint256 amount
    ) external payable;

    function localNonce() external view returns (uint256);

    function depositRecords(uint256 nonce)
        external
        view
        returns (
            address tokenAddress,
            address sender,
            address recipient,
            uint256 amount,
            uint256 fee,
            uint256 destinationChainId
        );

    function refundDatas(uint256 nonce)
        external
        view
        returns (
            address sender,
            uint256 depositReceiveAmount,
            bool depositIsLock,
            bool refunded,
            uint8 assetsType,
            address tokenAddress,
            uint256 fee,
            uint256 originAmount
        );

    function executionConfirmed(uint256 nonce) external view returns (bool);

    function getMinAmountUsd() external view returns (uint256);
    function getMaxAmountUsd() external view returns (uint256);
    function getBridgePause() external view returns (bool);
    function getMinFee() external view returns (uint256);
    function Bridge() external view returns (address);
}

interface IBotBridgeCoreView {
    function chainAndTokenFee(uint256 destinationChainId, bytes32 resourceId)
        external
        view
        returns (uint256);

    function minFee() external view returns (uint256);

    function getTokenInfoByResourceId(bytes32 resourceId)
        external
        view
        returns (
            uint8 assetsType,
            address tokenAddress,
            bool pause,
            uint256 decimalScale,
            bool burnable,
            bool mintable
        );
}

/**
 * @title FlowBridgeBridgeAdapterV1
 * @notice Non-upgradeable, route-specific BOT Bridge adapter with deterministic
 *         user refund attribution.
 *
 * SECURITY MODEL
 * -------------------------------------------------------------------------
 * - The adapter is the official bridge `msg.sender`, therefore official refunds
 *   are sent back to this adapter.
 * - Every source deposit is bound to the official gateway `localNonce`.
 * - The payer selects a fixed source-chain refund recipient at submission.
 * - A refund can only be claimed after the official gateway itself reports
 *   refundDatas(nonce).refunded == true.
 * - Anyone may trigger a claim, but funds can only be delivered to the
 *   precommitted refund recipient.
 * - No administrator can rescue/sweep the configured route token.
 * - New deposits can be paused; refund claims remain live while paused.
 * - Gateway, token, resource ID and destination chain are immutable.
 * - No upgradeability and no arbitrary downstream calldata.
 *
 * MAINNET POLICY
 * -------------------------------------------------------------------------
 * `botGasModeAllowed` SHOULD be false for institutional production deployments
 * until the official bridge exposes a user-enforceable maximum BOT-gas cost.
 * The current official bridge snapshots BOT amount at source but computes the
 * USDT cost asynchronously at destination.
 */
contract FlowBridgeBridgeAdapterV1 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant VERSION = 1;
    uint8 private constant ASSETS_TYPE_ERC20 = 2;

    address public immutable gateway;
    address public immutable token;
    bytes32 public immutable resourceId;
    uint256 public immutable sourceChainId;
    uint256 public immutable destinationChainId;
    uint8 public immutable tokenDecimals;
    bool public immutable botGasModeAllowed;

    address public guardian;

    enum RequestState {
        None,
        Pending,
        Executed,
        RefundAvailable,
        RefundClaimed,
        Inconsistent
    }

    struct BridgeRequest {
        address payer;
        address destinationRecipient;
        address refundRecipient;
        uint256 amountIn;
        uint256 refundableAmount;
        uint256 officialFeeAmount;
        uint256 submittedAt;
        bool withBotGas;
        bool refundClaimed;
    }

    struct RouteInfoSnapshot {
        uint8 assetsType;
        address tokenAddress;
        bool paused;
        uint256 decimalScale;
        bool burnable;
        bool mintable;
    }

    struct RefundSnapshot {
        address sender;
        uint256 refundableAmount;
        bool depositIsLock;
        bool refunded;
        uint8 assetsType;
        address tokenAddress;
        uint256 feeBps;
        uint256 originAmount;
    }

    mapping(uint256 gatewayNonce => BridgeRequest request) private _requests;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroResourceId();
    error SameChainDestination();
    error InvalidGateway();
    error InvalidRouteToken();
    error InvalidTokenDecimals(uint8 decimals);
    error DeadlineExpired(uint256 deadline, uint256 nowTimestamp);
    error InvalidMinRefundable(uint256 minRefundableAmount, uint256 amount);
    error BotGasModeDisabled();
    error ExactInputMismatch(uint256 expected, uint256 actual);
    error GatewayNonceMismatch(uint256 beforeNonce, uint256 afterNonce);
    error GatewayRecordMismatch();
    error GatewayRefundRecordMismatch();
    error UnexpectedAlreadyRefunded();
    error RefundBelowUserMinimum(uint256 actual, uint256 minimum);
    error InvalidOfficialFeeAccounting(
        uint256 amount,
        uint256 refundableAmount,
        uint256 officialFeeAmount
    );
    error ResidualRouteToken(uint256 beforeBalance, uint256 afterBalance);
    error UnknownRequest(uint256 gatewayNonce);
    error RefundAlreadyClaimed(uint256 gatewayNonce);
    error RefundNotAvailable(uint256 gatewayNonce);
    error InsufficientRefundBalance(uint256 available, uint256 required);
    error ExactRefundDeliveryMismatch(uint256 expected, uint256 actual);
    error UnauthorizedPauseCaller(address caller);
    error ProtectedRouteToken();
    error OwnershipRenounceDisabled();
    error InvalidPreview();
    error RequestAlreadyExists(uint256 gatewayNonce);
    error InconsistentOfficialState(uint256 gatewayNonce);

    event BridgeRequested(
        uint256 indexed gatewayNonce,
        address indexed payer,
        address indexed destinationRecipient,
        address refundRecipient,
        uint256 amountIn,
        uint256 refundableAmount,
        uint256 officialFeeAmount,
        bool withBotGas
    );

    event RefundClaimed(
        uint256 indexed gatewayNonce,
        address indexed payer,
        address indexed refundRecipient,
        address triggeredBy,
        uint256 amount
    );

    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event DepositsPaused(address indexed caller);
    event DepositsUnpaused(address indexed caller);
    event NonRouteTokenSwept(address indexed token, address indexed to, uint256 amount);
    event NativeSwept(address indexed to, uint256 amount);

    constructor(
        address initialOwner,
        address initialGuardian,
        address gateway_,
        address token_,
        bytes32 resourceId_,
        uint256 destinationChainId_,
        bool botGasModeAllowed_
    ) Ownable(initialOwner) {
        if (
            initialOwner == address(0) ||
            initialGuardian == address(0) ||
            gateway_ == address(0) ||
            token_ == address(0)
        ) revert ZeroAddress();

        if (resourceId_ == bytes32(0)) revert ZeroResourceId();
        if (destinationChainId_ == block.chainid) revert SameChainDestination();
        if (gateway_.code.length == 0) revert InvalidGateway();
        if (token_.code.length == 0) revert InvalidRouteToken();

        uint8 decimals_ = IERC20Metadata(token_).decimals();
        if (decimals_ == 0 || decimals_ > 36) {
            revert InvalidTokenDecimals(decimals_);
        }

        gateway = gateway_;
        token = token_;
        resourceId = resourceId_;
        sourceChainId = block.chainid;
        destinationChainId = destinationChainId_;
        tokenDecimals = decimals_;
        botGasModeAllowed = botGasModeAllowed_;
        guardian = initialGuardian;

        IBotBridgeGatewayRefund g = IBotBridgeGatewayRefund(gateway_);
        address core = g.Bridge();
        if (core == address(0) || core.code.length == 0) revert InvalidGateway();

        RouteInfoSnapshot memory routeInfo = _readRouteInfo(core, resourceId_);

        if (
            routeInfo.assetsType != ASSETS_TYPE_ERC20 ||
            routeInfo.tokenAddress != token_ ||
            routeInfo.decimalScale == 0
        ) {
            revert InvalidRouteToken();
        }
    }

    /**
     * @notice Ordinary bridge deposit.
     * @param destinationRecipient Recipient on the destination chain.
     * @param refundRecipient Fixed source-chain recipient if the official bridge refunds.
     * @param amount Exact source token amount.
     * @param minRefundableAmount Minimum acceptable official receive/refund amount.
     *        This is enforced AFTER the official gateway call but within the same
     *        atomic source-chain transaction, so a fee/config change that violates
     *        the bound reverts the entire deposit.
     * @param deadline Source-chain execution deadline.
     */
    function bridge(
        address destinationRecipient,
        address refundRecipient,
        uint256 amount,
        uint256 minRefundableAmount,
        uint256 deadline
    ) external whenNotPaused returns (uint256 gatewayNonce) {
        gatewayNonce = _bridge(
            destinationRecipient,
            refundRecipient,
            amount,
            minRefundableAmount,
            deadline,
            false
        );
    }

    /**
     * @notice BOT-gas bridge mode.
     * @dev Institutional mainnet profile SHOULD deploy with botGasModeAllowed=false
     *      until destination BOT-gas cost can be user-bounded at protocol level.
     */
    function bridgeWithBotGas(
        address destinationRecipient,
        address refundRecipient,
        uint256 amount,
        uint256 minRefundableAmount,
        uint256 deadline
    ) external whenNotPaused returns (uint256 gatewayNonce) {
        if (!botGasModeAllowed) revert BotGasModeDisabled();

        gatewayNonce = _bridge(
            destinationRecipient,
            refundRecipient,
            amount,
            minRefundableAmount,
            deadline,
            true
        );
    }

    /**
     * @notice Claim a source-chain refund already finalized by the official bridge.
     * @dev Anyone may trigger this function. Funds always go to the immutable
     *      per-request refundRecipient chosen by the payer.
     *
     *      Claims are intentionally NOT paused by the deposit circuit breaker.
     */
    function claimRefund(uint256 gatewayNonce)
        external
        nonReentrant
        returns (uint256 amount)
    {
        BridgeRequest storage request = _requests[gatewayNonce];
        if (request.payer == address(0)) revert UnknownRequest(gatewayNonce);
        if (request.refundClaimed) revert RefundAlreadyClaimed(gatewayNonce);

        RefundSnapshot memory official = _readRefundSnapshot(gatewayNonce);

        if (!official.refunded) revert RefundNotAvailable(gatewayNonce);
        if (IBotBridgeGatewayRefund(gateway).executionConfirmed(gatewayNonce)) {
            revert InconsistentOfficialState(gatewayNonce);
        }

        if (
            official.sender != address(this) ||
            official.tokenAddress != token ||
            official.assetsType != ASSETS_TYPE_ERC20 ||
            official.originAmount != request.amountIn ||
            official.refundableAmount != request.refundableAmount
        ) {
            revert GatewayRefundRecordMismatch();
        }

        amount = request.refundableAmount;

        uint256 adapterBalance = IERC20(token).balanceOf(address(this));
        if (adapterBalance < amount) {
            revert InsufficientRefundBalance(adapterBalance, amount);
        }

        // Effects before interaction.
        request.refundClaimed = true;

        address receiver = request.refundRecipient;
        uint256 beforeReceiver = IERC20(token).balanceOf(receiver);

        IERC20(token).safeTransfer(receiver, amount);

        uint256 afterReceiver = IERC20(token).balanceOf(receiver);
        if (afterReceiver < beforeReceiver) {
            revert ExactRefundDeliveryMismatch(amount, 0);
        }

        uint256 delivered = afterReceiver - beforeReceiver;
        if (delivered != amount) {
            revert ExactRefundDeliveryMismatch(amount, delivered);
        }

        emit RefundClaimed(
            gatewayNonce,
            request.payer,
            receiver,
            msg.sender,
            amount
        );
    }

    /**
     * @notice Exact source-side official bridge fee preview using the gateway's
     *         CURRENT Bridge configuration. The final source transaction remains
     *         protected by minRefundableAmount in bridge()/bridgeWithBotGas().
     */
    function previewSource(uint256 amount)
        external
        view
        returns (
            uint256 officialFeeAmount,
            uint256 refundableAmount,
            uint256 feeBps,
            uint256 minFeeUnits,
            uint256 minAmountUsd,
            uint256 maxAmountUsd,
            bool bridgePaused,
            bool tokenPaused
        )
    {
        if (amount == 0) revert ZeroAmount();

        IBotBridgeGatewayRefund g = IBotBridgeGatewayRefund(gateway);
        address coreAddress = g.Bridge();

        if (coreAddress == address(0) || coreAddress.code.length == 0) {
            revert InvalidGateway();
        }

        IBotBridgeCoreView core = IBotBridgeCoreView(coreAddress);
        RouteInfoSnapshot memory routeInfo =
            _readRouteInfo(coreAddress, resourceId);

        if (
            routeInfo.assetsType != ASSETS_TYPE_ERC20 ||
            routeInfo.tokenAddress != token ||
            routeInfo.decimalScale == 0
        ) revert InvalidPreview();

        feeBps = core.chainAndTokenFee(destinationChainId, resourceId);
        minFeeUnits = core.minFee();
        minAmountUsd = g.getMinAmountUsd();
        maxAmountUsd = g.getMaxAmountUsd();
        bridgePaused = g.getBridgePause();
        tokenPaused = routeInfo.paused;

        officialFeeAmount = (amount * feeBps) / 10_000;

        if (officialFeeAmount > 0) {
            uint256 minimumFeeAmount = minFeeUnits * routeInfo.decimalScale;
            if (officialFeeAmount < minimumFeeAmount) {
                officialFeeAmount = minimumFeeAmount;
            }
        }

        if (amount <= officialFeeAmount) revert InvalidPreview();
        refundableAmount = amount - officialFeeAmount;
    }

    function getRequest(uint256 gatewayNonce)
        external
        view
        returns (BridgeRequest memory)
    {
        return _requests[gatewayNonce];
    }

    function requestState(uint256 gatewayNonce)
        external
        view
        returns (RequestState)
    {
        BridgeRequest storage request = _requests[gatewayNonce];
        if (request.payer == address(0)) return RequestState.None;

        RefundSnapshot memory official = _readRefundSnapshot(gatewayNonce);

        bool confirmed =
            IBotBridgeGatewayRefund(gateway).executionConfirmed(gatewayNonce);

        if (official.refunded && confirmed) {
            return RequestState.Inconsistent;
        }

        if (request.refundClaimed) return RequestState.RefundClaimed;

        if (
            official.refunded &&
            official.sender == address(this) &&
            official.refundableAmount == request.refundableAmount &&
            official.assetsType == ASSETS_TYPE_ERC20 &&
            official.tokenAddress == token &&
            official.originAmount == request.amountIn
        ) {
            return RequestState.RefundAvailable;
        }

        if (confirmed) {
            return RequestState.Executed;
        }

        return RequestState.Pending;
    }

    function canClaimRefund(uint256 gatewayNonce) external view returns (bool) {
        BridgeRequest storage request = _requests[gatewayNonce];
        if (request.payer == address(0) || request.refundClaimed) return false;

        RefundSnapshot memory official = _readRefundSnapshot(gatewayNonce);

        if (IBotBridgeGatewayRefund(gateway).executionConfirmed(gatewayNonce)) {
            return false;
        }

        return
            official.refunded &&
            official.sender == address(this) &&
            official.refundableAmount == request.refundableAmount &&
            official.assetsType == ASSETS_TYPE_ERC20 &&
            official.tokenAddress == token &&
            official.originAmount == request.amountIn &&
            IERC20(token).balanceOf(address(this)) >= request.refundableAmount;
    }

    /**
     * @notice Emergency circuit breaker for NEW deposits only.
     *         Guardian may pause immediately; only governance/owner may unpause.
     */
    function pauseDeposits() external {
        if (msg.sender != guardian && msg.sender != owner()) {
            revert UnauthorizedPauseCaller(msg.sender);
        }
        _pause();
        emit DepositsPaused(msg.sender);
    }

    function unpauseDeposits() external onlyOwner {
        _unpause();
        emit DepositsUnpaused(msg.sender);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();

        address old = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(old, newGuardian);
    }

    /**
     * @notice Recover accidentally sent NON-ROUTE ERC20 tokens.
     * @dev The configured route token can NEVER be swept by governance.
     */
    function sweepNonRouteToken(address token_, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (token_ == token) revert ProtectedRouteToken();
        if (token_ == address(0) || to == address(0)) revert ZeroAddress();

        IERC20(token_).safeTransfer(to, amount);
        emit NonRouteTokenSwept(token_, to, amount);
    }

    /**
     * @notice Recover forced native currency. This adapter has no native route
     *         and no native user liability.
     */
    function sweepNative(address payable to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();

        Address.sendValue(to, amount);

        emit NativeSwept(to, amount);
    }

    /**
     * @dev Ownership should ultimately be a timelock/multisig. Renouncing
     *      ownership could permanently disable unpause and guardian rotation.
     */
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRenounceDisabled();
    }

    function _readRouteInfo(
        address coreAddress,
        bytes32 resourceId_
    ) private view returns (RouteInfoSnapshot memory info) {
        (
            info.assetsType,
            info.tokenAddress,
            info.paused,
            info.decimalScale,
            info.burnable,
            info.mintable
        ) = IBotBridgeCoreView(coreAddress).getTokenInfoByResourceId(resourceId_);
    }

    function _readRefundSnapshot(uint256 gatewayNonce)
        private
        view
        returns (RefundSnapshot memory snapshot)
    {
        (
            snapshot.sender,
            snapshot.refundableAmount,
            snapshot.depositIsLock,
            snapshot.refunded,
            snapshot.assetsType,
            snapshot.tokenAddress,
            snapshot.feeBps,
            snapshot.originAmount
        ) = IBotBridgeGatewayRefund(gateway).refundDatas(gatewayNonce);
    }

    function _bridge(
        address destinationRecipient,
        address refundRecipient,
        uint256 amount,
        uint256 minRefundableAmount,
        uint256 deadline,
        bool withBotGas
    ) private nonReentrant returns (uint256 gatewayNonce) {
        if (
            destinationRecipient == address(0) ||
            refundRecipient == address(0) ||
            refundRecipient == address(this)
        ) revert ZeroAddress();

        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) {
            revert DeadlineExpired(deadline, block.timestamp);
        }
        if (minRefundableAmount > amount) {
            revert InvalidMinRefundable(minRefundableAmount, amount);
        }

        IERC20 routeToken = IERC20(token);

        uint256 adapterBalanceBefore = routeToken.balanceOf(address(this));

        routeToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 adapterBalanceAfterPull = routeToken.balanceOf(address(this));
        if (adapterBalanceAfterPull < adapterBalanceBefore) {
            revert ExactInputMismatch(amount, 0);
        }

        uint256 received = adapterBalanceAfterPull - adapterBalanceBefore;
        if (received != amount) {
            revert ExactInputMismatch(amount, received);
        }

        IBotBridgeGatewayRefund g = IBotBridgeGatewayRefund(gateway);
        uint256 nonceBefore = g.localNonce();

        routeToken.forceApprove(gateway, amount);

        if (withBotGas) {
            g.depositWithBotGas(
                destinationChainId,
                resourceId,
                destinationRecipient,
                amount
            );
        } else {
            g.deposit(
                destinationChainId,
                resourceId,
                destinationRecipient,
                amount
            );
        }

        routeToken.forceApprove(gateway, 0);

        uint256 nonceAfter = g.localNonce();
        if (nonceAfter != nonceBefore + 1) {
            revert GatewayNonceMismatch(nonceBefore, nonceAfter);
        }

        gatewayNonce = nonceAfter;

        (
            address recordToken,
            address recordSender,
            address recordRecipient,
            uint256 recordAmount,
            uint256 officialFeeAmount,
            uint256 recordDestinationChainId
        ) = g.depositRecords(gatewayNonce);

        if (
            recordToken != token ||
            recordSender != address(this) ||
            recordRecipient != destinationRecipient ||
            recordAmount != amount ||
            recordDestinationChainId != destinationChainId
        ) {
            revert GatewayRecordMismatch();
        }

        RefundSnapshot memory officialRefund =
            _readRefundSnapshot(gatewayNonce);

        if (officialRefund.refunded) revert UnexpectedAlreadyRefunded();

        if (
            officialRefund.sender != address(this) ||
            officialRefund.tokenAddress != token ||
            officialRefund.assetsType != ASSETS_TYPE_ERC20 ||
            officialRefund.originAmount != amount
        ) {
            revert GatewayRefundRecordMismatch();
        }

        uint256 refundableAmount = officialRefund.refundableAmount;

        if (refundableAmount < minRefundableAmount) {
            revert RefundBelowUserMinimum(
                refundableAmount,
                minRefundableAmount
            );
        }

        if (
            refundableAmount > amount ||
            officialFeeAmount > amount ||
            officialFeeAmount != amount - refundableAmount
        ) {
            revert InvalidOfficialFeeAccounting(
                amount,
                refundableAmount,
                officialFeeAmount
            );
        }

        uint256 adapterBalanceAfter = routeToken.balanceOf(address(this));
        if (adapterBalanceAfter != adapterBalanceBefore) {
            revert ResidualRouteToken(
                adapterBalanceBefore,
                adapterBalanceAfter
            );
        }

        if (_requests[gatewayNonce].payer != address(0)) {
            revert RequestAlreadyExists(gatewayNonce);
        }

        _requests[gatewayNonce] = BridgeRequest({
            payer: msg.sender,
            destinationRecipient: destinationRecipient,
            refundRecipient: refundRecipient,
            amountIn: amount,
            refundableAmount: refundableAmount,
            officialFeeAmount: officialFeeAmount,
            submittedAt: block.timestamp,
            withBotGas: withBotGas,
            refundClaimed: false
        });

        emit BridgeRequested(
            gatewayNonce,
            msg.sender,
            destinationRecipient,
            refundRecipient,
            amount,
            refundableAmount,
            officialFeeAmount,
            withBotGas
        );
    }
}
