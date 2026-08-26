// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FlowBridgeRouterV4.sol";
import "./FlowBridgeRouterV4.t.sol";

/** Minimal V3 router mock: 1:1 swap, honours recipient. */
contract MockV3Router is ISwapRouterV3 {
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        require(p.amountIn >= p.amountOutMinimum, "min");
        IERC20(p.tokenOut).transfer(p.recipient, p.amountIn);
        return p.amountIn;
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 amountOut) {
        address tokenIn = address(bytes20(p.path[:20]));
        address tokenOut = address(bytes20(p.path[p.path.length - 20:]));
        IERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        require(p.amountIn >= p.amountOutMinimum, "min");
        IERC20(tokenOut).transfer(p.recipient, p.amountIn);
        return p.amountIn;
    }
}

/** Token that delivers less than requested (fee-on-transfer). */
contract FeeOnTransferToken is MockERC20 {
    constructor() MockERC20("FeeOnTransfer", "FOT", 6) {}

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 net = amount - (amount / 100);
        _transfer(from, to, net);
        return true;
    }
}

/** V2 router that attempts to re-enter the FlowBridge router mid-swap. */
contract ReentrantV2Router is IUniswapV2Router {
    FlowBridgeRouterV4 public immutable flowRouter;
    address[] internal reenterPath;

    constructor(FlowBridgeRouterV4 r) {
        flowRouter = r;
    }

    function setReenterPath(address[] memory p) external {
        reenterPath = p;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        // Malicious downstream reentrancy attempt.
        flowRouter.swapV2Safe(0, amountIn, 0, reenterPath, to, block.timestamp + 60, type(uint256).max);
        amounts = new uint256[](path.length);
    }

    function swapExactETHForTokens(uint256, address[] calldata path, address, uint256)
        external
        payable
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
    }

    function swapExactTokensForETH(uint256, uint256, address[] calldata path, address, uint256)
        external
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        for (uint256 i; i < path.length; ++i) amounts[i] = amountIn;
    }
}

/**
 * V30.1B.1 — required Router acceptance matrix for the size-safe candidate.
 * Every reviewed execution invariant is exercised against the reduced Router.
 */
contract V30_1B1_SizeSafeTest is Test {
    FlowBridgeRouterV4 internal router;
    MockERC20 internal usdt;
    MockERC20 internal dai;
    MockWrappedNative internal wnative;
    MockV2Router internal v2;
    MockV2Router internal v2b;
    MockV3Router internal v3;

    address internal user = address(0xA11CE);
    address internal treasury = address(0xFEE);

    uint256 internal V2_ID;
    uint256 internal V2B_ID;
    uint256 internal V3_ID;

    function setUp() public {
        usdt = new MockERC20("USDT", "USDT", 6);
        dai = new MockERC20("DAI", "DAI", 18);
        wnative = new MockWrappedNative();
        v2 = new MockV2Router();
        v2b = new MockV2Router();
        v3 = new MockV3Router();
        router = new FlowBridgeRouterV4(address(this), treasury);

        V2_ID = router.registerRouter(address(v2), FlowBridgeRouterV4.RouterType.V2, address(wnative), "V2", "2");
        V2B_ID = router.registerRouter(address(v2b), FlowBridgeRouterV4.RouterType.V2, address(wnative), "V2b", "2");
        V3_ID = router.registerRouter(address(v3), FlowBridgeRouterV4.RouterType.V3, address(wnative), "V3", "3");

        usdt.mint(user, 1_000_000e6);
        dai.mint(address(v2), 1_000_000e18);
        dai.mint(address(v2b), 1_000_000e18);
        dai.mint(address(v3), 1_000_000e18);
        usdt.mint(address(v2), 1_000_000e6);
        usdt.mint(address(v2b), 1_000_000e6);
        wnative.mint(address(v2), 1_000e18);
        vm.deal(address(v2), 1_000 ether);
    }

    function _path(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    // --- Happy paths -------------------------------------------------------

    function test_V2TokenToTokenSafeSwap() public {
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        router.swapV2Safe(V2_ID, 100e6, 99e6, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
        assertEq(dai.balanceOf(user), 100e6);
        assertEq(usdt.allowance(address(router), address(v2)), 0);
    }

    function test_V3SingleHopSafeSwap() public {
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        router.swapV3SingleSafe(V3_ID, address(usdt), address(dai), 3000, 100e6, 99e6, user, block.timestamp + 60, 0);
        vm.stopPrank();
        assertEq(dai.balanceOf(user), 100e6);
        assertEq(usdt.allowance(address(router), address(v3)), 0);
    }

    function test_V3MultiHopSafeSwap() public {
        bytes memory encoded =
            abi.encodePacked(address(usdt), uint24(3000), address(wnative), uint24(3000), address(dai));
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        router.swapV3MultiSafe(
            V3_ID, address(usdt), address(dai), encoded, 100e6, 99e6, user, block.timestamp + 60, 0
        );
        vm.stopPrank();
        assertEq(dai.balanceOf(user), 100e6);
    }

    function test_NativeToTokenSafeSwap() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        router.swapNativeToTokenSafe{value: 1 ether}(
            V2_ID, 1 ether, address(dai), 0, 0, _path(address(wnative), address(dai)), user, block.timestamp + 60, 0
        );
        assertEq(dai.balanceOf(user), 1 ether);
    }

    function test_TokenToNativeSafeSwap() public {
        uint256 before = user.balance;
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        router.swapTokenToNativeSafe(
            V2_ID, address(usdt), 0, 100e6, 0, _path(address(usdt), address(wnative)), payable(user),
            block.timestamp + 60, 0
        );
        vm.stopPrank();
        assertEq(user.balance, before + 100e6);
    }

    function test_CrossRouterMultiHopSafeSwap() public {
        FlowBridgeRouterV4.HopParams[] memory hops = new FlowBridgeRouterV4.HopParams[](2);
        hops[0] = FlowBridgeRouterV4.HopParams({routerId: V2_ID, path: _path(address(usdt), address(dai)), amountOutMin: 0});
        hops[1] = FlowBridgeRouterV4.HopParams({routerId: V2B_ID, path: _path(address(dai), address(usdt)), amountOutMin: 0});

        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        router.swapMultiHopSafe(hops, 100e6, user, block.timestamp + 60, 0);
        vm.stopPrank();
        assertEq(usdt.balanceOf(user), 1_000_000e6);
    }

    // --- Adversarial -------------------------------------------------------

    function test_FeeChangeRejectedAtExecution() public {
        router.setGlobalFeeBps(10);
        vm.startPrank(user);
        usdt.approve(address(router), 101e6);
        vm.expectRevert(ProtocolFeeChanged.selector);
        router.swapV2Safe(V2_ID, 100e6, 0, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_SlippageFloorEnforced() public {
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        vm.expectRevert(bytes("min"));
        router.swapV2Safe(V2_ID, 100e6, 200e6, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_ExpiredDeadlineRejected() public {
        vm.warp(1_000);
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        vm.expectRevert(DeadlinePassed.selector);
        router.swapV2Safe(V2_ID, 100e6, 0, _path(address(usdt), address(dai)), user, block.timestamp - 1, 0);
        vm.stopPrank();
    }

    function test_MalformedPathRejected() public {
        address[] memory bad = new address[](2);
        bad[0] = address(usdt);
        bad[1] = address(usdt);
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        vm.expectRevert(IdenticalEndpoints.selector);
        router.swapV2Safe(V2_ID, 100e6, 0, bad, user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_MalformedV3PathRejected() public {
        bytes memory encoded = abi.encodePacked(address(dai), uint24(3000), address(usdt));
        vm.startPrank(user);
        usdt.approve(address(router), 100e6);
        vm.expectRevert(V3InputMismatch.selector);
        router.swapV3MultiSafe(V3_ID, address(usdt), address(dai), encoded, 100e6, 0, user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_FeeOnTransferInputRejected() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        fot.mint(user, 1_000e6);
        vm.startPrank(user);
        fot.approve(address(router), 100e6);
        vm.expectRevert(UnsupportedTransferToken.selector);
        router.swapV2Safe(V2_ID, 100e6, 0, _path(address(fot), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_MaliciousDownstreamReentrancyBlocked() public {
        ReentrantV2Router evil = new ReentrantV2Router(router);
        uint256 id = router.registerRouter(
            address(evil), FlowBridgeRouterV4.RouterType.V2, address(wnative), "Evil", "2"
        );
        evil.setReenterPath(_path(address(usdt), address(dai)));

        vm.startPrank(user);
        usdt.approve(address(router), 200e6);
        vm.expectRevert(Reentrant.selector);
        router.swapV2Safe(id, 100e6, 0, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
    }

    function test_PauseBlocksExecutionAndUnpauseRestores() public {
        router.pause();
        vm.startPrank(user);
        usdt.approve(address(router), 200e6);
        vm.expectRevert(ContractPaused.selector);
        router.swapV2Safe(V2_ID, 100e6, 0, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();

        router.unpause();
        vm.startPrank(user);
        router.swapV2Safe(V2_ID, 100e6, 0, _path(address(usdt), address(dai)), user, block.timestamp + 60, 0);
        vm.stopPrank();
        assertEq(dai.balanceOf(user), 100e6);
    }

    function test_RescueIsOwnerOnly() public {
        usdt.mint(address(router), 5e6);
        vm.prank(user);
        vm.expectRevert(OwnerNotOwner.selector);
        router.rescueERC20(address(usdt), user, 5e6);

        vm.prank(user);
        vm.expectRevert(OwnerNotOwner.selector);
        router.rescueNative(payable(user), 1);

        router.rescueERC20(address(usdt), treasury, 5e6);
        assertEq(usdt.balanceOf(treasury), 5e6);
    }

    function test_RegistryAdministrationIsOwnerOnly() public {
        vm.startPrank(user);
        vm.expectRevert(OwnerNotOwner.selector);
        router.setGlobalFeeBps(1);
        vm.expectRevert(OwnerNotOwner.selector);
        router.setRouterActive(V2_ID, false);
        vm.expectRevert(OwnerNotOwner.selector);
        router.setBridgeProxyExecutionEnabled(0, true);
        vm.expectRevert(OwnerNotOwner.selector);
        router.pause();
        vm.stopPrank();
    }

    function test_DeactivateMutateEarlyReactivateRejected() public {
        router.setRegistryActivationDelay(1 days);
        vm.warp(block.timestamp + 1 days);
        router.setRouterActive(V2_ID, true);

        router.setRouterActive(V2_ID, false);
        router.updateRouterWrappedNative(V2_ID, address(wnative));
        vm.expectRevert(ActivationDelay.selector);
        router.setRouterActive(V2_ID, true);

        vm.warp(router.routerActivationTime(V2_ID));
        router.setRouterActive(V2_ID, true);
    }

    function test_NoBridgeProxyExecutionSelectorExists() public {
        // bridgeWithFee / bridgeBot were removed from the mainnet candidate.
        (bool ok1,) = address(router).call(
            abi.encodeWithSignature("bridgeWithFee(uint256,address,uint256)", 0, address(usdt), 1)
        );
        (bool ok2,) = address(router).call(
            abi.encodeWithSignature(
                "bridgeBot(uint256,address,uint256,address,bool,uint256,uint256)",
                0, address(usdt), 1, user, false, 0, 0
            )
        );
        assertFalse(ok1);
        assertFalse(ok2);
    }

    function test_FeeStaysBoundedByAbsoluteCeiling() public {
        vm.expectRevert(ExceedsAbsoluteMax10.selector);
        router.setMaxFeeBps(1001);
    }
}
