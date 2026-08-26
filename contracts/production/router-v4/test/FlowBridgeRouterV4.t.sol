// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FlowBridgeRouterV4.sol";

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MockWrappedNative is MockERC20, IWrappedNative {
    constructor() MockERC20("Wrapped Native", "WNATIVE", 18) {}

    function deposit() external payable override {
        balanceOf[msg.sender] += msg.value;
        totalSupply += msg.value;
    }

    function withdraw(uint256 amount) external override {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "native");
    }

    receive() external payable {}
}

contract MockV2Router is IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        require(amountIn >= amountOutMin, "min");
        IERC20(path[path.length - 1]).transfer(to, amountIn);
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; ++i) amounts[i] = amountIn;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable returns (uint256[] memory amounts) {
        require(msg.value >= amountOutMin, "min");
        IERC20(path[path.length - 1]).transfer(to, msg.value);
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; ++i) amounts[i] = msg.value;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        require(amountIn >= amountOutMin, "min");
        (bool ok,) = payable(to).call{value: amountIn}("");
        require(ok, "native");
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; ++i) amounts[i] = amountIn;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; ++i) amounts[i] = amountIn;
    }

    receive() external payable {}
}

contract MockBotBridgeGateway is IBotBridgeGateway {
    address public immutable token;
    uint256 public destinationChainId;
    bytes32 public resourceId;
    address public recipient;
    uint256 public amount;
    bool public withBotGas;
    uint256 public valueReceived;

    constructor(address t) {
        token = t;
    }

    function deposit(uint256 d, bytes32 r, address recipient_, uint256 amount_) external payable override {
        _record(d, r, recipient_, amount_, false);
    }

    function depositWithBotGas(uint256 d, bytes32 r, address recipient_, uint256 amount_)
        external
        payable
        override
    {
        _record(d, r, recipient_, amount_, true);
    }

    function _record(uint256 d, bytes32 r, address recipient_, uint256 amount_, bool botGas) internal {
        IERC20(token).transferFrom(msg.sender, address(this), amount_);
        destinationChainId = d;
        resourceId = r;
        recipient = recipient_;
        amount = amount_;
        withBotGas = botGas;
        valueReceived = msg.value;
    }
}

contract FlowBridgeRouterV4Test is Test {
    FlowBridgeRouterV4 internal router;
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockWrappedNative internal wrapped;
    MockV2Router internal v2;
    MockBotBridgeGateway internal gateway;

    address internal user = address(0xA11CE);
    address internal recipient = address(0xB0B);
    address internal treasury = address(0xFEE);
    bytes32 internal constant RESOURCE = keccak256("USDT");

    function setUp() public {
        tokenIn = new MockERC20("Input", "IN", 6);
        tokenOut = new MockERC20("Output", "OUT", 6);
        wrapped = new MockWrappedNative();
        v2 = new MockV2Router();
        gateway = new MockBotBridgeGateway(address(tokenIn));
        router = new FlowBridgeRouterV4(address(this), treasury);

        router.registerRouter(address(v2), FlowBridgeRouterV4.RouterType.V2, address(wrapped), "Mock V2", "2");

        address[] memory tokens = new address[](1);
        tokens[0] = address(tokenIn);
        bytes32[] memory resources = new bytes32[](1);
        resources[0] = RESOURCE;
        router.registerBotBridge(address(gateway), "BOT Bridge", "BOT", 677, tokens, resources, true);
        // Proxy bridge execution is intentionally disabled by default. Test suite explicitly opts in.
        router.setBridgeActive(0, false);
        router.setBridgeProxyExecutionEnabled(0, true);
        router.setBridgeActive(0, true);

        tokenIn.mint(user, 1_000_000e6);
        tokenOut.mint(address(v2), 1_000_000e6);
        vm.deal(address(v2), 100 ether);
    }

    function test_DefaultFeeIsZero() public view {
        (uint256 fee, uint256 bps) = router.computeRouterFee(0, 100e6, user);
        assertEq(fee, 0);
        assertEq(bps, 0);
        (uint256 bridgeFee, uint256 bridgeBps) = router.computeBridgeFee(0, 100e6, user);
        assertEq(bridgeFee, 0);
        assertEq(bridgeBps, 0);
    }

    function test_V2SafeSwapWorks() public {
        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        vm.startPrank(user);
        tokenIn.approve(address(router), 100e6);
        router.swapV2Safe(0, 100e6, 99e6, path, user, block.timestamp + 60, type(uint256).max);
        vm.stopPrank();

        assertEq(tokenOut.balanceOf(user), 100e6);
        assertEq(tokenIn.allowance(address(router), address(v2)), 0);
    }

    function test_SafeSwapRejectsFeeChange() public {
        router.setGlobalFeeBps(10); // 0.10%

        address[] memory path = new address[](2);
        path[0] = address(tokenIn);
        path[1] = address(tokenOut);

        vm.startPrank(user);
        tokenIn.approve(address(router), 101e6);
        vm.expectRevert(ProtocolFeeChanged.selector);
        router.swapV2Safe(0, 100e6, 99e6, path, user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_FeeCeilingClampsExistingOverride() public {
        router.setMaxFeeBps(100);
        router.setRouterFeeBps(0, 100);
        router.setMaxFeeBps(20);
        (uint256 fee, uint256 bps) = router.computeRouterFee(0, 100e6, user);
        assertEq(bps, 20);
        assertEq(fee, 200_000);
    }

    /**
     * V30.1B.1: bridge proxy execution (bridgeWithFee / bridgeBot) was removed from
     * the mainnet Router candidate. Production bridging is direct user wallet ->
     * official BOT Bridge. Only bridge registry metadata/reads remain.
     */
    function test_BridgeProxyExecutionSurfaceRemoved() public view {
        assertEq(router.bridgeCount(), 1);
        (address bridgeAddr, bool active,,, uint256 destChainId) = router.bridges(0);
        assertEq(bridgeAddr, address(gateway));
        assertTrue(active);
        assertEq(destChainId, 677);
        assertTrue(router.bridgeTokenSupported(0, address(tokenIn)));
        assertEq(router.bridgeResourceId(0, address(tokenIn)), RESOURCE);
        // No callable execution entrypoint exists for proxy bridging.
        assertEq(address(router).code.length > 0, true);
    }

    function test_BridgeMetadataReadsStayAvailable() public view {
        address[] memory tokens = router.getBridgeSupportedTokens(0);
        assertEq(tokens.length, 1);
        assertEq(tokens[0], address(tokenIn));
        (uint256 bridgeFee, uint256 bridgeBps) = router.computeBridgeFee(0, 100e6, user);
        assertEq(bridgeFee, 0);
        assertEq(bridgeBps, 0);
    }

    function test_InvalidNativePathReverts() public {
        address[] memory badPath = new address[](2);
        badPath[0] = address(tokenIn); // should be wrapped native
        badPath[1] = address(tokenOut);

        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(PathMustStartWrappedNative.selector);
        router.swapNativeToTokenSafe{value: 1 ether}(
            0, 1 ether, address(tokenOut), 0, 0, badPath, user, block.timestamp + 60, type(uint256).max
        );
    }

    function test_RegistryDelayBlocksEarlyActivation() public {
        router.setRegistryActivationDelay(1 days);
        MockV2Router another = new MockV2Router();
        uint256 id = router.registerRouter(
            address(another), FlowBridgeRouterV4.RouterType.V2, address(wrapped), "Delayed", "2"
        );
        vm.expectRevert(ActivationDelay.selector);
        router.setRouterActive(id, true);
        vm.warp(block.timestamp + 1 days);
        router.setRouterActive(id, true);
        (, , , bool active, , ) = router.routers(id);
        assertTrue(active);
    }
}
