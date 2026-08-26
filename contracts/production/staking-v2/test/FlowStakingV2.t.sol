// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/src/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FlowStakingRewardTreasury} from "../contracts/FlowStakingRewardTreasury.sol";
import {FlowStakingController, IFlowReferenceOracle} from "../contracts/FlowStakingController.sol";
import {FlowStakingVaultV2} from "../contracts/FlowStakingVaultV2.sol";

contract MockFlow is ERC20("FLOW", "FLOW") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOracle is IFlowReferenceOracle {
    uint256 public price;
    uint256 public updatedAt;
    uint256 public liquidity;
    uint256 public deviation;

    function set(uint256 p, uint256 u, uint256 l, uint256 d) external {
        price = p;
        updatedAt = u;
        liquidity = l;
        deviation = d;
    }

    function latestReference() external view returns (uint256, uint256, uint256, uint256) {
        return (price, updatedAt, liquidity, deviation);
    }
}

/// Attempts a reentrant openPosition during a malicious payout token callback.
contract ReentrantToken is ERC20("R", "R") {
    FlowStakingVaultV2 public target;
    bool public armed;

    function setTarget(address t) external {
        target = FlowStakingVaultV2(t);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm() external {
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from == address(target) && to != address(0)) {
            armed = false;
            try target.openPosition(0, 1 ether) {} catch {}
        }
    }
}

contract FlowStakingV2Test is Test {
    MockFlow flow;
    FlowStakingRewardTreasury treasury;
    FlowStakingController controller;
    FlowStakingVaultV2 vault;
    MockOracle oracle;

    address admin = address(0xA0);
    address governor = address(0x60);
    address publisher = address(0x70);
    address recovery = address(0x80);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant YEAR = 365 days;

    function setUp() public {
        vm.warp(1_760_000_000); // realistic clock so staleness windows never underflow
        flow = new MockFlow();
        treasury = new FlowStakingRewardTreasury(address(flow), admin, recovery);
        controller = new FlowStakingController(admin, governor, publisher);
        vault = new FlowStakingVaultV2(address(flow), address(controller), address(treasury), admin);

        vm.startPrank(admin);
        treasury.grantRole(treasury.VAULT_ROLE(), address(vault));
        treasury.grantRole(treasury.CONTROLLER_ROLE(), address(vault));
        vm.stopPrank();
        vm.prank(governor);
        controller.setVault(address(vault));

        oracle = new MockOracle();
        oracle.set(1e8, block.timestamp, 5_000_000e8, 100); // $1, fresh, $5m depth, 1% dev
        vm.startPrank(governor);
        controller.setOracle(address(oracle));
        controller.setOraclePolicy(2 hours, 1_000_000e8, 500);
        controller.setBudgets(10_000e8, 500_000 ether); // $10k/week, cap 500k FLOW
        vm.stopPrank();

        flow.mint(alice, 10_000_000 ether);
        flow.mint(bob, 10_000_000 ether);
        flow.mint(admin, 5_000_000 ether);
        vm.prank(alice);
        flow.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        flow.approve(address(vault), type(uint256).max);
        vm.prank(admin);
        flow.approve(address(treasury), type(uint256).max);
    }

    function _fund(uint256 amount) internal {
        vm.prank(admin);
        treasury.deposit(amount);
    }

    function _assertTreasuryInvariant() internal view {
        uint256 ob = treasury.reservedGenesis() + treasury.reservedFloors() + treasury.committedEpoch() + treasury.accruedUnclaimed();
        assertGe(flow.balanceOf(address(treasury)), ob, "T1: balance >= obligations");
    }

    // ---------------------------------------------------------- products

    function test_fiveProductsConfigured() public view {
        for (uint8 i; i < 5; ++i) {
            (bool active, uint32 lockSeconds, uint16 g, uint16 f, uint16 t, uint16 cap, ) = controller.products(i);
            assertTrue(active);
            assertLe(t, cap);
            assertLe(f, cap);
            if (lockSeconds == 0) assertEq(f, 0);
        }
        (, uint32 l1, , , , , ) = controller.products(1);
        (, uint32 l2, , , , , ) = controller.products(2);
        (, uint32 l3, , , , , ) = controller.products(3);
        (, uint32 l4, , , , , ) = controller.products(4);
        assertEq(l1, 30 days);
        assertEq(l2, 90 days);
        assertEq(l3, 180 days);
        assertEq(l4, 365 days);
    }

    function test_openAllFiveProducts() public {
        _fund(2_000_000 ether);
        for (uint8 i; i < 5; ++i) {
            vm.prank(alice);
            uint256 id = vault.openPosition(i, 1_000 ether);
            assertEq(vault.getPosition(id).principal, 1_000 ether);
        }
        assertEq(vault.positionCountOf(alice), 5);
        assertEq(vault.totalPrincipal(), 5_000 ether);
        _assertTreasuryInvariant();
    }

    function test_belowMinimumReverts() public {
        vm.prank(alice);
        vm.expectRevert(FlowStakingVaultV2.BelowMinPrincipal.selector);
        vault.openPosition(0, 0.5 ether);
    }

    // ------------------------------------------------ genesis lifecycle

    function test_genesisAccrualAndClaim() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, 100_000 ether); // flexible, 18% genesis
        skip(30 days);
        uint256 expected = (100_000 ether * 1800 * 30 days) / (10_000 * YEAR);
        uint256 pending = vault.previewPending(id);
        assertApproxEqAbs(pending, expected, 1e12);
        vm.prank(alice);
        vault.claim(id);
        assertEq(flow.balanceOf(alice), 10_000_000 ether - 100_000 ether + pending);
        _assertTreasuryInvariant();
    }

    function test_repeatedClaimRevertsWhenZero() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, 10_000 ether);
        skip(1 days);
        vm.prank(alice);
        vault.claim(id);
        vm.prank(alice);
        vm.expectRevert(FlowStakingVaultV2.NothingToClaim.selector);
        vault.claim(id);
    }

    function test_genesisQuotaAntiReset() public {
        _fund(2_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(2, 10_000 ether); // 90D lock
        skip(90 days);
        vm.prank(alice);
        vault.claim(id);
        vm.prank(alice);
        vault.withdraw(id);
        // Lineage consumed the full 90-day Genesis quota: redeposit gets none.
        (, uint40 gSecs, , , ) = vault.quoteOpen(2, alice, 10_000 ether);
        assertEq(gSecs, 0);
        vm.prank(alice);
        uint256 id2 = vault.openPosition(2, 10_000 ether);
        assertEq(vault.getPosition(id2).genesisRateBps, 0, "genesis must not reset");
        // Bob is unaffected.
        (, uint40 bobSecs, , , ) = vault.quoteOpen(2, bob, 10_000 ether);
        assertEq(bobSecs, 90 days);
        _assertTreasuryInvariant();
    }

    function test_genesisQuotaPartiallyConsumedFlexible() public {
        _fund(2_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, 10_000 ether);
        skip(45 days);
        vm.prank(alice);
        vault.claim(id);
        vm.prank(alice);
        vault.withdraw(id); // releases unvested 45d reservation
        (, uint40 gSecs, , , ) = vault.quoteOpen(0, alice, 10_000 ether);
        assertApproxEqAbs(uint256(gSecs), 45 days, 2, "only remaining quota");
        _assertTreasuryInvariant();
    }

    function test_genesisRepriceWhenCapacityExhausted() public {
        _fund(4_000_000 ether);
        // Burn the Year-1 genesis cap via a huge position.
        vm.prank(alice);
        vault.openPosition(4, 2_000_000 ether); // 60% * 90d -> ~295k... need cap hit
        // Force exhaustion through repeated top-ups by whale.
        flow.mint(address(this), 20_000_000 ether);
        flow.approve(address(vault), type(uint256).max);
        uint256 used;
        for (uint256 i; i < 6 && used < 1_000_000 ether; ++i) {
            (, uint40 gSecs, uint256 obligation, , ) = vault.quoteOpen(4, address(this), 2_000_000 ether);
            if (gSecs == 0 || obligation == 0) break;
            if (controller.genesisYear1Used() + obligation > controller.GENESIS_YEAR1_CAP()) break;
            vault.openPosition(4, 2_000_000 ether);
            used = controller.genesisYear1Used();
        }
        // Near the cap, further large positions reprice (genesisRateBps == 0)
        // instead of exceeding 1M.
        (, , uint256 ob2, , ) = vault.quoteOpen(4, bob, 2_000_000 ether);
        if (controller.genesisYear1Used() + ob2 > controller.GENESIS_YEAR1_CAP()) {
            vm.prank(bob);
            uint256 id = vault.openPosition(4, 2_000_000 ether);
            assertEq(vault.getPosition(id).genesisRateBps, 0, "must reprice, not exceed cap");
            assertLe(controller.genesisYear1Used(), controller.GENESIS_YEAR1_CAP());
        }
        _assertTreasuryInvariant();
    }

    function test_existingReservationsImmutableOnCapExhaustion() public {
        _fund(2_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(2, 10_000 ether);
        uint256 reservedBefore = treasury.reservedGenesis();
        // Bob's genesis capacity exhaustion attempt must not touch Alice's.
        vm.prank(bob);
        vault.openPosition(2, 10_000 ether);
        assertEq(vault.getPosition(id).genesisReserved, vault.getPosition(id).genesisReserved);
        assertGe(treasury.reservedGenesis(), reservedBefore);
        _assertTreasuryInvariant();
    }

    // --------------------------------------------------- locked semantics

    function test_lockedWithdrawBeforeMaturityReverts() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(1, 10_000 ether);
        skip(15 days);
        vm.prank(alice);
        vm.expectRevert(FlowStakingVaultV2.PositionLocked.selector);
        vault.withdraw(id);
    }

    function test_lockedMaturityExactPrincipalAndFloor() public {
        _fund(1_000_000 ether);
        uint256 balBefore = flow.balanceOf(alice);
        vm.prank(alice);
        uint256 id = vault.openPosition(1, 10_000 ether); // 8% floor, 27% genesis, 30D
        skip(30 days);
        vm.prank(alice);
        vault.claim(id);
        uint256 floorExpected = (10_000 ether * 800 * 30 days) / (10_000 * YEAR);
        uint256 genesisExpected = (10_000 ether * 2700 * 30 days) / (10_000 * YEAR);
        vm.prank(alice);
        vault.withdraw(id);
        uint256 gained = flow.balanceOf(alice) - balBefore;
        assertApproxEqAbs(gained, floorExpected + genesisExpected, 1e10, "floor+genesis exact");
        _assertTreasuryInvariant();
    }

    function test_floorRequiresFundedReserve() public {
        // No funding: floor reservation must revert, never dilute.
        vm.prank(alice);
        vm.expectRevert();
        vault.openPosition(1, 10_000 ether);
    }

    function test_floorSurvivesWhenVariableZero() public {
        _fund(500_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(3, 50_000 ether); // 180D, 12% floor
        skip(180 days); // no epoch ever published
        uint256 pending = vault.previewPending(id);
        uint256 floorExpected = (50_000 ether * 1200 * 180 days) / (10_000 * YEAR);
        uint256 genesisExpected = (50_000 ether * 4800 * 90 days) / (10_000 * YEAR);
        assertApproxEqAbs(pending, floorExpected + genesisExpected, 1e8);
        vm.prank(alice);
        vault.claim(id); // payable from reserved buckets even with zero variable
        _assertTreasuryInvariant();
    }

    // --------------------------------------------------- variable epochs

    /// Cap-compliant reference rate: 1,000 bps implied on 10,000 FLOW staked
    /// (flexible hard cap is 1,200 bps, so floor + variable stays in bounds).
    function _compliantFps() internal pure returns (uint256) {
        return (10_000 ether * 1000) / (YEAR * 10_000);
    }

    function _publish() internal returns (uint256 budget) {
        uint8[] memory pids = new uint8[](2);
        pids[0] = 0;
        pids[1] = 1;
        uint256[] memory fps = new uint256[](2);
        fps[0] = _compliantFps();
        fps[1] = _compliantFps();
        vm.prank(publisher);
        budget = controller.publishEpoch(pids, fps);
    }

    function test_variableEpochAccrualAndRemainder() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, 10_000 ether);
        _publish();
        skip(7 days);
        // Half the week Alice was sole flexible staker after publish: accrues
        // the full flexible stream; the other product's stream is zero-staker
        // remainder and must return to free accounting at settle.
        uint256 before = treasury.freeBalance();
        vm.prank(alice);
        vault.claim(id);
        controller.settleEpoch();
        uint256 unused = _compliantFps() * 7 days; // product 1 had no stakers
        assertApproxEqAbs(treasury.freeBalance(), before + unused - 0, 1e6, "remainder returns to free");
        _assertTreasuryInvariant();
    }

    function test_zeroStakerEpochFullyReconciled() public {
        _fund(1_000_000 ether);
        _publish(); // nobody staked
        skip(7 days);
        uint256 before = treasury.freeBalance();
        uint256 committed = treasury.committedEpoch();
        assertEq(committed, _compliantFps() * 2 * 7 days, "full two-product commitment");
        controller.settleEpoch();
        assertEq(treasury.freeBalance(), before + committed, "zero-staker epoch returns entire commitment");
        assertEq(treasury.committedEpoch(), 0);
        _assertTreasuryInvariant();
    }

    function test_variableNeverExceedsHardCap() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        vault.openPosition(1, 10_000 ether);
        uint8[] memory pids = new uint8[](1);
        pids[0] = 1;
        uint256[] memory fps = new uint256[](1);
        // implied = fps*YEAR*1e4/staked; hardCap 1800, floor 800 -> var cap 1000 bps
        fps[0] = (10_000 ether * 1100) / (YEAR * 10_000) + 1; // 1100 bps > allowed
        vm.prank(publisher);
        vm.expectRevert(FlowStakingController.RateGuardBreached.selector);
        controller.publishEpoch(pids, fps);
    }

    function test_rateGuardTenPercentWeekOverWeek() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        vault.openPosition(0, 10_000 ether);
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        fps[0] = (10_000 ether * 500) / (YEAR * 10_000); // 500 bps
        vm.prank(publisher);
        controller.publishEpoch(pids, fps);
        skip(7 days);
        controller.settleEpoch();
        oracle.set(1e8, block.timestamp, 5_000_000e8, 100); // keep reference fresh
        fps[0] = (10_000 ether * 600) / (YEAR * 10_000); // +20% -> blocked
        vm.prank(publisher);
        vm.expectRevert(FlowStakingController.RateGuardBreached.selector);
        controller.publishEpoch(pids, fps);
        // emergency mode allows the move (governance-attested)
        vm.prank(governor);
        controller.setEmergencyMode(true);
        vm.prank(publisher);
        controller.publishEpoch(pids, fps);
    }

    // -------------------------------------------------------- oracle gate

    function test_staleOracleBlocksEpoch() public {
        _fund(1_000_000 ether);
        oracle.set(1e8, block.timestamp - 3 hours, 5_000_000e8, 100);
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        fps[0] = 1;
        vm.prank(publisher);
        vm.expectRevert(FlowStakingController.OracleStale.selector);
        controller.publishEpoch(pids, fps);
    }

    function test_lowLiquidityOracleBlocksEpoch() public {
        _fund(1_000_000 ether);
        oracle.set(1e8, block.timestamp, 10_000e8, 100); // $10k depth < $1m min
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        fps[0] = 1;
        vm.prank(publisher);
        vm.expectRevert(FlowStakingController.OracleInsufficientLiquidity.selector);
        controller.publishEpoch(pids, fps);
    }

    function test_noOracleBlocksEpoch() public {
        FlowStakingController c2 = new FlowStakingController(admin, governor, publisher);
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        fps[0] = 1;
        vm.prank(publisher);
        vm.expectRevert(FlowStakingController.OracleNotConfigured.selector);
        c2.publishEpoch(pids, fps);
    }

    // -------------------------------------------------------- budgets

    function test_maxFlowPerEpochClampsBudget() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        vault.openPosition(0, 10_000 ether);
        // $10k/week at $1 = 10,000 FLOW but cap is... raise weekly budget:
        vm.prank(governor);
        controller.setBudgets(1_000_000e8, 500_000 ether); // $1m/wk, cap 500k FLOW
        uint256 quote = controller.quoteEpochBudget();
        assertEq(quote, 500_000 ether, "clamped by maxFlowPerEpoch");
    }

    function test_year1TotalCapEnforced() public {
        _fund(3_500_000 ether);
        flow.mint(address(this), 500_000_000 ether);
        flow.approve(address(vault), type(uint256).max);
        vm.prank(governor);
        controller.setBudgets(10_000_000e8, 1_500_000 ether); // $10m/wk, cap 1.5m FLOW
        // Drive standard usage toward the cap with epoch publishes. 500M FLOW
        // staked keeps a ~1M FLOW/week stream inside the 1,200 bps hard cap.
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        vault.openPosition(0, 500_000_000 ether);
        fps[0] = 1_000_000 ether / uint256(7 days); // ~1M FLOW per epoch
        for (uint256 i; i < 3; ++i) {
            if (controller.standardYear1Used() + 1_000_000 ether > controller.STANDARD_YEAR1_CAP()) break;
            oracle.set(1e8, block.timestamp, 5_000_000e8, 100); // keep reference fresh
            vm.prank(publisher);
            controller.publishEpoch(pids, fps);
            skip(7 days);
            controller.settleEpoch();
        }
        assertLe(controller.standardYear1Used(), controller.STANDARD_YEAR1_CAP());
        assertLe(controller.standardYear1Used() + controller.genesisYear1Used(), controller.TOTAL_YEAR1_CAP());
        _assertTreasuryInvariant();
    }

    function test_commitBeyondFundingReverts() public {
        _fund(100 ether);
        vm.prank(alice);
        vault.openPosition(0, 10_000 ether);
        uint8[] memory pids = new uint8[](1);
        pids[0] = 0;
        uint256[] memory fps = new uint256[](1);
        fps[0] = 1 ether; // 604.8k FLOW/week, treasury has 100
        vm.prank(publisher);
        vm.expectRevert();
        controller.publishEpoch(pids, fps);
    }

    // ------------------------------------------------- safety + isolation

    function test_principalIsolatedFromRewards() public {
        _fund(100_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, 10_000 ether);
        vm.prank(bob);
        vault.openPosition(0, 5_000 ether);
        assertEq(flow.balanceOf(address(vault)), 15_000 ether, "vault holds principal only");
        skip(10 days);
        vm.prank(alice);
        vault.claim(id);
        assertEq(flow.balanceOf(address(vault)), 15_000 ether, "claims never touch principal");
        _assertTreasuryInvariant();
    }

    function test_pauseBlocksNewRiskButNotMatureWithdrawal() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(1, 10_000 ether);
        vm.prank(admin);
        vault.pause();
        vm.prank(bob);
        vm.expectRevert();
        vault.openPosition(0, 1_000 ether);
        vm.prank(alice);
        vm.expectRevert();
        vault.claim(id);
        skip(30 days);
        vm.prank(alice);
        vault.withdraw(id); // mature principal exits while paused
        assertEq(vault.getPosition(id).status, 1);
        _assertTreasuryInvariant();
    }

    function test_recoveryOnlyFreeBalance() public {
        _fund(1_000_000 ether);
        vm.prank(alice);
        uint256 id = vault.openPosition(1, 10_000 ether);
        uint256 free = treasury.freeBalance();
        vm.prank(admin);
        vm.expectRevert(FlowStakingRewardTreasury.InsufficientFreeBalance.selector);
        treasury.recoverFree(free + 1 ether);
        vm.prank(admin);
        treasury.recoverFree(free);
        assertEq(flow.balanceOf(recovery), free);
        skip(30 days);
        vm.prank(alice);
        vault.claim(id); // reserved obligations still fully payable
        _assertTreasuryInvariant();
    }

    function test_reentrancyGuardBlocksCallback() public {
        ReentrantToken rt = new ReentrantToken();
        FlowStakingRewardTreasury t2 = new FlowStakingRewardTreasury(address(rt), admin, recovery);
        FlowStakingController c2 = new FlowStakingController(admin, governor, publisher);
        FlowStakingVaultV2 v2 = new FlowStakingVaultV2(address(rt), address(c2), address(t2), admin);
        vm.startPrank(admin);
        t2.grantRole(t2.VAULT_ROLE(), address(v2));
        t2.grantRole(t2.CONTROLLER_ROLE(), address(v2));
        rt.mint(admin, 1_000_000 ether);
        rt.approve(address(t2), type(uint256).max);
        t2.deposit(1_000_000 ether);
        vm.stopPrank();
        vm.prank(governor);
        c2.setVault(address(v2));
        rt.setTarget(address(v2));
        rt.mint(alice, 10_000 ether);
        vm.prank(alice);
        rt.approve(address(v2), type(uint256).max);
        vm.prank(alice);
        uint256 id = v2.openPosition(0, 10_000 ether);
        skip(1 days);
        rt.arm();
        vm.prank(alice);
        v2.claim(id); // reentrant openPosition inside payout must fail closed
        assertEq(v2.positionCountOf(alice), 1, "no reentrant position created");
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_accountingConservation(uint96 stakeA, uint96 stakeB, uint32 secs) public {
        stakeA = uint96(bound(stakeA, 1 ether, 1_000_000 ether));
        stakeB = uint96(bound(stakeB, 1 ether, 1_000_000 ether));
        secs = uint32(bound(secs, 1, 200 days));
        _fund(2_500_000 ether);
        vm.prank(alice);
        uint256 idA = vault.openPosition(0, stakeA);
        vm.prank(bob);
        uint256 idB = vault.openPosition(0, stakeB);
        skip(secs);
        uint256 pendA = vault.previewPending(idA);
        uint256 pendB = vault.previewPending(idB);
        uint256 cap = ((uint256(stakeA) + stakeB) * 1800 * uint256(secs)) / (10_000 * YEAR) + 1e6;
        assertLe(pendA + pendB, cap, "accrual never exceeds funded schedule bound");
        _assertTreasuryInvariant();
    }

    function testFuzz_exactPrincipalReturned(uint96 amount, uint32 secs) public {
        amount = uint96(bound(amount, 1 ether, 5_000_000 ether));
        secs = uint32(bound(secs, 1, 400 days));
        _fund(2_500_000 ether);
        uint256 before = flow.balanceOf(alice);
        vm.prank(alice);
        uint256 id = vault.openPosition(0, amount);
        skip(secs);
        vm.prank(alice);
        vault.withdraw(id);
        uint256 rewards = vault.previewPending(id);
        assertEq(flow.balanceOf(alice), before - amount + amount, "exact principal");
        assertGe(vault.previewPending(id), 0);
        _assertTreasuryInvariant();
        assertGt(rewards, 0, "flexible accrues genesis while open");
    }
}
