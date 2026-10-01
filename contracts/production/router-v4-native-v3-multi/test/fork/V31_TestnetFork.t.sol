// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/FlowBridgeRouterV4.sol";

/// Local fork of BOT Mainnet 677 — nothing is broadcast.
contract V31_TestnetForkTest is Test {
    address constant WBOT = 0xD5452816194a3784dBa983426cCe7c122F4abd30;
    address constant USDT = 0x75edC9335175Fc0552D51D48439F229c10420fe3;
    address constant FLOW = 0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac;
    address constant CA = 0x546307af427902A75771434Df831d88219784E19;
    address constant BDEX_V3 = 0x07032d47A1b9f8460cBeE9dC17c1d3E438693929;
    address constant BDEX_V2 = 0x1414eD29FdFD322c3c0a830330ed982E2D629e76;
    address constant CASWAP = 0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD;
    address constant CA_WBOT = 0x68CAeA9104419203cF8b8f0B222E75709B97bfc6;

    FlowBridgeRouterV4 router;
    address treasury = address(0xFEE0);
    address user = address(0xA11CE5);
    uint256 V3_ID;

    function setUp() public {
        vm.createSelectFork(vm.envString("BOT_RPC"));
        router = new FlowBridgeRouterV4(address(this), treasury);
        V3_ID = router.registerRouter(BDEX_V3, FlowBridgeRouterV4.RouterType.V3, WBOT, "BDEX V3", "3");
        router.setGlobalFeeBps(1); // 0.01% (current production rate)
        vm.deal(user, 1 ether);
    }

    function _res() internal view {
        assertEq(address(router).balance, 0, "BOT residue");
        assertEq(IERC20(WBOT).balanceOf(address(router)), 0, "WBOT residue");
        assertEq(IERC20(USDT).balanceOf(address(router)), 0, "USDT residue");
        assertEq(IERC20(FLOW).balanceOf(address(router)), 0, "FLOW residue");
        assertEq(IERC20(WBOT).allowance(address(router), BDEX_V3), 0);
        assertEq(IERC20(FLOW).allowance(address(router), BDEX_V3), 0);
    }

    function test_Fork_BOT_USDT_FLOW_then_back() public {
        uint256 amt = 0.01 ether;
        (uint256 fee,) = router.computeRouterFee(V3_ID, amt, user);
        bytes memory p = abi.encodePacked(WBOT, uint24(3000), USDT, uint24(3000), FLOW);
        vm.prank(user);
        uint256 out = router.swapNativeToTokenV3MultiSafe{value: amt + fee}(
            V3_ID, FLOW, p, amt, 1, user, block.timestamp + 300, fee
        );
        console.log("BOT->FLOW fee wei", fee, "FLOW out", out);
        assertGt(out, 0);
        assertEq(treasury.balance, fee, "fee once");
        assertEq(IERC20(FLOW).balanceOf(user), out);
        _res();

        uint256 back = out / 2;
        (uint256 f2,) = router.computeRouterFee(V3_ID, back, user);
        bytes memory p2 = abi.encodePacked(FLOW, uint24(3000), USDT, uint24(3000), WBOT);
        uint256 b0 = user.balance;
        vm.startPrank(user);
        IERC20(FLOW).approve(address(router), back + f2);
        uint256 botOut = router.swapTokenToNativeV3MultiSafe(V3_ID, FLOW, p2, back, 1, payable(user), block.timestamp + 300, f2);
        vm.stopPrank();
        console.log("FLOW->BOT fee", f2, "BOT out wei", botOut);
        assertEq(user.balance - b0, botOut);
        assertEq(IERC20(FLOW).balanceOf(treasury), f2, "fee once");
        _res();
    }

}
