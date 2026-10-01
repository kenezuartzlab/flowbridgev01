// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FlowBridgeRouterV4.sol";
import "./FlowBridgeRouterV4.t.sol";
import "./V30_1B1_SizeSafe.t.sol";

/**
 * V3 router mock that walks an encoded multi-pool path and charges each pool's
 * fee tier (1% = 10000) on every hop, exactly like a real V3 pool chain would.
 * Modes allow simulating hostile downstream behaviour.
 */
contract MockV3MultiRouter is ISwapRouterV3 {
    enum Mode { Honest, PullLess, ShortPay, ReenterNativeIn, ReenterTokenOut, IgnoreMin }
    Mode public mode;
    FlowBridgeRouterV4 public flow;
    uint256 public hopsSeen;

    function setMode(Mode m) external { mode = m; }
    function setFlow(FlowBridgeRouterV4 f) external { flow = f; }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256) {
        revert("single not used");
    }

    function _quote(bytes calldata path, uint256 amountIn) public pure returns (uint256 out, uint256 hops) {
        out = amountIn;
        hops = (path.length - 20) / 23;
        for (uint256 i; i < hops; ++i) {
            uint24 f = uint24(bytes3(path[20 + i * 23:23 + i * 23]));
            out = out - (out * f) / 1_000_000;
        }
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 amountOut) {
        address tokenIn = address(bytes20(p.path[:20]));
        address tokenOut = address(bytes20(p.path[p.path.length - 20:]));
        uint256 pull = mode == Mode.PullLess ? p.amountIn - 1 : p.amountIn;
        IERC20(tokenIn).transferFrom(msg.sender, address(this), pull);
        (amountOut, hopsSeen) = _quote(p.path, p.amountIn);
        if (mode == Mode.ReenterNativeIn) {
            flow.swapNativeToTokenV3MultiSafe(0, tokenOut, p.path, 1, 0, p.recipient, block.timestamp, type(uint256).max);
        }
        if (mode == Mode.ReenterTokenOut) {
            flow.swapTokenToNativeV3MultiSafe(0, tokenIn, p.path, 1, 0, payable(p.recipient), block.timestamp, type(uint256).max);
        }
        if (mode != Mode.IgnoreMin && mode != Mode.ShortPay) require(amountOut >= p.amountOutMinimum, "Too little received");
        uint256 pay = mode == Mode.ShortPay ? amountOut / 2 : amountOut;
        IERC20(tokenOut).transfer(p.recipient, pay);
        // ShortPay lies about what it paid.
    }
}

contract RejectNative {
    receive() external payable { revert("no native"); }
}

/** Token whose transferFrom credits more than requested (rebasing / balance mismatch). */
contract RebasingToken is MockERC20 {
    constructor() MockERC20("Rebase", "RB", 18) {}
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _transfer(from, to, amount);
        balanceOf[to] += 1;
        return true;
    }
}

contract V31_NativeV3MultiTest is Test {
    event SwapActivity(address indexed sender, address indexed recipient, uint256 indexed routerId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 protocolFee);
    FlowBridgeRouterV4 internal router;
    MockERC20 internal usdt;
    MockERC20 internal flowT;
    MockWrappedNative internal wbot;
    MockV3MultiRouter internal v3;
    MockV2Router internal v2;
    MockV2Router internal caswap;
    MockV3Router internal v3simple;

    address internal user = address(0xA11CE);
    address internal treasury = address(0xFEE);
    uint256 internal V3_ID;
    uint256 internal V2_ID;
    uint256 internal CA_ID;
    uint256 internal V3S_ID;
    uint256 constant FEE_BPS = 30; // non-zero 0.30% protocol fee for every test

    function setUp() public {
        usdt = new MockERC20("USDT", "USDT", 18);
        flowT = new MockERC20("FLOW", "FLOW", 18);
        wbot = new MockWrappedNative();
        v3 = new MockV3MultiRouter();
        v2 = new MockV2Router();
        caswap = new MockV2Router();
        v3simple = new MockV3Router();
        router = new FlowBridgeRouterV4(address(this), treasury);
        V3_ID = router.registerRouter(address(v3), FlowBridgeRouterV4.RouterType.V3, address(wbot), "BDEX V3", "3");
        V2_ID = router.registerRouter(address(v2), FlowBridgeRouterV4.RouterType.V2, address(wbot), "BDEX V2", "2");
        CA_ID = router.registerRouter(address(caswap), FlowBridgeRouterV4.RouterType.V2, address(wbot), "CaSwap", "2");
        V3S_ID = router.registerRouter(address(v3simple), FlowBridgeRouterV4.RouterType.V3, address(wbot), "V3s", "3");
        v3.setFlow(router);
        router.setGlobalFeeBps(FEE_BPS);

        flowT.mint(address(v3), 1_000_000e18);
        usdt.mint(address(v3), 1_000_000e18);
        flowT.mint(user, 1_000_000e18);
        usdt.mint(user, 1_000_000e18);
        vm.deal(address(wbot), 0);
        // V3 router needs WBOT liquidity for native-out routes.
        vm.deal(address(this), 1_000 ether);
        wbot.deposit{value: 500 ether}();
        wbot.transfer(address(v3), 500 ether);
        vm.deal(user, 100 ether);

        for (uint256 i; i < 2; ++i) {
            MockV2Router rr = i == 0 ? v2 : caswap;
            usdt.mint(address(rr), 1_000_000e18);
            flowT.mint(address(rr), 1_000_000e18);
            wbot.mint(address(rr), 0);
            vm.deal(address(rr), 100 ether);
        }
        dai_seed();
    }

    function dai_seed() internal {
        usdt.mint(address(v3simple), 1_000_000e18);
        flowT.mint(address(v3simple), 1_000_000e18);
        vm.deal(address(this), 1_000 ether);
        wbot.deposit{value: 100 ether}();
        wbot.transfer(address(v3simple), 100 ether);
    }

    receive() external payable {}

    function _botToFlowPath() internal view returns (bytes memory) {
        return abi.encodePacked(address(wbot), uint24(3000), address(usdt), uint24(10000), address(flowT));
    }

    function _flowToBotPath() internal view returns (bytes memory) {
        return abi.encodePacked(address(flowT), uint24(10000), address(usdt), uint24(3000), address(wbot));
    }

    function _fee(uint256 amt) internal pure returns (uint256) { return (amt * FEE_BPS) / 10_000; }

    function _assertNoResidue() internal view {
        assertEq(address(router).balance, 0, "router BOT residue");
        assertEq(wbot.balanceOf(address(router)), 0, "router WBOT residue");
        assertEq(usdt.balanceOf(address(router)), 0, "router intermediate residue");
        assertEq(flowT.balanceOf(address(router)), 0, "router FLOW residue");
        assertEq(wbot.allowance(address(router), address(v3)), 0, "WBOT allowance");
        assertEq(usdt.allowance(address(router), address(v3)), 0, "intermediate allowance");
        assertEq(flowT.allowance(address(router), address(v3)), 0, "FLOW allowance");
    }

    // ------------------------------------------------------------------
    // Happy paths + fee once + residue + approvals
    // ------------------------------------------------------------------

    function test_NativeToToken_MultiPool_FeeOnce_NoResidue() public {
        uint256 amt = 1 ether;
        uint256 fee = _fee(amt);
        (uint256 expected,) = v3._quote(_botToFlowPath(), amt);
        uint256 tBefore = treasury.balance;
        uint256 userBotBefore = user.balance;

        vm.expectEmit(true, true, true, true, address(router));
        emit SwapActivity(user, user, V3_ID, address(0), address(flowT), amt, expected, fee);
        vm.prank(user);
        uint256 out = router.swapNativeToTokenV3MultiSafe{value: amt + fee}(
            V3_ID, address(flowT), _botToFlowPath(), amt, expected, user, block.timestamp + 60, fee
        );

        assertEq(out, expected);
        assertEq(flowT.balanceOf(user), 1_000_000e18 + expected);
        assertEq(treasury.balance - tBefore, fee, "treasury got exactly one fee");
        assertEq(userBotBefore - user.balance, amt + fee);
        assertEq(v3.hopsSeen(), 2, "two pools executed in one call");
        assertEq(usdt.balanceOf(user), 1_000_000e18, "no intermediate returned to user");
        _assertNoResidue();
    }

    function test_TokenToNative_MultiPool_FeeOnce_NoResidue() public {
        uint256 amt = 100e18;
        uint256 fee = _fee(amt);
        (uint256 expected,) = v3._quote(_flowToBotPath(), amt);
        uint256 botBefore = user.balance;

        vm.startPrank(user);
        flowT.approve(address(router), amt + fee);
        vm.recordLogs();
        uint256 out = router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), amt, expected, payable(user), block.timestamp + 60, fee
        );
        vm.stopPrank();

        assertEq(out, expected);
        assertEq(user.balance - botBefore, expected);
        assertEq(flowT.balanceOf(treasury), fee, "treasury got exactly one fee in input token");
        assertEq(usdt.balanceOf(treasury), 0, "no intermediate fee");
        assertEq(wbot.balanceOf(treasury), 0, "no output-side fee");
        assertEq(v3.hopsSeen(), 2);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 acts;
        bytes32 sig = keccak256("SwapActivity(address,address,uint256,address,address,uint256,uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == sig) {
                ++acts;
                (address ti, address to_, uint256 ai, uint256 ao, uint256 pf) =
                    abi.decode(logs[i].data, (address, address, uint256, uint256, uint256));
                assertEq(ti, address(flowT)); assertEq(to_, address(0));
                assertEq(ai, amt); assertEq(ao, expected); assertEq(pf, fee);
            }
        }
        assertEq(acts, 1, "exactly one SwapActivity");
        assertEq(flowT.allowance(user, address(router)), 0, "user approval exact and consumed");
        _assertNoResidue();
    }

    function test_FeeOnce_ThreePoolPath() public {
        bytes memory p = abi.encodePacked(
            address(wbot), uint24(500), address(usdt), uint24(3000), address(flowT)
        );
        // extend to three pools: WBOT -> USDT -> WBOT2 not allowed; use FLOW -> USDT -> FLOW? use distinct mock token
        MockERC20 ca = new MockERC20("CA", "CA", 18);
        ca.mint(address(v3), 1_000_000e18);
        p = abi.encodePacked(p, uint24(10000), address(ca));
        uint256 amt = 2 ether;
        uint256 fee = _fee(amt);
        vm.prank(user);
        router.swapNativeToTokenV3MultiSafe{value: amt + fee}(V3_ID, address(ca), p, amt, 0, user, block.timestamp, fee);
        assertEq(v3.hopsSeen(), 3);
        assertEq(treasury.balance, fee, "three pools, one FlowBridge fee");
        _assertNoResidue();
    }

    function test_AtomicVsStaged_NoDoubleCharge() public {
        // Atomic route charges exactly one fee on the original input...
        uint256 amt = 1 ether;
        uint256 fee = _fee(amt);
        vm.prank(user);
        router.swapNativeToTokenV3MultiSafe{value: amt + fee}(
            V3_ID, address(flowT), _botToFlowPath(), amt, 0, user, block.timestamp, fee
        );
        assertEq(treasury.balance, fee);
        assertEq(usdt.balanceOf(treasury), 0);
        assertEq(flowT.balanceOf(treasury), 0);
    }

    // ------------------------------------------------------------------
    // Fee protections
    // ------------------------------------------------------------------

    function test_FeeChangedAfterQuote_Reverts() public {
        uint256 amt = 1 ether;
        uint256 quotedFee = _fee(amt);
        router.setGlobalFeeBps(60);
        vm.prank(user);
        vm.expectRevert(ProtocolFeeChanged.selector);
        router.swapNativeToTokenV3MultiSafe{value: amt + quotedFee}(
            V3_ID, address(flowT), _botToFlowPath(), amt, 0, user, block.timestamp, quotedFee
        );
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(ProtocolFeeChanged.selector);
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, 0, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
    }

    function test_FeeAboveUserMax_Reverts() public {
        vm.prank(user);
        vm.expectRevert(ProtocolFeeChanged.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + _fee(1 ether)}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, _fee(1 ether) - 1
        );
    }

    function test_WrongMsgValue_Reverts() public {
        uint256 fee = _fee(1 ether);
        vm.startPrank(user);
        vm.expectRevert(IncorrectMsgValue.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, fee
        );
        vm.expectRevert(IncorrectMsgValue.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee + 1}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, fee
        );
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Input validation
    // ------------------------------------------------------------------

    function test_ZeroAmount_Reverts() public {
        vm.startPrank(user);
        vm.expectRevert(ZeroAmount.selector);
        router.swapNativeToTokenV3MultiSafe(V3_ID, address(flowT), _botToFlowPath(), 0, 0, user, block.timestamp, 0);
        vm.expectRevert(ZeroAmount.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), _flowToBotPath(), 0, 0, payable(user), block.timestamp, 0);
        vm.stopPrank();
    }

    function test_ZeroRecipient_Reverts() public {
        vm.startPrank(user);
        vm.expectRevert(InvalidRecipient.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), _botToFlowPath(), 1, 0, address(0), block.timestamp, 0);
        vm.expectRevert(InvalidRecipient.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), _flowToBotPath(), 1, 0, payable(address(0)), block.timestamp, 0);
        vm.stopPrank();
    }

    function test_ZeroTokens_Revert() public {
        vm.startPrank(user);
        vm.expectRevert(InvalidTokenout.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(0), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.expectRevert(InvalidTokenin.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(0), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
        vm.stopPrank();
    }

    function test_StaleDeadline_Reverts() public {
        vm.warp(1000);
        vm.startPrank(user);
        vm.expectRevert(DeadlinePassed.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), _botToFlowPath(), 1, 0, user, 999, 0);
        vm.expectRevert(DeadlinePassed.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), _flowToBotPath(), 1, 0, payable(user), 999, 0);
        vm.stopPrank();
    }

    function test_MalformedPath_Reverts() public {
        bytes memory shortP = abi.encodePacked(address(wbot), uint24(3000));
        bytes memory badLen = abi.encodePacked(_botToFlowPath(), uint8(1));
        vm.startPrank(user);
        vm.expectRevert(V3PathTooShort.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), shortP, 1, 0, user, block.timestamp, 0);
        vm.expectRevert(MalformedV3Path.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), badLen, 1, 0, user, block.timestamp, 0);
        vm.stopPrank();
    }

    function test_NativeIn_PathMustStartWithWBOT() public {
        bytes memory p = abi.encodePacked(address(usdt), uint24(10000), address(flowT));
        vm.prank(user);
        vm.expectRevert(PathMustStartWrappedNative.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), p, 1, 0, user, block.timestamp, 0);
    }

    function test_NativeOut_PathMustEndWithWBOT() public {
        bytes memory p = abi.encodePacked(address(flowT), uint24(10000), address(usdt));
        vm.prank(user);
        vm.expectRevert(PathMustEndWrappedNative.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), p, 1, 0, payable(user), block.timestamp, 0);
    }

    function test_WrongDeclaredTokens_Revert() public {
        vm.startPrank(user);
        vm.expectRevert(V3OutputMismatch.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(usdt), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.expectRevert(V3InputMismatch.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(usdt), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
        vm.expectRevert(IdenticalTokens.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(wbot), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.expectRevert(IdenticalTokens.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(wbot), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
        vm.stopPrank();
    }

    function test_UnregisteredOrDisabledRouter_Reverts() public {
        vm.prank(user);
        vm.expectRevert(RouterNotFound.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(99, address(flowT), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        router.setRouterActive(V3_ID, false);
        vm.prank(user);
        vm.expectRevert(RouterInactive.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.prank(user);
        vm.expectRevert(RouterInactive.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
    }

    function test_WrongRouterType_Reverts() public {
        vm.startPrank(user);
        vm.expectRevert(NotV3.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V2_ID, address(flowT), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.expectRevert(NotV3.selector);
        router.swapTokenToNativeV3MultiSafe(V2_ID, address(flowT), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Slippage + revert atomicity
    // ------------------------------------------------------------------

    function test_AmountOutMinimum_Reverts_StateUnchanged() public {
        (uint256 expected,) = v3._quote(_botToFlowPath(), 1 ether);
        uint256 fee = _fee(1 ether);
        uint256 bal = user.balance;
        vm.prank(user);
        vm.expectRevert(bytes("Too little received"));
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, expected + 1, user, block.timestamp, fee
        );
        assertEq(user.balance, bal);
        assertEq(treasury.balance, 0, "fee reverted with the trade");
        _assertNoResidue();

        (uint256 exp2,) = v3._quote(_flowToBotPath(), 100e18);
        vm.startPrank(user);
        flowT.approve(address(router), 100e18 + _fee(100e18));
        vm.expectRevert(bytes("Too little received"));
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, exp2 + 1, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        assertEq(flowT.balanceOf(user), 1_000_000e18);
        assertEq(flowT.allowance(user, address(router)), 100e18 + _fee(100e18), "user approval restored on revert");
        _assertNoResidue();
    }

    function test_RouterIgnoringMin_StillEnforcedByFlowBridge() public {
        v3.setMode(MockV3MultiRouter.Mode.ShortPay);
        (uint256 expected,) = v3._quote(_botToFlowPath(), 1 ether);
        uint256 fee = _fee(1 ether);
        vm.prank(user);
        vm.expectRevert(InsufficientOutput.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, expected, user, block.timestamp, fee
        );
        (uint256 e2,) = v3._quote(_flowToBotPath(), 100e18);
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(InsufficientOutput.selector);
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, e2, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        _assertNoResidue();
    }

    // ------------------------------------------------------------------
    // Hostile tokens / routers
    // ------------------------------------------------------------------

    function test_FeeOnTransferInput_Reverts() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        fot.mint(user, 1000e18);
        bytes memory p = abi.encodePacked(address(fot), uint24(3000), address(usdt), uint24(3000), address(wbot));
        vm.startPrank(user);
        fot.approve(address(router), type(uint256).max);
        vm.expectRevert(UnsupportedTransferToken.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(fot), p, 100e18, 0, payable(user), block.timestamp, type(uint256).max);
        vm.stopPrank();
    }

    function test_RebasingInput_Reverts() public {
        RebasingToken rb = new RebasingToken();
        rb.mint(user, 1000e18);
        bytes memory p = abi.encodePacked(address(rb), uint24(3000), address(usdt), uint24(3000), address(wbot));
        vm.startPrank(user);
        rb.approve(address(router), type(uint256).max);
        vm.expectRevert(UnsupportedTransferToken.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(rb), p, 100e18, 0, payable(user), block.timestamp, type(uint256).max);
        vm.stopPrank();
    }

    function test_MaliciousRouterPullingLess_RevertsResidual() public {
        v3.setMode(MockV3MultiRouter.Mode.PullLess);
        uint256 fee = _fee(1 ether);
        vm.prank(user);
        vm.expectRevert(ResidualBalance.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, fee
        );
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(ResidualBalance.selector);
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, 0, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
    }

    function test_Reentrancy_Blocked() public {
        v3.setMode(MockV3MultiRouter.Mode.ReenterNativeIn);
        uint256 fee = _fee(1 ether);
        vm.prank(user);
        vm.expectRevert(Reentrant.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, fee
        );
        v3.setMode(MockV3MultiRouter.Mode.ReenterTokenOut);
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(Reentrant.selector);
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, 0, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
    }

    function test_FailedBotDelivery_RevertsEverything() public {
        RejectNative bad = new RejectNative();
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(NativeDeliveryFailed.selector);
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, 0, payable(address(bad)), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        assertEq(flowT.balanceOf(user), 1_000_000e18);
        assertEq(flowT.balanceOf(treasury), 0);
        _assertNoResidue();
    }

    function test_Paused_Reverts() public {
        router.pause();
        vm.startPrank(user);
        vm.expectRevert(ContractPaused.selector);
        router.swapNativeToTokenV3MultiSafe{value: 1}(V3_ID, address(flowT), _botToFlowPath(), 1, 0, user, block.timestamp, 0);
        vm.expectRevert(ContractPaused.selector);
        router.swapTokenToNativeV3MultiSafe(V3_ID, address(flowT), _flowToBotPath(), 1, 0, payable(user), block.timestamp, 0);
        vm.stopPrank();
    }

    function test_UnauthorizedAdministration_Reverts() public {
        vm.startPrank(user);
        vm.expectRevert(OwnerNotOwner.selector);
        router.setGlobalFeeBps(1);
        vm.expectRevert(OwnerNotOwner.selector);
        router.registerRouter(address(v3), FlowBridgeRouterV4.RouterType.V3, address(wbot), "x", "1");
        vm.expectRevert(OwnerNotOwner.selector);
        router.setRouterActive(V3_ID, false);
        vm.expectRevert(OwnerNotOwner.selector);
        router.updateRouterWrappedNative(V3_ID, address(usdt));
        vm.expectRevert(OwnerNotOwner.selector);
        router.pause();
        vm.expectRevert(OwnerNotOwner.selector);
        router.rescueERC20(address(wbot), user, 1);
        vm.expectRevert(OwnerNotOwner.selector);
        router.rescueNative(payable(user), 1);
        vm.stopPrank();
    }

    function test_ForcedBalancesNotUsableByCallers() public {
        // Someone force-sends WBOT and BOT into the router.
        wbot.deposit{value: 5 ether}();
        wbot.transfer(address(router), 5 ether);
        vm.deal(address(router), 3 ether);
        uint256 fee = _fee(1 ether);
        vm.prank(user);
        router.swapNativeToTokenV3MultiSafe{value: 1 ether + fee}(
            V3_ID, address(flowT), _botToFlowPath(), 1 ether, 0, user, block.timestamp, fee
        );
        assertEq(wbot.balanceOf(address(router)), 5 ether, "forced WBOT untouched");
        assertEq(address(router).balance, 3 ether, "forced BOT untouched");
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        (uint256 e2,) = v3._quote(_flowToBotPath(), 100e18);
        uint256 b = user.balance;
        router.swapTokenToNativeV3MultiSafe(
            V3_ID, address(flowT), _flowToBotPath(), 100e18, 0, payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        assertEq(user.balance - b, e2, "user receives only their own output");
        assertEq(wbot.balanceOf(address(router)), 5 ether);
        assertEq(address(router).balance, 3 ether);
        // Only owner can rescue.
        router.rescueERC20(address(wbot), address(this), 5 ether);
        assertEq(wbot.balanceOf(address(router)), 0);
    }

    // ------------------------------------------------------------------
    // Approval-clearing regression for existing Safe functions
    // ------------------------------------------------------------------

    function test_Regression_V3MultiSafe_ClearsAllowance_NoResidue() public {
        bytes memory p = abi.encodePacked(address(flowT), uint24(10000), address(usdt), uint24(3000), address(wbot));
        vm.startPrank(user);
        flowT.approve(address(router), 100e18 + _fee(100e18));
        router.swapV3MultiSafe(V3_ID, address(flowT), address(wbot), p, 100e18, 0, user, block.timestamp, _fee(100e18));
        vm.stopPrank();
        assertEq(flowT.balanceOf(treasury), _fee(100e18));
        _assertNoResidue();
    }

    function test_Regression_V3MultiSafe_FailureRevertsAllowance() public {
        bytes memory p = abi.encodePacked(address(flowT), uint24(10000), address(usdt));
        vm.startPrank(user);
        flowT.approve(address(router), type(uint256).max);
        vm.expectRevert(bytes("Too little received"));
        router.swapV3MultiSafe(V3_ID, address(flowT), address(usdt), p, 100e18, 100e18, user, block.timestamp, type(uint256).max);
        vm.stopPrank();
        _assertNoResidue();
    }

    function _p(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function test_Regression_MultiHopSafe_ClearsEveryHopAllowance() public {
        FlowBridgeRouterV4.HopParams[] memory hops = new FlowBridgeRouterV4.HopParams[](2);
        hops[0] = FlowBridgeRouterV4.HopParams(V2_ID, _p(address(flowT), address(usdt)), 0);
        hops[1] = FlowBridgeRouterV4.HopParams(CA_ID, _p(address(usdt), address(flowT)), 0);
        // use a distinct final token to avoid identical endpoints in hop 2's check of lastToken
        MockERC20 ca = new MockERC20("CA", "CA", 18);
        ca.mint(address(caswap), 1_000_000e18);
        hops[1] = FlowBridgeRouterV4.HopParams(CA_ID, _p(address(usdt), address(ca)), 0);
        vm.startPrank(user);
        flowT.approve(address(router), 100e18 + _fee(100e18));
        router.swapMultiHopSafe(hops, 100e18, user, block.timestamp, _fee(100e18));
        vm.stopPrank();
        assertEq(flowT.allowance(address(router), address(v2)), 0);
        assertEq(usdt.allowance(address(router), address(caswap)), 0, "intermediate allowance cleared");
        assertEq(usdt.balanceOf(address(router)), 0, "intermediate residue");
        assertEq(flowT.balanceOf(address(router)), 0);
        assertEq(flowT.balanceOf(treasury), _fee(100e18), "fee once across two routers");
        assertEq(ca.balanceOf(user), 100e18);
    }

    function test_Regression_TokenToNativeSafe_V3_ClearsAllowance() public {
        vm.startPrank(user);
        flowT.approve(address(router), 100e18 + _fee(100e18));
        router.swapTokenToNativeSafe(
            V3S_ID, address(flowT), 3000, 100e18, 0, new address[](0), payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        assertEq(flowT.allowance(address(router), address(v3simple)), 0);
        assertEq(flowT.balanceOf(address(router)), 0);
        assertEq(wbot.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function test_Regression_TokenToNativeSafe_V2_ClearsAllowance() public {
        vm.startPrank(user);
        flowT.approve(address(router), 100e18 + _fee(100e18));
        router.swapTokenToNativeSafe(
            V2_ID, address(flowT), 0, 100e18, 0, _p(address(flowT), address(wbot)), payable(user), block.timestamp, _fee(100e18)
        );
        vm.stopPrank();
        assertEq(flowT.allowance(address(router), address(v2)), 0);
        assertEq(flowT.balanceOf(address(router)), 0);
    }
}
