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
        require(_status != _ENTERED, "Reentrant");
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
        require(initialOwner != address(0), "Owner: zero");
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "Owner: not owner");
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function pendingOwner() public view returns (address) {
        return _pendingOwner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Owner: zero");
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(_owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == _pendingOwner, "Owner: not pending");
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
        require(!_paused, "Paused");
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
        require(initialFeeTreasury != address(0), "Invalid treasury");
        feeTreasury = initialFeeTreasury;
    }

    // ---------------------------------------------------------------------
    // Fee configuration
    // ---------------------------------------------------------------------

    function setGlobalFeeBps(uint256 bps) external onlyOwner {
        require(bps <= maxFeeBps, "Exceeds maxFeeBps");
        uint256 old = globalFeeBps;
        globalFeeBps = bps;
        unchecked { ++feeConfigNonce; }
        emit GlobalFeeBpsSet(old, bps);
    }

    function setMaxFeeBps(uint256 newMax) external onlyOwner {
        require(newMax <= ABS_MAX_FEE_BPS, "Exceeds absolute max (10%)");
        require(newMax >= globalFeeBps, "Below global fee");
        uint256 old = maxFeeBps;
        maxFeeBps = newMax;
        unchecked { ++feeConfigNonce; }
        emit MaxFeeBpsSet(old, newMax);
    }

    function setRouterFeeBps(uint256 routerId, uint256 bps) external onlyOwner {
        require(routerId < routerCount, "Router not found");
        require(bps == OVERRIDE_ZERO || bps <= maxFeeBps, "Exceeds maxFeeBps");
        routerFeeBps[routerId] = bps;
        unchecked { ++feeConfigNonce; }
        emit RouterFeeBpsSet(routerId, bps);
    }

    function setBridgeFeeBps(uint256 bridgeId, uint256 bps) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        require(bps == OVERRIDE_ZERO || bps <= maxFeeBps, "Exceeds maxFeeBps");
        bridgeFeeBps[bridgeId] = bps;
        unchecked { ++feeConfigNonce; }
        emit BridgeFeeBpsSet(bridgeId, bps);
    }

    function setFeeExempt(address account, bool exempt) external onlyOwner {
        require(account != address(0), "Zero address");
        feeExempt[account] = exempt;
        unchecked { ++feeConfigNonce; }
        emit FeeExemptSet(account, exempt);
    }

    function setFeeTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero address");
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
        require(routerId < routerCount, "Router not found");
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
        require(bridgeId < bridgeCount, "Bridge not found");
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
        require(newDelay <= MAX_REGISTRY_ACTIVATION_DELAY, "Delay too long");
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
        require(router != address(0) && router.code.length > 0, "Invalid router");
        require(wrappedNative != address(0) && wrappedNative.code.length > 0, "Invalid wrappedNative");
        require(bytes(name).length > 0, "Name required");

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
        require(routerId < routerCount, "Router not found");
        if (active) require(block.timestamp >= routerActivationTime[routerId], "Activation delay");
        routers[routerId].active = active;
        emit RouterStatusChanged(routerId, active);
    }

    function updateRouterWrappedNative(uint256 routerId, address newWrappedNative) external onlyOwner {
        require(routerId < routerCount, "Router not found");
        require(!routers[routerId].active, "Deactivate first");
        require(newWrappedNative != address(0) && newWrappedNative.code.length > 0, "Invalid address");
        routers[routerId].wrappedNative = newWrappedNative;
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
        require(supportedTokens.length == resourceIds.length, "Length mismatch");
        bridgeId = _registerBridge(bridge, name, destChainName, destChainId, supportedTokens, supportsBotGas);
        for (uint256 i = 0; i < supportedTokens.length; ++i) {
            require(resourceIds[i] != bytes32(0), "Resource required");
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
        require(bridge != address(0) && bridge.code.length > 0, "Invalid bridge");
        require(bytes(name).length > 0, "Name required");
        require(destChainId != 0, "Destination required");
        require(supportedTokens.length > 0, "Tokens required");

        bridgeId = bridgeCount++;
        bool activateNow = registryActivationDelay == 0;
        bridges[bridgeId] = BridgeEntry(bridge, activateNow, name, destChainName, destChainId, supportedTokens);
        bridgeActivationTime[bridgeId] = block.timestamp + registryActivationDelay;
        bridgeSupportsBotGas[bridgeId] = supportsBotGas;

        for (uint256 i = 0; i < supportedTokens.length; ++i) {
            address token = supportedTokens[i];
            require(token != address(0) && token.code.length > 0, "Invalid token");
            require(!bridgeTokenSupported[bridgeId][token], "Duplicate token");
            bridgeTokenSupported[bridgeId][token] = true;
        }

        emit BridgeRegistered(bridgeId, bridge, name, destChainName, destChainId);
        if (!activateNow) {
            emit IntegrationActivationScheduled(keccak256("BRIDGE"), bridgeId, bridgeActivationTime[bridgeId]);
        }
    }

    function setBridgeActive(uint256 bridgeId, bool active) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        if (active) require(block.timestamp >= bridgeActivationTime[bridgeId], "Activation delay");
        bridges[bridgeId].active = active;
        emit BridgeStatusChanged(bridgeId, active);
    }

    function updateBridgeSupportedTokens(uint256 bridgeId, address[] calldata tokens) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        require(!bridges[bridgeId].active, "Deactivate first");
        require(tokens.length > 0, "Tokens required");

        address[] storage oldTokens = bridges[bridgeId].supportedTokens;
        for (uint256 i = 0; i < oldTokens.length; ++i) {
            bridgeTokenSupported[bridgeId][oldTokens[i]] = false;
            delete bridgeResourceId[bridgeId][oldTokens[i]];
        }
        delete bridges[bridgeId].supportedTokens;

        for (uint256 i = 0; i < tokens.length; ++i) {
            address token = tokens[i];
            require(token != address(0) && token.code.length > 0, "Invalid token");
            require(!bridgeTokenSupported[bridgeId][token], "Duplicate token");
            bridgeTokenSupported[bridgeId][token] = true;
            bridges[bridgeId].supportedTokens.push(token);
        }
    }

    function setBridgeTokenResource(uint256 bridgeId, address token, bytes32 resourceId) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        require(!bridges[bridgeId].active, "Deactivate first");
        require(bridgeTokenSupported[bridgeId][token], "Token not supported");
        require(resourceId != bytes32(0), "Resource required");
        bridgeResourceId[bridgeId][token] = resourceId;
        emit BridgeTokenResourceSet(bridgeId, token, resourceId);
    }

    function setBridgeSupportsBotGas(uint256 bridgeId, bool supported) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        require(!bridges[bridgeId].active, "Deactivate first");
        bridgeSupportsBotGas[bridgeId] = supported;
        emit BridgeBotGasSupportSet(bridgeId, supported);
    }

    /**
     * @notice Explicitly enable/disable FlowBridge-as-depositor execution for a bridge route.
     * @dev Disabled by default. Enable only after testnet confirms that official gateway refund/recovery
     *      semantics are safe when msg.sender is this router rather than the end-user wallet.
     */
    function setBridgeProxyExecutionEnabled(uint256 bridgeId, bool enabled) external onlyOwner {
        require(bridgeId < bridgeCount, "Bridge not found");
        require(!bridges[bridgeId].active, "Deactivate first");
        bridgeProxyExecutionEnabled[bridgeId] = enabled;
        emit BridgeProxyExecutionSet(bridgeId, enabled);
    }

    // ---------------------------------------------------------------------
    // V2 token -> token (v3-compatible + fee-bound safe variant)
    // ---------------------------------------------------------------------

    function swapV2(
        uint256 routerId,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256[] memory amounts) {
        return _swapV2(routerId, swapAmount, amountOutMin, path, to, deadline, type(uint256).max);
    }

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
        require(swapAmount > 0, "Zero amount");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);
        _validateV2Path(path);

        RouterEntry storage r = _requireRouter(routerId);
        require(r.rtype == RouterType.V2, "Not V2");

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
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

    function swapV3Single(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapV3Single(
            routerId, tokenIn, tokenOut, feePool, swapAmount, amountOutMinimum, to, deadline, type(uint256).max
        );
    }

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
        require(swapAmount > 0, "Zero amount");
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid token");
        require(tokenIn != tokenOut, "Identical tokens");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        require(r.rtype == RouterType.V3, "Not V3");

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
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

    function swapV3Multi(
        uint256 routerId,
        address tokenIn,
        address tokenOut,
        bytes calldata encodedPath,
        uint256 swapAmount,
        uint256 amountOutMinimum,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapV3Multi(
            routerId, tokenIn, tokenOut, encodedPath, swapAmount, amountOutMinimum, to, deadline, type(uint256).max
        );
    }

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
        require(swapAmount > 0, "Zero amount");
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid token");
        require(tokenIn != tokenOut, "Identical tokens");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);
        _validateV3Path(encodedPath, tokenIn, tokenOut);

        RouterEntry storage r = _requireRouter(routerId);
        require(r.rtype == RouterType.V3, "Not V3");

        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
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

    /**
     * @notice v3-compatible native swap. msg.value is interpreted as swap amount + protocol fee.
     * Prefer swapNativeToTokenSafe in new frontend integrations.
     */
    function swapNativeToToken(
        uint256 routerId,
        address tokenOut,
        uint24 feePool,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        require(msg.value > 0, "Zero value");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        uint256 effectiveBps = _routerEffectiveBps(routerId, msg.sender);
        uint256 fee = (msg.value * effectiveBps) / (BPS_DENOMINATOR + effectiveBps);
        uint256 swapAmount = msg.value - fee;

        amountOut = _executeNativeToToken(r, tokenOut, feePool, amountOutMin, path, to, deadline, swapAmount, fee);
        _emitSwap(routerId, address(0), tokenOut, msg.sender, to, swapAmount, amountOut, fee);
    }

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
        require(swapAmount > 0, "Zero amount");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
        require(msg.value == swapAmount + fee, "Incorrect msg.value");

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

    function swapTokenToNative(
        uint256 routerId,
        address tokenIn,
        uint24 feePool,
        uint256 swapAmount,
        uint256 amountOutMin,
        address[] calldata path,
        address payable to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        return _swapTokenToNative(
            routerId, tokenIn, feePool, swapAmount, amountOutMin, path, to, deadline, type(uint256).max
        );
    }

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
        require(swapAmount > 0, "Zero amount");
        require(tokenIn != address(0), "Invalid tokenIn");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);

        RouterEntry storage r = _requireRouter(routerId);
        (uint256 fee,) = computeRouterFee(routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
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
            require(ok, "Native delivery failed");
        }
        _clearAllowance(tokenIn, r.router);

        _emitSwap(routerId, tokenIn, address(0), msg.sender, to, swapAmount, amountOut, fee);
    }

    // ---------------------------------------------------------------------
    // Cross-router V2 multi-hop
    // ---------------------------------------------------------------------

    function swapMultiHop(
        HopParams[] calldata hops,
        uint256 swapAmount,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 finalAmountOut) {
        return _swapMultiHop(hops, swapAmount, to, deadline, type(uint256).max);
    }

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
        require(hops.length >= 2 && hops.length <= 10, "Hops: 2-10");
        require(swapAmount > 0, "Zero amount");
        require(to != address(0), "Invalid recipient");
        _validateDeadline(deadline);
        _validateV2Path(hops[0].path);

        address tokenIn = hops[0].path[0];
        (uint256 fee,) = computeRouterFee(hops[0].routerId, swapAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");
        _collectExactTokenInput(tokenIn, msg.sender, swapAmount + fee);
        _takeFee(tokenIn, fee);

        address lastToken = tokenIn;
        uint256 currentAmount = swapAmount;

        for (uint256 i = 0; i < hops.length; ++i) {
            HopParams calldata hop = hops[i];
            _validateV2Path(hop.path);
            require(hop.path[0] == lastToken, "Hop token mismatch");

            RouterEntry storage r = _requireRouter(hop.routerId);
            require(r.rtype == RouterType.V2, "Multi-hop V2 only");

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

    /**
     * @notice v3-compatible bridge entry point.
     * Uses the registered destination/resource route, sends to msg.sender, and does not request BOT gas.
     */
    function bridgeWithFee(uint256 bridgeId, address token, uint256 bridgeAmount)
        external
        nonReentrant
        whenNotPaused
        returns (bool)
    {
        _bridgeBot(bridgeId, token, bridgeAmount, msg.sender, false, type(uint256).max, type(uint256).max);
        return true;
    }

    /**
     * @notice Preferred BOT Bridge entry point for the new frontend.
     * @param maxProtocolFee Maximum FlowBridge fee (token units) the user accepts.
     * @param expectedFeeConfigNonce Optional exact fee-config version. Set to type(uint256).max to ignore.
     * @dev FlowBridge does not forward native value; BOT gas top-up is handled by the official bridge from USDT.
     */
    function bridgeBot(
        uint256 bridgeId,
        address token,
        uint256 bridgeAmount,
        address recipient,
        bool withBotGas,
        uint256 maxProtocolFee,
        uint256 expectedFeeConfigNonce
    ) external nonReentrant whenNotPaused returns (bool) {
        _bridgeBot(
            bridgeId,
            token,
            bridgeAmount,
            recipient,
            withBotGas,
            maxProtocolFee,
            expectedFeeConfigNonce
        );
        return true;
    }

    function _bridgeBot(
        uint256 bridgeId,
        address token,
        uint256 bridgeAmount,
        address recipient,
        bool withBotGas,
        uint256 maxProtocolFee,
        uint256 expectedFeeConfigNonce
    ) internal {
        require(bridgeAmount > 0, "Zero amount");
        require(token != address(0) && token.code.length > 0, "Invalid token");
        require(recipient != address(0), "Invalid recipient");
        if (expectedFeeConfigNonce != type(uint256).max) {
            require(expectedFeeConfigNonce == feeConfigNonce, "Fee config changed");
        }

        BridgeEntry storage b = _requireBridge(bridgeId);
        require(bridgeProxyExecutionEnabled[bridgeId], "Bridge proxy execution disabled");
        require(bridgeTokenSupported[bridgeId][token], "Token not supported");
        bytes32 resourceId = bridgeResourceId[bridgeId][token];
        require(resourceId != bytes32(0), "Bridge resource not configured");
        if (withBotGas) require(bridgeSupportsBotGas[bridgeId], "BOT gas mode unsupported");

        (uint256 fee,) = computeBridgeFee(bridgeId, bridgeAmount, msg.sender);
        require(fee <= maxProtocolFee, "Protocol fee changed");

        _collectExactTokenInput(token, msg.sender, bridgeAmount + fee);
        _takeFee(token, fee);

        IERC20(token).forceApprove(b.bridge, bridgeAmount);
        if (withBotGas) {
            IBotBridgeGateway(b.bridge).depositWithBotGas(
                b.destChainId,
                resourceId,
                recipient,
                bridgeAmount
            );
        } else {
            IBotBridgeGateway(b.bridge).deposit(
                b.destChainId,
                resourceId,
                recipient,
                bridgeAmount
            );
        }
        _clearAllowance(token, b.bridge);

        emit BridgeSubmitted(bridgeId, token, msg.sender, bridgeAmount, fee, b.destChainId);
        emit BridgeActivity(
            msg.sender,
            recipient,
            bridgeId,
            token,
            resourceId,
            b.destChainId,
            bridgeAmount,
            fee,
            withBotGas
        );
    }

    // ---------------------------------------------------------------------
    // Frontend view helpers
    // ---------------------------------------------------------------------

    function getActiveRouters()
        external
        view
        returns (
            uint256[] memory ids,
            string[] memory names,
            string[] memory versions,
            RouterType[] memory types_,
            address[] memory addrs
        )
    {
        uint256 count;
        for (uint256 i = 0; i < routerCount; ++i) if (routers[i].active) ++count;

        ids = new uint256[](count);
        names = new string[](count);
        versions = new string[](count);
        types_ = new RouterType[](count);
        addrs = new address[](count);

        uint256 index;
        for (uint256 i = 0; i < routerCount; ++i) {
            RouterEntry storage r = routers[i];
            if (r.active) {
                ids[index] = i;
                names[index] = r.name;
                versions[index] = r.version;
                types_[index] = r.rtype;
                addrs[index] = r.router;
                ++index;
            }
        }
    }

    function getActiveBridges()
        external
        view
        returns (
            uint256[] memory ids,
            string[] memory names,
            string[] memory destChainNames,
            uint256[] memory destChainIds,
            address[] memory addrs
        )
    {
        uint256 count;
        for (uint256 i = 0; i < bridgeCount; ++i) if (bridges[i].active) ++count;

        ids = new uint256[](count);
        names = new string[](count);
        destChainNames = new string[](count);
        destChainIds = new uint256[](count);
        addrs = new address[](count);

        uint256 index;
        for (uint256 i = 0; i < bridgeCount; ++i) {
            BridgeEntry storage b = bridges[i];
            if (b.active) {
                ids[index] = i;
                names[index] = b.name;
                destChainNames[index] = b.destChainName;
                destChainIds[index] = b.destChainId;
                addrs[index] = b.bridge;
                ++index;
            }
        }
    }

    function getBridgeSupportedTokens(uint256 bridgeId) external view returns (address[] memory) {
        require(bridgeId < bridgeCount, "Bridge not found");
        return bridges[bridgeId].supportedTokens;
    }

    function getBridgeRouteConfig(uint256 bridgeId, address token)
        external
        view
        returns (
            address gateway,
            uint256 destinationChainId,
            bytes32 resourceId,
            bool tokenSupported,
            bool botGasSupported,
            bool proxyExecutionEnabled,
            bool active
        )
    {
        require(bridgeId < bridgeCount, "Bridge not found");
        BridgeEntry storage b = bridges[bridgeId];

        // Assign named return values sequentially instead of constructing a
        // seven-value return tuple in one expression. This keeps the legacy
        // compiler pipeline from exhausting stack slots ("stack too deep")
        // while preserving the exact external ABI.
        gateway = b.bridge;
        destinationChainId = b.destChainId;
        resourceId = bridgeResourceId[bridgeId][token];
        tokenSupported = bridgeTokenSupported[bridgeId][token];
        botGasSupported = bridgeSupportsBotGas[bridgeId];
        proxyExecutionEnabled = bridgeProxyExecutionEnabled[bridgeId];
        active = b.active;
    }

    function getBestV2Rate(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256 bestRouterId, uint256 bestAmountOut, uint256[] memory allAmountsOut)
    {
        _validateV2Path(path);
        allAmountsOut = new uint256[](routerCount);
        for (uint256 i = 0; i < routerCount; ++i) {
            RouterEntry storage r = routers[i];
            if (!r.active || r.rtype != RouterType.V2) continue;
            try IUniswapV2Router(r.router).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                uint256 out = amounts[amounts.length - 1];
                allAmountsOut[i] = out;
                if (out > bestAmountOut) {
                    bestAmountOut = out;
                    bestRouterId = i;
                }
            } catch {
                allAmountsOut[i] = 0;
            }
        }
    }

    /** @notice Paginated V2 quote helper for larger future registries. */
    function getV2RatesPage(
        uint256 amountIn,
        address[] calldata path,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory ids, uint256[] memory amountsOut) {
        _validateV2Path(path);
        if (start >= routerCount || count == 0) return (new uint256[](0), new uint256[](0));
        uint256 end = start + count;
        if (end > routerCount) end = routerCount;

        ids = new uint256[](end - start);
        amountsOut = new uint256[](end - start);
        uint256 index;
        for (uint256 i = start; i < end; ++i) {
            ids[index] = i;
            RouterEntry storage r = routers[i];
            if (r.active && r.rtype == RouterType.V2) {
                try IUniswapV2Router(r.router).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                    amountsOut[index] = amounts[amounts.length - 1];
                } catch {
                    amountsOut[index] = 0;
                }
            }
            ++index;
        }
    }

    // ---------------------------------------------------------------------
    // Admin rescue
    // ---------------------------------------------------------------------

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueNative(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Rescue failed");
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireRouter(uint256 routerId) internal view returns (RouterEntry storage r) {
        require(routerId < routerCount, "Router not found");
        r = routers[routerId];
        require(r.active, "Router inactive");
    }

    function _requireBridge(uint256 bridgeId) internal view returns (BridgeEntry storage b) {
        require(bridgeId < bridgeCount, "Bridge not found");
        b = bridges[bridgeId];
        require(b.active, "Bridge inactive");
    }

    function _routerEffectiveBps(uint256 routerId, address user) internal view returns (uint256) {
        require(routerId < routerCount, "Router not found");
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
        require(ok, "Native fee failed");
        emit FeeCollected(address(0), feeTreasury, fee);
    }

    /** @dev Rejects fee-on-transfer/rebasing input behavior so accounting cannot silently diverge. */
    function _collectExactTokenInput(address token, address from, uint256 amount) internal {
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 afterBalance = IERC20(token).balanceOf(address(this));
        require(afterBalance >= beforeBalance && afterBalance - beforeBalance == amount, "Unsupported transfer token");
    }

    function _clearAllowance(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }

    function _validateDeadline(uint256 deadline) internal view {
        require(deadline >= block.timestamp, "Deadline passed");
    }

    function _validateV2Path(address[] calldata path) internal pure {
        require(path.length >= 2, "Path too short");
        require(path[0] != address(0) && path[path.length - 1] != address(0), "Invalid path token");
        require(path[0] != path[path.length - 1], "Identical endpoints");
        for (uint256 i = 1; i < path.length; ++i) {
            require(path[i] != address(0), "Invalid path token");
            require(path[i] != path[i - 1], "Duplicate path token");
        }
    }

    function _validateV2NativeToTokenPath(address[] calldata path, address wrappedNative, address tokenOut)
        internal
        pure
    {
        _validateV2Path(path);
        require(path[0] == wrappedNative, "Path must start wrapped native");
        require(path[path.length - 1] == tokenOut, "Path output mismatch");
    }

    function _validateV2TokenToNativePath(address[] calldata path, address tokenIn, address wrappedNative)
        internal
        pure
    {
        _validateV2Path(path);
        require(path[0] == tokenIn, "Path input mismatch");
        require(path[path.length - 1] == wrappedNative, "Path must end wrapped native");
    }

    function _validateV3Path(bytes calldata path, address tokenIn, address tokenOut) internal pure {
        require(path.length >= 43, "V3 path too short");
        require((path.length - 20) % 23 == 0, "Malformed V3 path");
        require(_firstPathAddress(path) == tokenIn, "V3 input mismatch");
        require(_lastPathAddress(path) == tokenOut, "V3 output mismatch");
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
