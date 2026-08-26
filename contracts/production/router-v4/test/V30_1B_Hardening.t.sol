// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FlowBridgeRouterV4.sol";
import "../contracts/FlowBridgeRouterLens.sol";
import "./FlowBridgeRouterV4.t.sol";

contract V30_1B_HardeningTest is Test {
    FlowBridgeRouterV4 router;
    MockERC20 usdt;
    MockWrappedNative wnative;
    MockV2Router v2;
    MockBotBridgeGateway gateway;
    FlowBridgeRouterLens lens;

    address owner = address(this);
    address treasury = address(0xFEE);

    function setUp() public {
        usdt = new MockERC20("USDT", "USDT", 6);
        wnative = new MockWrappedNative();
        v2 = new MockV2Router();
        gateway = new MockBotBridgeGateway(address(usdt));
        router = new FlowBridgeRouterV4(owner, treasury);
        lens = new FlowBridgeRouterLens(address(router));
    }

    function _registerBridge() internal returns (uint256 id) {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt);
        bytes32[] memory rids = new bytes32[](1);
        rids[0] = keccak256("RID");
        id = router.registerBotBridge(address(gateway), "BOT", "BOT Chain", 677, tokens, rids, true);
    }

    // --- Activation delay re-arm ---

    function test_MutatingBridgeResourceRearmsActivationDelay() public {
        router.setRegistryActivationDelay(1 days);
        uint256 id = _registerBridge();
        vm.warp(block.timestamp + 1 days);
        router.setBridgeActive(id, true);

        router.setBridgeActive(id, false);
        router.setBridgeTokenResource(id, address(usdt), keccak256("RID2"));
        vm.expectRevert(bytes("Activation delay"));
        router.setBridgeActive(id, true);

        vm.warp(router.bridgeActivationTime(id));
        router.setBridgeActive(id, true);
    }

    function test_MutatingProxyExecutionRearmsActivationDelay() public {
        router.setRegistryActivationDelay(2 days);
        uint256 id = _registerBridge();
        vm.warp(block.timestamp + 2 days);
        router.setBridgeActive(id, true);
        router.setBridgeActive(id, false);
        router.setBridgeProxyExecutionEnabled(id, true);
        vm.expectRevert(bytes("Activation delay"));
        router.setBridgeActive(id, true);
    }

    function test_MutatingRouterWrappedNativeRearmsActivationDelay() public {
        router.setRegistryActivationDelay(1 days);
        uint256 rid = router.registerRouter(
            address(v2), FlowBridgeRouterV4.RouterType.V2, address(wnative), "V2", "1"
        );
        vm.warp(block.timestamp + 1 days);
        router.setRouterActive(rid, true);
        router.setRouterActive(rid, false);
        MockWrappedNative other = new MockWrappedNative();
        router.updateRouterWrappedNative(rid, address(other));
        vm.expectRevert(bytes("Activation delay"));
        router.setRouterActive(rid, true);
    }

    function test_LoweringDelayDoesNotAcceleratePendingActivation() public {
        router.setRegistryActivationDelay(7 days);
        uint256 id = _registerBridge();
        uint256 scheduled = router.bridgeActivationTime(id);
        router.setRegistryActivationDelay(0);
        assertEq(router.bridgeActivationTime(id), scheduled);
        vm.expectRevert(bytes("Activation delay"));
        router.setBridgeActive(id, true);
    }

    // --- Lens hardening ---

    function test_LensRejectsNonContractTarget() public {
        vm.expectRevert(FlowBridgeRouterLens.InvalidFlowRouter.selector);
        new FlowBridgeRouterLens(address(0xDEAD));
    }

    function test_LensExplicitNoRouteSignal() public {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(wnative);
        (bool found, uint256 bestId, uint256 out) = lens.findBestV2Rate(1e18, path);
        assertFalse(found);
        assertEq(bestId, 0);
        assertEq(out, 0);
    }

    function test_LensBoundedPagesAreEmptyOutOfRange() public {
        (uint256[] memory ids,,) = lens.getRoutersPage(5, 10);
        assertEq(ids.length, 0);
        (uint256[] memory bids,,,) = lens.getBridgesPage(0, 0);
        assertEq(bids.length, 0);
    }

    function test_LensPagesReflectRegistry() public {
        uint256 rid = router.registerRouter(
            address(v2), FlowBridgeRouterV4.RouterType.V2, address(wnative), "V2", "1"
        );
        router.setRouterActive(rid, true);
        (uint256[] memory ids, address[] memory addrs, bool[] memory actives) = lens.getRoutersPage(0, 10);
        assertEq(ids.length, 1);
        assertEq(addrs[0], address(v2));
        assertTrue(actives[0]);

        uint256 bid = _registerBridge();
        (uint256[] memory bids, address[] memory baddrs, uint256[] memory dest, bool[] memory bactives) =
            lens.getBridgesPage(0, 10);
        assertEq(bids.length, 1);
        assertEq(bids[0], bid);
        assertEq(baddrs[0], address(gateway));
        assertEq(dest[0], 677);
        assertTrue(bactives[0]);
    }
}
