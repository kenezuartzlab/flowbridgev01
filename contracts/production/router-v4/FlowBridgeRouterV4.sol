// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlowBridgeRouterV4
 * @notice Registry router for FlowBridge swaps and BOT Bridge EVM routes.
 *
 * Design goals:
 * - Preserve FlowBridgeRouter v3 swap/view entry points where practical.
 * - Default protocol fees to zero; fees remain owner-configurable within a hard ceiling.
 * - Add fee-bound "Safe" entry points so a user can reject fee changes between quote/signing/mining.
 * - Route BOT Bridge deposits through the official gateway contract instead of raw token transfers.
 * - Keep user approvals scoped to FlowBridgeRouter; this contract approves downstream routers/gateways exactly.
 * - Validate swap paths and bridge route configuration on-chain.
 * - Support delayed activation of newly registered routers/bridges for safer governance operations.
 * - Emit compatibility events plus indexed activity events for analytics/rewards indexing.
 *
 * IMPORTANT:
 * - Deploy one instance on every supported EVM source chain (BOT, BNB, Ethereum, etc.).
 * - This Solidity contract does not route Tron transactions; Tron is non-EVM.
 * - Ownership should be transferred to a multisig/timelock before meaningful TVL or non-zero fees.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IWrappedNative {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);

    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/**
 * @dev Interface mirrored from the BOT Bridge integration currently used by FlowBridge.
 * The official BOT docs expose deposit(...) and depositWithBotGas(...) as bridge entry modes.
 */
interface IBotBridgeGateway {
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
}

error ActivationDelay();
error BelowGlobalFee();
error BridgeInactive();
error BridgeNotFound();
error ContractPaused();
error DeactivateFirst();
error DeadlinePassed();
error DelayTooLong();
error DestinationRequired();
error DuplicatePathToken();
error DuplicateToken();
error ExceedsAbsoluteMax10();
error ExceedsMaxfeebps();
error HopTokenMismatch();
error Hops210();
error IdenticalEndpoints();
error IdenticalTokens();
error IncorrectMsgValue();
error InvalidAddress();
error InvalidBridge();
error InvalidPathToken();
error InvalidRecipient();
error InvalidRouter();
error InvalidToken();
error InvalidTokenin();
error InvalidTokenout();
error InvalidTreasury();
error InvalidWrappednative();
error LengthMismatch();
error MalformedV3Path();
error MultiHopV2Only();
error NameRequired();
error NativeDeliveryFailed();
error NativeFeeFailed();
error NotV2();
error NotV3();
error OwnerNotOwner();
error OwnerNotPending();
error OwnerZero();
error PathInputMismatch();
error PathMustEndWrappedNative();
error PathMustStartWrappedNative();
error PathOutputMismatch();
error PathTooShort();
error ProtocolFeeChanged();
error Reentrant();
error RescueFailed();
error ResourceRequired();
error RouterInactive();
error RouterNotFound();
error TokenNotSupported();
error TokensRequired();
error UnsupportedTransferToken();
error V3InputMismatch();
error V3OutputMismatch();
error V3PathTooShort();
error ZeroAddress();
error ZeroAmount();

library SafeToken {
    error TokenNotContract(address token);
    error TokenCallFailed(address token);
    error TokenOperationFailed(address token);

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        _call(address(token), abi.encodeCall(token.transfer, (to, amount)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        _call(address(token), abi.encodeCall(token.transferFrom, (from, to, amount)));
    }

    /** @dev USDT-compatible force approve: reset to zero first when needed. */
    function forceApprove(IERC20 token, address spender, uint256 amount) internal {
        if (address(token).code.length == 0) revert TokenNotContract(address(token));
        uint256 current = token.allowance(address(this), spender);
        if (current != 0 && amount != 0) {
            _call(address(token), abi.encodeCall(token.approve, (spender, 0)));
        }
        _call(address(token), abi.encodeCall(token.approve, (spender, amount)));
    }

    function _call(address token, bytes memory data) private {
        if (token.code.length == 0) revert TokenNotContract(token);
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok) revert TokenCallFailed(token);
        if (ret.length != 0 && !abi.decode(ret, (bool))) revert TokenOperationFailed(token);
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        if (!(_status != _ENTERED)) revert Reentrant();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

abstract contract Ownable2Step {
    address private _owner;
    address private _pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (!(initialOwner != address(0))) revert OwnerZero();
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (!(msg.sender == _owner)) revert OwnerNotOwner();
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function pendingOwner() public view returns (address) {
        return _pendingOwner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (!(newOwner != address(0))) revert OwnerZero();
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(_owner, newOwner);
    }

    function acceptOwnership() external {
        if (!(msg.sender == _pendingOwner)) revert OwnerNotPending();
        address oldOwner = _owner;
        _owner = _pendingOwner;
        _pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, _owner);
    }
}

abstract contract Pausable is Ownable2Step {
    bool private _paused;

    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor(address initialOwner) Ownable2Step(initialOwner) {}

    modifier whenNotPaused() {
        if (!(!_paused)) revert ContractPaused();
        _;
    }

    function paused() public view returns (bool) {
        return _paused;
    }

    function pause() external onlyOwner {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _paused = false;
        emit Unpaused(msg.sender);
    }
}

contract FlowBridgeRouterV4 is Pausable, ReentrancyGuard {
    using SafeToken for IERC20;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant OVERRIDE_ZERO = type(uint256).max;
    uint256 private constant ABS_MAX_FEE_BPS = 1000; // 10% compile-time absolute ceiling (v3-compatible).
    uint256 public constant MAX_REGISTRY_ACTIVATION_DELAY = 7 days;

    enum RouterType {
        V2,
        V3
    }

    struct RouterEntry {
        address router;
        RouterType rtype;
        address wrappedNative;
        bool active;
        string name;
        string version;
    }

    // Kept structurally compatible with v3.
    struct BridgeEntry {
        address bridge;
        bool active;
        string name;
        string destChainName;
        uint256 destChainId;
        address[] supportedTokens;
    }

    struct HopParams {
        uint256 routerId;
        address[] path;
        uint256 amountOutMin;
    }

    mapping(uint256 => RouterEntry) public routers;
    uint256 public routerCount;

    mapping(uint256 => BridgeEntry) public bridges;
    uint256 public bridgeCount;

    // O(1) validation + BOT Bridge route metadata.
    mapping(uint256 => mapping(address => bool)) public bridgeTokenSupported;
    mapping(uint256 => mapping(address => bytes32)) public bridgeResourceId;
    mapping(uint256 => bool) public bridgeSupportsBotGas;
    // Explicit safety gate: proxy execution is OFF until source-chain gateway/refund semantics are validated.
    mapping(uint256 => bool) public bridgeProxyExecutionEnabled;

    // Optional activation delay for newly registered integrations.
    uint256 public registryActivationDelay;
    mapping(uint256 => uint256) public routerActivationTime;
    mapping(uint256 => uint256) public bridgeActivationTime;

    // Fee configuration. Defaults are intentionally zero-fee.
    uint256 public globalFeeBps = 0;
    uint256 public maxFeeBps = 500; // 5% default ceiling, matching v3; global fee still defaults to 0%.
    address public feeTreasury;
    mapping(uint256 => uint256) public routerFeeBps;
    mapping(uint256 => uint256) public bridgeFeeBps;
    mapping(address => bool) public feeExempt;
    uint256 public feeConfigNonce;

    // v3 compatibility events.
    event RouterRegistered(uint256 indexed id, address indexed router, RouterType rtype, string name);
    event RouterStatusChanged(uint256 indexed id, bool active);
    event BridgeRegistered(
        uint256 indexed id,
        address indexed bridge,
        string name,
        string destChain,
        uint256 destChainId
    );
    event BridgeStatusChanged(uint256 indexed id, bool active);
    event SwapExecuted(
        uint256 indexed routerId,
        address indexed tokenIn,
        address indexed tokenOut,
        address sender,
        address recipient,
        uint256 swapAmount,
        uint256 amountOut,
        uint256 fee
    );
    event MultiHopExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        address sender,
        address recipient,
        uint256 amountIn,
        uint256 amountOut
    );
    event BridgeSubmitted(
        uint256 indexed bridgeId,
        address indexed token,
        address sender,
        uint256 bridgeAmount,
        uint256 fee,
        uint256 destChainId
    );
    event FeeCollected(address indexed token, address indexed treasury, uint256 amount);
    event GlobalFeeBpsSet(uint256 oldBps, uint256 newBps);
    event MaxFeeBpsSet(uint256 oldMax, uint256 newMax);
    event RouterFeeBpsSet(uint256 indexed routerId, uint256 bps);
    event BridgeFeeBpsSet(uint256 indexed bridgeId, uint256 bps);
    event FeeExemptSet(address indexed account, bool exempt);
    event FeeTreasurySet(address indexed oldTreasury, address indexed newTreasury);

    // v4 indexing/governance events.
    event SwapActivity(
        address indexed sender,
        address indexed recipient,
        uint256 indexed routerId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 protocolFee
    );
    event BridgeActivity(
        address indexed sender,
        address indexed recipient,
        uint256 indexed bridgeId,
        address token,
        bytes32 resourceId,
        uint256 destinationChainId,
        uint256 amount,
        uint256 protocolFee,
        bool withBotGas
    );
    event BridgeTokenResourceSet(uint256 indexed bridgeId, address indexed token, bytes32 resourceId);
    event BridgeBotGasSupportSet(uint256 indexed bridgeId, bool supported);
    event BridgeProxyExecutionSet(uint256 indexed bridgeId, bool enabled);
    event RegistryActivationDelaySet(uint256 oldDelay, uint256 newDelay);
    event IntegrationActivationScheduled(bytes32 indexed kind, uint256 indexed id, uint256 activationTime);

    constructor(address initialOwner, address initialFeeTreasury) Pausable(initialOwner) {
        if (!(initialFeeTreasury != address(0))) revert InvalidTreasury();
        feeTreasury = initialFeeTreasury;
    }

    // ---------------------------------------------------------------------
    // Fee configuration
    // ---------------------------------------------------------------------

    function setGlobalFeeBps(uint256 bps) external onlyOwner {
        if (!(bps <= maxFeeBps)) revert ExceedsMaxfeebps();
        uint256 old = globalFeeBps;
        globalFeeBps = bps;
        unchecked { ++feeConfigNonce; }
        emit GlobalFeeBpsSet(old, bps);
    }

    function setMaxFeeBps(uint256 newMax) external onlyOwner {
        if (!(newMax <= ABS_MAX_FEE_BPS)) revert ExceedsAbsoluteMax10();
        if (!(newMax >= globalFeeBps)) revert BelowGlobalFee();
        uint256 old = maxFeeBps;
        maxFeeBps = newMax;
        unchecked { ++feeConfigNonce; }
        emit MaxFeeBpsSet(old, newMax);
    }

    function setRouterFeeBps(uint256 routerId, uint256 bps) external onlyOwner {
        if (!(routerId < routerCount)) revert RouterNotFound();
        if (!(bps == OVERRIDE_ZERO || bps <= maxFeeBps)) revert ExceedsMaxfeebps();
        routerFeeBps[routerId] = bps;
        unchecked { ++feeConfigNonce; }
        emit RouterFeeBpsSet(routerId, bps);
    }

    function setBridgeFeeBps(uint256 bridgeId, uint256 bps) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (!(bps == OVERRIDE_ZERO || bps <= maxFeeBps)) revert ExceedsMaxfeebps();
        bridgeFeeBps[bridgeId] = bps;
        unchecked { ++feeConfigNonce; }
        emit BridgeFeeBpsSet(bridgeId, bps);
    }

    function setFeeExempt(address account, bool exempt) external onlyOwner {
        if (!(account != address(0))) revert ZeroAddress();
        feeExempt[account] = exempt;
        unchecked { ++feeConfigNonce; }
        emit FeeExemptSet(account, exempt);
    }

    function setFeeTreasury(address newTreasury) external onlyOwner {
        if (!(newTreasury != address(0))) revert ZeroAddress();
        address old = feeTreasury;
        feeTreasury = newTreasury;
        unchecked { ++feeConfigNonce; }
        emit FeeTreasurySet(old, newTreasury);
    }

    function computeRouterFee(uint256 routerId, uint256 swapAmount, address user)
        public
        view
        returns (uint256 fee, uint256 effectiveBps)
    {
        if (!(routerId < routerCount)) revert RouterNotFound();
        if (feeExempt[user]) return (0, 0);
        uint256 override_ = routerFeeBps[routerId];
        if (override_ == OVERRIDE_ZERO) return (0, 0);
        effectiveBps = override_ > 0 ? override_ : globalFeeBps;
        if (effectiveBps > maxFeeBps) effectiveBps = maxFeeBps;
        fee = (swapAmount * effectiveBps) / BPS_DENOMINATOR;
    }

    function computeBridgeFee(uint256 bridgeId, uint256 bridgeAmount, address user)
        public
        view
        returns (uint256 fee, uint256 effectiveBps)
    {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (feeExempt[user]) return (0, 0);
        uint256 override_ = bridgeFeeBps[bridgeId];
        if (override_ == OVERRIDE_ZERO) return (0, 0);
        effectiveBps = override_ > 0 ? override_ : globalFeeBps;
        if (effectiveBps > maxFeeBps) effectiveBps = maxFeeBps;
        fee = (bridgeAmount * effectiveBps) / BPS_DENOMINATOR;
    }

    function getFeeConfig()
        external
        view
        returns (uint256 _globalFeeBps, uint256 _maxFeeBps, address _feeTreasury)
    {
        return (globalFeeBps, maxFeeBps, feeTreasury);
    }

    // ---------------------------------------------------------------------
    // Registry governance
    // ---------------------------------------------------------------------

    function setRegistryActivationDelay(uint256 newDelay) external onlyOwner {
        if (!(newDelay <= MAX_REGISTRY_ACTIVATION_DELAY)) revert DelayTooLong();
        uint256 old = registryActivationDelay;
        registryActivationDelay = newDelay;
        emit RegistryActivationDelaySet(old, newDelay);
    }

    function registerRouter(
        address router,
        RouterType rtype,
        address wrappedNative,
        string calldata name,
        string calldata version
    ) external onlyOwner returns (uint256 routerId) {
        if (!(router != address(0) && router.code.length > 0)) revert InvalidRouter();
        if (!(wrappedNative != address(0) && wrappedNative.code.length > 0)) revert InvalidWrappednative();
        if (!(bytes(name).length > 0)) revert NameRequired();

        routerId = routerCount++;
        bool activateNow = registryActivationDelay == 0;
        routers[routerId] = RouterEntry(router, rtype, wrappedNative, activateNow, name, version);
        routerActivationTime[routerId] = block.timestamp + registryActivationDelay;

        emit RouterRegistered(routerId, router, rtype, name);
        if (!activateNow) {
            emit IntegrationActivationScheduled(keccak256("ROUTER"), routerId, routerActivationTime[routerId]);
        }
    }

    function setRouterActive(uint256 routerId, bool active) external onlyOwner {
        if (!(routerId < routerCount)) revert RouterNotFound();
        if (active) if (!(block.timestamp >= routerActivationTime[routerId])) revert ActivationDelay();
        routers[routerId].active = active;
        emit RouterStatusChanged(routerId, active);
    }

    /**
     * @dev V30.1B hardening: any material mutation of an integration re-arms the
     *      activation delay, so a mutated route cannot be re-activated instantly.
     *      Delay changes never accelerate an already-scheduled activation because
     *      activation times are stored as absolute timestamps.
     */
    function _rearmRouterActivation(uint256 routerId) internal {
        uint256 activationTime = block.timestamp + registryActivationDelay;
        routerActivationTime[routerId] = activationTime;
        emit IntegrationActivationScheduled(keccak256("ROUTER"), routerId, activationTime);
    }

    function _rearmBridgeActivation(uint256 bridgeId) internal {
        uint256 activationTime = block.timestamp + registryActivationDelay;
        bridgeActivationTime[bridgeId] = activationTime;
        emit IntegrationActivationScheduled(keccak256("BRIDGE"), bridgeId, activationTime);
    }

    function updateRouterWrappedNative(uint256 routerId, address newWrappedNative) external onlyOwner {
        if (!(routerId < routerCount)) revert RouterNotFound();
        if (!(!routers[routerId].active)) revert DeactivateFirst();
        if (!(newWrappedNative != address(0) && newWrappedNative.code.length > 0)) revert InvalidAddress();
        routers[routerId].wrappedNative = newWrappedNative;
        _rearmRouterActivation(routerId);
    }


    /**
     * @notice v3-compatible bridge registration. Resource IDs must be configured separately
     *         with setBridgeTokenResource before execution is enabled for a token.
     */
    function registerBridge(
        address bridge,
        string calldata name,
        string calldata destChainName,
        uint256 destChainId,
        address[] calldata supportedTokens
    ) external onlyOwner returns (uint256 bridgeId) {
        bridgeId = _registerBridge(bridge, name, destChainName, destChainId, supportedTokens, false);
    }

    /** @notice Register and fully configure a BOT Bridge route in one transaction. */
    function registerBotBridge(
        address bridge,
        string calldata name,
        string calldata destChainName,
        uint256 destChainId,
        address[] calldata supportedTokens,
        bytes32[] calldata resourceIds,
        bool supportsBotGas
    ) external onlyOwner returns (uint256 bridgeId) {
        if (!(supportedTokens.length == resourceIds.length)) revert LengthMismatch();
        bridgeId = _registerBridge(bridge, name, destChainName, destChainId, supportedTokens, supportsBotGas);
        for (uint256 i = 0; i < supportedTokens.length; ++i) {
            if (!(resourceIds[i] != bytes32(0))) revert ResourceRequired();
            bridgeResourceId[bridgeId][supportedTokens[i]] = resourceIds[i];
            emit BridgeTokenResourceSet(bridgeId, supportedTokens[i], resourceIds[i]);
        }
    }

    function _registerBridge(
        address bridge,
        string calldata name,
        string calldata destChainName,
        uint256 destChainId,
        address[] calldata supportedTokens,
        bool supportsBotGas
    ) internal returns (uint256 bridgeId) {
        if (!(bridge != address(0) && bridge.code.length > 0)) revert InvalidBridge();
        if (!(bytes(name).length > 0)) revert NameRequired();
        if (!(destChainId != 0)) revert DestinationRequired();
        if (!(supportedTokens.length > 0)) revert TokensRequired();

        bridgeId = bridgeCount++;
        bool activateNow = registryActivationDelay == 0;
        bridges[bridgeId] = BridgeEntry(bridge, activateNow, name, destChainName, destChainId, supportedTokens);
        bridgeActivationTime[bridgeId] = block.timestamp + registryActivationDelay;
        bridgeSupportsBotGas[bridgeId] = supportsBotGas;

        for (uint256 i = 0; i < supportedTokens.length; ++i) {
            address token = supportedTokens[i];
            if (!(token != address(0) && token.code.length > 0)) revert InvalidToken();
            if (!(!bridgeTokenSupported[bridgeId][token])) revert DuplicateToken();
            bridgeTokenSupported[bridgeId][token] = true;
        }

        emit BridgeRegistered(bridgeId, bridge, name, destChainName, destChainId);
        if (!activateNow) {
            emit IntegrationActivationScheduled(keccak256("BRIDGE"), bridgeId, bridgeActivationTime[bridgeId]);
        }
    }

    function setBridgeActive(uint256 bridgeId, bool active) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (active) if (!(block.timestamp >= bridgeActivationTime[bridgeId])) revert ActivationDelay();
        bridges[bridgeId].active = active;
        emit BridgeStatusChanged(bridgeId, active);
    }

    function updateBridgeSupportedTokens(uint256 bridgeId, address[] calldata tokens) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (!(!bridges[bridgeId].active)) revert DeactivateFirst();
        if (!(tokens.length > 0)) revert TokensRequired();

        address[] storage oldTokens = bridges[bridgeId].supportedTokens;
        for (uint256 i = 0; i < oldTokens.length; ++i) {
            bridgeTokenSupported[bridgeId][oldTokens[i]] = false;
            delete bridgeResourceId[bridgeId][oldTokens[i]];
        }
        delete bridges[bridgeId].supportedTokens;

        for (uint256 i = 0; i < tokens.length; ++i) {
            address token = tokens[i];
            if (!(token != address(0) && token.code.length > 0)) revert InvalidToken();
            if (!(!bridgeTokenSupported[bridgeId][token])) revert DuplicateToken();
            bridgeTokenSupported[bridgeId][token] = true;
            bridges[bridgeId].supportedTokens.push(token);
        }
        _rearmBridgeActivation(bridgeId);
    }

    function setBridgeTokenResource(uint256 bridgeId, address token, bytes32 resourceId) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (!(!bridges[bridgeId].active)) revert DeactivateFirst();
        if (!(bridgeTokenSupported[bridgeId][token])) revert TokenNotSupported();
        if (!(resourceId != bytes32(0))) revert ResourceRequired();
        bridgeResourceId[bridgeId][token] = resourceId;
        emit BridgeTokenResourceSet(bridgeId, token, resourceId);
        _rearmBridgeActivation(bridgeId);
    }

    function setBridgeSupportsBotGas(uint256 bridgeId, bool supported) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (!(!bridges[bridgeId].active)) revert DeactivateFirst();
        bridgeSupportsBotGas[bridgeId] = supported;
        emit BridgeBotGasSupportSet(bridgeId, supported);
        _rearmBridgeActivation(bridgeId);
    }

    /**
     * @notice Explicitly enable/disable FlowBridge-as-depositor execution for a bridge route.
     * @dev Disabled by default. Enable only after testnet confirms that official gateway refund/recovery
     *      semantics are safe when msg.sender is this router rather than the end-user wallet.
     */
    function setBridgeProxyExecutionEnabled(uint256 bridgeId, bool enabled) external onlyOwner {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        if (!(!bridges[bridgeId].active)) revert DeactivateFirst();
        bridgeProxyExecutionEnabled[bridgeId] = enabled;
        emit BridgeProxyExecutionSet(bridgeId, enabled);
        _rearmBridgeActivation(bridgeId);
    }


    // ---------------------------------------------------------------------
    // V2 token -> token (v3-compatible + fee-bound safe variant)
    // ---------------------------------------------------------------------

    function swapV2Safe(
        uint256 routerId,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        return _swapV2(routerId, swapAmount, amountOutMin, path, to, deadline, maxProtocolFee);
    }

    function _swapV2(
        uint256 routerId,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) internal returns (uint256[] memory amounts) {
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);
        _validateV2Path(path);

        RouterEntry storage r = _requireRouter(routerId);
        if (!(r.rtype == RouterType.V2)) revert NotV2();

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        _collectExactTokenInput(path[0], msg.sender, swapAmount + fee);
        _takeFee(path[0], fee);

        IERC20(path[0]).forceApprove(r.router, swapAmount);
        amounts = IUniswapV2Router(r.router).swapExactTokensForTokens(
            swapAmount,
            amountOutMin,
            path,
            to,
            deadline
        );
        _clearAllowance(path[0], r.router);

        uint256 out = amounts[amounts.length - 1];
        _emitSwap(routerId, path[0], path[path.length - 1], msg.sender, to, swapAmount, out, fee);
    }

    // ---------------------------------------------------------------------
    // V3 token -> token single hop
    // ---------------------------------------------------------------------

    function swapV3SingleSafe(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapV3Single(
            routerId, tokenIn, tokenOut, feePool, swapAmount, amountOutMinimum, to, deadline, maxProtocolFee
        );
    }

    function _swapV3Single(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) internal returns (uint256 amountOut) {
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(tokenIn != address(0) && tokenOut != address(0))) revert InvalidToken();
        if (!(tokenIn != tokenOut)) revert IdenticalTokens();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        if (!(r.rtype == RouterType.V3)) revert NotV3();

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        _collectExactTokenInput(tokenIn, msg.sender, swapAmount + fee);
        _takeFee(tokenIn, fee);

        IERC20(tokenIn).forceApprove(r.router, swapAmount);
        amountOut = ISwapRouterV3(r.router).exactInputSingle(
            ISwapRouterV3.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: feePool,
                recipient: to,
                deadline: deadline,
                amountIn: swapAmount,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
        _clearAllowance(tokenIn, r.router);

        _emitSwap(routerId, tokenIn, tokenOut, msg.sender, to, swapAmount, amountOut, fee);
    }

    // ---------------------------------------------------------------------
    // V3 token -> token encoded multi-hop
    // ---------------------------------------------------------------------

    function swapV3MultiSafe(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        bytes calldata encodedPath,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapV3Multi(
            routerId, tokenIn, tokenOut, encodedPath, swapAmount, amountOutMinimum, to, deadline, maxProtocolFee
        );
    }

    function _swapV3Multi(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        bytes calldata encodedPath,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) internal returns (uint256 amountOut) {
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(tokenIn != address(0) && tokenOut != address(0))) revert InvalidToken();
        if (!(tokenIn != tokenOut)) revert IdenticalTokens();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);
        _validateV3Path(encodedPath, tokenIn, tokenOut);

        RouterEntry storage r = _requireRouter(routerId);
        if (!(r.rtype == RouterType.V3)) revert NotV3();

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        _collectExactTokenInput(tokenIn, msg.sender, swapAmount + fee);
        _takeFee(tokenIn, fee);

        IERC20(tokenIn).forceApprove(r.router, swapAmount);
        amountOut = ISwapRouterV3(r.router).exactInput(
            ISwapRouterV3.ExactInputParams({
                path: encodedPath,
                recipient: to,
                deadline: deadline,
                amountIn: swapAmount,
                amountOutMinimum: amountOutMinimum
            })
        );
        _clearAllowance(tokenIn, r.router);

        _emitSwap(routerId, tokenIn, tokenOut, msg.sender, to, swapAmount, amountOut, fee);
    }

    // ---------------------------------------------------------------------
    // Native -> token
    // ---------------------------------------------------------------------

    function swapNativeToTokenSafe(
        uint256 routerId,
        uint256 swapAmount,
        address tokenOut,
        uint24 feePool,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(tokenOut != address(0))) revert InvalidTokenout();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        if (!(msg.value == swapAmount + fee)) revert IncorrectMsgValue();

        amountOut = _executeNativeToToken(r, tokenOut, feePool, amountOutMin, path, to, deadline, swapAmount, fee);
        _emitSwap(routerId, address(0), tokenOut, msg.sender, to, swapAmount, amountOut, fee);
    }

    function _executeNativeToToken(
        RouterEntry storage r,
        address tokenOut,
        uint24 feePool,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        uint256 swapAmount,
        uint256 fee
    ) internal returns (uint256 amountOut) {
        _takeNativeFee(fee);

        if (r.rtype == RouterType.V2) {
            _validateV2NativeToTokenPath(path, r.wrappedNative, tokenOut);
            uint256[] memory amounts = IUniswapV2Router(r.router).swapExactETHForTokens{value: swapAmount}(
                amountOutMin,
                path,
                to,
                deadline
            );
            amountOut = amounts[amounts.length - 1];
        } else {
            amountOut = ISwapRouterV3(r.router).exactInputSingle{value: swapAmount}(
                ISwapRouterV3.ExactInputSingleParams({
                    tokenIn: r.wrappedNative,
                    tokenOut: tokenOut,
                    fee: feePool,
                    recipient: to,
                    deadline: deadline,
                    amountIn: swapAmount,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            );
        }
    }

    // ---------------------------------------------------------------------
    // Token -> native
    // ---------------------------------------------------------------------

    function swapTokenToNativeSafe(
        uint256 routerId,
        address tokenIn,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address payable to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapTokenToNative(
            routerId, tokenIn, feePool, swapAmount, amountOutMin, path, to, deadline, maxProtocolFee
        );
    }

    function _swapTokenToNative(
        uint256 routerId,
        address tokenIn,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address payable to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) internal returns (uint256 amountOut) {
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(tokenIn != address(0))) revert InvalidTokenin();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        _collectExactTokenInput(tokenIn, msg.sender, swapAmount + fee);
        _takeFee(tokenIn, fee);

        IERC20(tokenIn).forceApprove(r.router, swapAmount);
        if (r.rtype == RouterType.V2) {
            _validateV2TokenToNativePath(path, tokenIn, r.wrappedNative);
            uint256[] memory amounts = IUniswapV2Router(r.router).swapExactTokensForETH(
                swapAmount,
                amountOutMin,
                path,
                to,
                deadline
            );
            amountOut = amounts[amounts.length - 1];
        } else {
            amountOut = ISwapRouterV3(r.router).exactInputSingle(
                ISwapRouterV3.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: r.wrappedNative,
                    fee: feePool,
                    recipient: address(this),
                    deadline: deadline,
                    amountIn: swapAmount,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            );
            IWrappedNative(r.wrappedNative).withdraw(amountOut);
            (bool ok,) = to.call{value: amountOut}("");
            if (!(ok)) revert NativeDeliveryFailed();
        }
        _clearAllowance(tokenIn, r.router);

        _emitSwap(routerId, tokenIn, address(0), msg.sender, to, swapAmount, amountOut, fee);
    }

    // ---------------------------------------------------------------------
    // Cross-router V2 multi-hop
    // ---------------------------------------------------------------------

    function swapMultiHopSafe(
        HopParams[] calldata hops,
        uint256 swapAmount,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) external nonReentrant whenNotPaused returns (uint256 finalAmountOut) {
        return _swapMultiHop(hops, swapAmount, to, deadline, maxProtocolFee);
    }

    function _swapMultiHop(
        HopParams[] calldata hops,
        uint256 swapAmount,
        address to,
        uint256 deadline,
        uint256 maxProtocolFee
    ) internal returns (uint256 finalAmountOut) {
        if (!(hops.length >= 2 && hops.length <= 10)) revert Hops210();
        if (!(swapAmount > 0)) revert ZeroAmount();
        if (!(to != address(0))) revert InvalidRecipient();
        _validateDeadline(deadline);
        _validateV2Path(hops[0].path);

        address tokenIn = hops[0].path[0];
        (uint256 fee,) = computeRouterFee(hops[0].routerId, swapAmount, msg.sender);
        if (!(fee <= maxProtocolFee)) revert ProtocolFeeChanged();
        _collectExactTokenInput(tokenIn, msg.sender, swapAmount + fee);
        _takeFee(tokenIn, fee);

        address lastToken = tokenIn;
        uint256 currentAmount = swapAmount;

        for (uint256 i = 0; i < hops.length; ++i) {
            HopParams calldata hop = hops[i];
            _validateV2Path(hop.path);
            if (!(hop.path[0] == lastToken)) revert HopTokenMismatch();

            RouterEntry storage r = _requireRouter(hop.routerId);
            if (!(r.rtype == RouterType.V2)) revert MultiHopV2Only();

            address hopRecipient = i == hops.length - 1 ? to : address(this);
            IERC20(lastToken).forceApprove(r.router, currentAmount);
            uint256[] memory amounts = IUniswapV2Router(r.router).swapExactTokensForTokens(
                currentAmount,
                hop.amountOutMin,
                hop.path,
                hopRecipient,
                deadline
            );
            _clearAllowance(lastToken, r.router);

            lastToken = hop.path[hop.path.length - 1];
            currentAmount = amounts[amounts.length - 1];
        }

        finalAmountOut = currentAmount;
        emit MultiHopExecuted(tokenIn, lastToken, msg.sender, to, swapAmount, finalAmountOut);
        emit SwapActivity(msg.sender, to, hops[0].routerId, tokenIn, lastToken, swapAmount, finalAmountOut, fee);
    }

    // ---------------------------------------------------------------------
    // BOT Bridge routing
    // ---------------------------------------------------------------------

    // ---------------------------------------------------------------------
    // Frontend view helpers
    // ---------------------------------------------------------------------

    function getBridgeSupportedTokens(uint256 bridgeId) external view returns (address[] memory) {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        return bridges[bridgeId].supportedTokens;
    }

    // ---------------------------------------------------------------------
    // Admin rescue
    // ---------------------------------------------------------------------

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (!(to != address(0))) revert InvalidRecipient();
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueNative(address payable to, uint256 amount) external onlyOwner {
        if (!(to != address(0))) revert InvalidRecipient();
        (bool ok,) = to.call{value: amount}("");
        if (!(ok)) revert RescueFailed();
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireRouter(uint256 routerId) internal view returns (RouterEntry storage r) {
        if (!(routerId < routerCount)) revert RouterNotFound();
        r = routers[routerId];
        if (!(r.active)) revert RouterInactive();
    }

    function _requireBridge(uint256 bridgeId) internal view returns (BridgeEntry storage b) {
        if (!(bridgeId < bridgeCount)) revert BridgeNotFound();
        b = bridges[bridgeId];
        if (!(b.active)) revert BridgeInactive();
    }

    function _routerEffectiveBps(uint256 routerId, address user) internal view returns (uint256) {
        if (!(routerId < routerCount)) revert RouterNotFound();
        if (feeExempt[user]) return 0;
        uint256 override_ = routerFeeBps[routerId];
        if (override_ == OVERRIDE_ZERO) return 0;
        uint256 bps = override_ > 0 ? override_ : globalFeeBps;
        return bps > maxFeeBps ? maxFeeBps : bps;
    }

    function _takeFee(address token, uint256 fee) internal {
        if (fee == 0) return;
        IERC20(token).safeTransfer(feeTreasury, fee);
        emit FeeCollected(token, feeTreasury, fee);
    }

    function _takeNativeFee(uint256 fee) internal {
        if (fee == 0) return;
        (bool ok,) = feeTreasury.call{value: fee}("");
        if (!(ok)) revert NativeFeeFailed();
        emit FeeCollected(address(0), feeTreasury, fee);
    }

    /** @dev Rejects fee-on-transfer/rebasing input behavior so accounting cannot silently diverge. */
    function _collectExactTokenInput(address token, address from, uint256 amount) internal {
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 afterBalance = IERC20(token).balanceOf(address(this));
        if (!(afterBalance >= beforeBalance && afterBalance - beforeBalance == amount)) revert UnsupportedTransferToken();
    }

    function _clearAllowance(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }

    function _validateDeadline(uint256 deadline) internal view {
        if (!(deadline >= block.timestamp)) revert DeadlinePassed();
    }

    function _validateV2Path(address[] calldata path) internal pure {
        if (!(path.length >= 2)) revert PathTooShort();
        if (!(path[0] != address(0) && path[path.length - 1] != address(0))) revert InvalidPathToken();
        if (!(path[0] != path[path.length - 1])) revert IdenticalEndpoints();
        for (uint256 i = 1; i < path.length; ++i) {
            if (!(path[i] != address(0))) revert InvalidPathToken();
            if (!(path[i] != path[i - 1])) revert DuplicatePathToken();
        }
    }

    function _validateV2NativeToTokenPath(address[] calldata path, address wrappedNative, address tokenOut)
        internal
        pure
    {
        _validateV2Path(path);
        if (!(path[0] == wrappedNative)) revert PathMustStartWrappedNative();
        if (!(path[path.length - 1] == tokenOut)) revert PathOutputMismatch();
    }

    function _validateV2TokenToNativePath(address[] calldata path, address tokenIn, address wrappedNative)
        internal
        pure
    {
        _validateV2Path(path);
        if (!(path[0] == tokenIn)) revert PathInputMismatch();
        if (!(path[path.length - 1] == wrappedNative)) revert PathMustEndWrappedNative();
    }

    function _validateV3Path(bytes calldata path, address tokenIn, address tokenOut) internal pure {
        if (!(path.length >= 43)) revert V3PathTooShort();
        if (!((path.length - 20) % 23 == 0)) revert MalformedV3Path();
        if (!(_firstPathAddress(path) == tokenIn)) revert V3InputMismatch();
        if (!(_lastPathAddress(path) == tokenOut)) revert V3OutputMismatch();
    }

    function _firstPathAddress(bytes calldata path) internal pure returns (address result) {
        assembly {
            result := shr(96, calldataload(path.offset))
        }
    }

    function _lastPathAddress(bytes calldata path) internal pure returns (address result) {
        assembly {
            result := shr(96, calldataload(add(path.offset, sub(path.length, 20))))
        }
    }

    function _emitSwap(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        address sender,
        address recipient,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    ) internal {
        emit SwapExecuted(routerId, tokenIn, tokenOut, sender, recipient, amountIn, amountOut, fee);
        emit SwapActivity(sender, recipient, routerId, tokenIn, tokenOut, amountIn, amountOut, fee);
    }

    receive() external payable {}
}
