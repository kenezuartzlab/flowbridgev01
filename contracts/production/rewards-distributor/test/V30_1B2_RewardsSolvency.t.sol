// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlowRewardsMerkleDistributor} from "../FlowRewardsMerkleDistributor.sol";

contract MockFlow is IERC20 {
    string public name = "Flow";
    string public symbol = "FLOW";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) public {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// Token that re-enters claim() on transfer.
contract ReentrantFlow is MockFlow {
    FlowRewardsMerkleDistributor public target;
    uint256 public epochId;
    uint256 public index;
    address public account;
    uint256 public amount;
    bytes32[] public proof;
    bool private entered;

    function arm(
        FlowRewardsMerkleDistributor target_,
        uint256 epochId_,
        uint256 index_,
        address account_,
        uint256 amount_,
        bytes32[] memory proof_
    ) external {
        target = target_;
        epochId = epochId_;
        index = index_;
        account = account_;
        amount = amount_;
        proof = proof_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (address(target) != address(0) && !entered) {
            entered = true;
            target.claim(epochId, index, account, amount, proof);
        }
        return super.transfer(to, value);
    }
}

contract V30_1B2_RewardsSolvency is Test {
    MockFlow internal flow;
    FlowRewardsMerkleDistributor internal dist;

    address internal admin = address(0xA11CE);
    address internal manager = address(0xB0B);
    address internal publisher = address(0xC0DE);
    address internal pauser = address(0xDEAD1);
    address internal treasury = address(0xFEE1);

    address internal alice = address(0x1111);
    address internal bob = address(0x2222);

    uint64 internal constant DELAY = 6 hours;

    function setUp() public {
        flow = new MockFlow();
        dist = new FlowRewardsMerkleDistributor(
            address(flow),
            admin,
            manager,
            publisher,
            pauser,
            treasury,
            DELAY
        );
        vm.prank(manager);
        dist.setCampaignBudget(1_000_000 ether);
        flow.mint(address(dist), 100 ether);
        vm.warp(1_700_000_000);
    }

    // ------------------------------------------------------------- helpers

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// Two-leaf manifest: alice at index 0, bob at index 1.
    function _tree(
        uint256 epochId,
        uint256 amountA,
        uint256 amountB
    ) internal view returns (bytes32 root, bytes32 leafA, bytes32 leafB) {
        leafA = dist.leafHash(epochId, 0, alice, amountA);
        leafB = dist.leafHash(epochId, 1, bob, amountB);
        root = _hashPair(leafA, leafB);
    }

    function _proof(bytes32 sibling) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](1);
        p[0] = sibling;
    }

    function _publish(uint256 epochId, uint256 amountA, uint256 amountB)
        internal
        returns (bytes32 leafA, bytes32 leafB)
    {
        bytes32 root;
        (root, leafA, leafB) = _tree(epochId, amountA, amountB);
        vm.prank(publisher);
        dist.publishEpoch(root, amountA + amountB, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
    }

    // ------------------------------------------------ solvency / accounting

    function test_ConcurrentEpochsCannotOverbookFunding() public {
        (bytes32 root1,,) = _tree(1, 30 ether, 30 ether);
        (bytes32 root2,,) = _tree(2, 30 ether, 30 ether);
        vm.prank(publisher);
        dist.publishEpoch(root1, 60 ether, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        assertEq(dist.totalReserved(), 60 ether);
        vm.prank(publisher);
        vm.expectRevert(FlowRewardsMerkleDistributor.InsufficientFunding.selector);
        dist.publishEpoch(root2, 60 ether, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        assertEq(dist.totalReserved(), 60 ether);
    }

    function test_PublisherCannotExceedBudget() public {
        vm.prank(manager);
        dist.setCampaignBudget(40 ether);
        (bytes32 root,,) = _tree(1, 25 ether, 25 ether);
        vm.prank(publisher);
        vm.expectRevert(FlowRewardsMerkleDistributor.BudgetExceeded.selector);
        dist.publishEpoch(root, 50 ether, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        assertEq(dist.epochCount(), 0);
    }

    function test_FullyReservedFundingLeavesNoRecoverableBalance() public {
        _publish(1, 50 ether, 50 ether);
        assertEq(dist.freeBalance(), 0);
        vm.prank(admin);
        vm.expectRevert(FlowRewardsMerkleDistributor.ExceedsFreeBalance.selector);
        dist.recoverFree(1);
    }

    function test_AdditionalFundingOnlyIncreasesFreeCapacity() public {
        _publish(1, 50 ether, 50 ether);
        flow.mint(address(dist), 10 ether);
        assertEq(dist.totalReserved(), 100 ether);
        assertEq(dist.freeBalance(), 10 ether);
        vm.prank(admin);
        dist.recoverFree(10 ether);
        assertEq(flow.balanceOf(treasury), 10 ether);
        assertEq(dist.freeBalance(), 0);
    }

    function test_AdminCannotRecoverReservedFunds() public {
        _publish(1, 50 ether, 50 ether);
        vm.prank(admin);
        vm.expectRevert(FlowRewardsMerkleDistributor.ExceedsFreeBalance.selector);
        dist.recoverFree(100 ether);
        assertEq(flow.balanceOf(address(dist)), 100 ether);
    }

    function test_ClaimReducesReservationAndPaysOnce() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        assertEq(flow.balanceOf(alice), 40 ether);
        assertEq(dist.totalClaimed(), 40 ether);
        assertEq(dist.totalReserved(), 60 ether);
        assertTrue(dist.isClaimed(1, 0));
        vm.expectRevert(FlowRewardsMerkleDistributor.AlreadyClaimed.selector);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
    }

    function test_CancelBeforeStartReleasesOnlyReserved() public {
        _publish(1, 50 ether, 50 ether);
        vm.prank(manager);
        dist.cancelEpoch(1);
        assertEq(dist.totalReserved(), 0);
        assertEq(dist.freeBalance(), 100 ether);
    }

    function test_CancelAfterClaimsStartedReverts() public {
        _publish(1, 50 ether, 50 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(manager);
        vm.expectRevert(FlowRewardsMerkleDistributor.ClaimsAlreadyStarted.selector);
        dist.cancelEpoch(1);
    }

    function test_ExpiryReleasesOnlyUnclaimedRemainder() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        vm.warp(block.timestamp + 31 days);
        vm.prank(manager);
        dist.releaseExpiredEpoch(1);
        assertEq(dist.totalReserved(), 0);
        assertEq(dist.totalClaimed(), 40 ether);
        assertEq(dist.freeBalance(), 60 ether);
    }

    function test_PublishDelayIsEnforced() public {
        (bytes32 root,,) = _tree(1, 10 ether, 10 ether);
        vm.prank(publisher);
        vm.expectRevert(FlowRewardsMerkleDistributor.PublishDelayTooShort.selector);
        dist.publishEpoch(root, 20 ether, uint64(block.timestamp + 1 hours), uint64(block.timestamp + 30 days));
    }

    // ---------------------------------------------------------- claim security

    function test_WrongAmountAndWrongAccountRejected() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(FlowRewardsMerkleDistributor.InvalidProof.selector);
        dist.claim(1, 0, alice, 41 ether, _proof(leafB));
        vm.expectRevert(FlowRewardsMerkleDistributor.InvalidProof.selector);
        dist.claim(1, 0, bob, 40 ether, _proof(leafB));
    }

    function test_TamperedProofAndWrongEpochRejected() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        flow.mint(address(dist), 2 ether);
        _publish(2, 1 ether, 1 ether);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(FlowRewardsMerkleDistributor.InvalidProof.selector);
        dist.claim(1, 0, alice, 40 ether, _proof(keccak256("tampered")));
        vm.expectRevert(FlowRewardsMerkleDistributor.InvalidProof.selector);
        dist.claim(2, 0, alice, 40 ether, _proof(leafB));
        vm.expectRevert(FlowRewardsMerkleDistributor.UnknownEpoch.selector);
        dist.claim(9, 0, alice, 40 ether, _proof(leafB));
    }

    function test_ForeignChainLeafRejected() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        bytes32 foreign = keccak256(
            bytes.concat(keccak256(abi.encode(uint256(1), address(dist), uint256(1), uint256(0), alice, 40 ether)))
        );
        assertTrue(foreign != dist.leafHash(1, 0, alice, 40 ether));
        vm.expectRevert(FlowRewardsMerkleDistributor.InvalidProof.selector);
        dist.claim(1, 0, alice, 40 ether, _proof(foreign));
        // Sanity: the canonical leaf still works.
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
    }

    function test_ThirdPartySubmitterCannotRedirectPayout() public {
        (bytes32 leafA,) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(address(0xBADD));
        dist.claim(1, 1, bob, 60 ether, _proof(leafA));
        assertEq(flow.balanceOf(bob), 60 ether);
        assertEq(flow.balanceOf(address(0xBADD)), 0);
    }

    function test_ClaimOutsideWindowReverts() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.expectRevert(FlowRewardsMerkleDistributor.ClaimWindowNotOpen.selector);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert(FlowRewardsMerkleDistributor.ClaimWindowClosed.selector);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
    }

    function test_ReentrantTokenCannotDoubleClaim() public {
        ReentrantFlow evil = new ReentrantFlow();
        FlowRewardsMerkleDistributor d = new FlowRewardsMerkleDistributor(
            address(evil), admin, manager, publisher, pauser, treasury, DELAY
        );
        vm.prank(manager);
        d.setCampaignBudget(1_000 ether);
        evil.mint(address(d), 100 ether);

        bytes32 leafA = d.leafHash(1, 0, alice, 40 ether);
        bytes32 leafB = d.leafHash(1, 1, bob, 60 ether);
        bytes32 root = _hashPair(leafA, leafB);
        vm.prank(publisher);
        d.publishEpoch(root, 100 ether, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        vm.warp(block.timestamp + DELAY);
        evil.arm(d, 1, 0, alice, 40 ether, _proof(leafB));

        vm.expectRevert(); // ReentrancyGuardReentrantCall bubbles up through transfer
        d.claim(1, 0, alice, 40 ether, _proof(leafB));
        assertEq(d.totalClaimed(), 0);
        assertEq(d.totalReserved(), 100 ether);
    }

    function test_PauseBlocksClaimsAndCreatesNoTheftPath() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        vm.warp(block.timestamp + DELAY);
        vm.prank(pauser);
        dist.pause();
        vm.expectRevert();
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        vm.prank(admin);
        vm.expectRevert(FlowRewardsMerkleDistributor.ExceedsFreeBalance.selector);
        dist.recoverFree(1);
        vm.prank(admin);
        dist.unpause();
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        assertEq(flow.balanceOf(alice), 40 ether);
    }

    // ------------------------------------------------ governance / adversarial

    function test_UnauthorizedRolesRevert() public {
        (bytes32 root,,) = _tree(1, 10 ether, 10 ether);
        vm.expectRevert();
        dist.publishEpoch(root, 20 ether, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        vm.prank(publisher);
        vm.expectRevert();
        dist.setCampaignBudget(2_000 ether);
        vm.prank(manager);
        vm.expectRevert();
        dist.recoverFree(1);
        vm.prank(publisher);
        vm.expectRevert();
        dist.pause();
        vm.prank(manager);
        vm.expectRevert();
        dist.setMinPublishDelay(2 hours);
        vm.prank(publisher);
        vm.expectRevert();
        dist.setRecoveryRecipient(address(0x99));
    }

    function test_RoleRotationPreservesLiveObligations() public {
        (, bytes32 leafB) = _publish(1, 40 ether, 60 ether);
        address newPublisher = address(0x7777);
        vm.startPrank(admin);
        dist.revokeRole(dist.PUBLISHER_ROLE(), publisher);
        dist.grantRole(dist.PUBLISHER_ROLE(), newPublisher);
        vm.stopPrank();
        vm.warp(block.timestamp + DELAY);
        dist.claim(1, 0, alice, 40 ether, _proof(leafB));
        assertEq(flow.balanceOf(alice), 40 ether);
        assertEq(dist.totalReserved(), 60 ether);
    }

    function test_BudgetCannotDropBelowCommitted() public {
        _publish(1, 50 ether, 50 ether);
        vm.prank(manager);
        vm.expectRevert(FlowRewardsMerkleDistributor.BudgetBelowCommitted.selector);
        dist.setCampaignBudget(99 ether);
    }

    function test_DelayBoundsEnforced() public {
        vm.prank(admin);
        vm.expectRevert(FlowRewardsMerkleDistributor.DelayOutOfRange.selector);
        dist.setMinPublishDelay(1 minutes);
        vm.prank(admin);
        vm.expectRevert(FlowRewardsMerkleDistributor.DelayOutOfRange.selector);
        dist.setMinPublishDelay(8 days);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_SolvencyInvariantHolds(uint96 fundingRaw, uint96 allocRaw) public {
        uint256 funding = (uint256(fundingRaw) % 400_000 ether) + 2;
        uint256 alloc = (uint256(allocRaw) % 400_000 ether) + 2;
        flow.mint(address(dist), funding);
        uint256 balance = flow.balanceOf(address(dist));

        (bytes32 root, bytes32 leafA, bytes32 leafB) = _tree(1, alloc / 2, alloc - alloc / 2);
        vm.prank(publisher);
        if (alloc > balance) {
            vm.expectRevert(FlowRewardsMerkleDistributor.InsufficientFunding.selector);
            dist.publishEpoch(root, alloc, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
            assertEq(dist.totalReserved(), 0);
            return;
        }
        dist.publishEpoch(root, alloc, uint64(block.timestamp + DELAY), uint64(block.timestamp + 30 days));
        assertTrue(flow.balanceOf(address(dist)) >= dist.totalReserved());

        vm.warp(block.timestamp + DELAY);
        dist.claim(1, 0, alice, alloc / 2, _proof(leafB));
        assertEq(flow.balanceOf(alice), alloc / 2);
        assertTrue(flow.balanceOf(address(dist)) >= dist.totalReserved());
        assertEq(dist.totalClaimed() + dist.totalReserved(), alloc);
        assertTrue(leafA != leafB);
    }

    function testFuzz_RecoveryNeverTouchesReserved(uint96 extraRaw, uint96 requestRaw) public {
        uint256 extra = uint256(extraRaw);
        _publish(1, 50 ether, 50 ether);
        flow.mint(address(dist), extra);
        uint256 request = uint256(requestRaw) + 1;
        vm.prank(admin);
        if (request > extra) {
            vm.expectRevert(FlowRewardsMerkleDistributor.ExceedsFreeBalance.selector);
            dist.recoverFree(request);
        } else {
            dist.recoverFree(request);
        }
        assertTrue(flow.balanceOf(address(dist)) >= dist.totalReserved());
        assertEq(dist.totalReserved(), 100 ether);
    }
}

contract V30_1B2_LeafVector is Test {
    function test_PrintLeafVector() public {
        MockFlow flow = new MockFlow();
        FlowRewardsMerkleDistributor d = new FlowRewardsMerkleDistributor(
            address(flow), address(0xA11CE), address(0xB0B), address(0xC0DE), address(0xDEAD1), address(0xFEE1), 6 hours
        );
        console.log("chainid", block.chainid);
        console.log("distributor", address(d));
        console.logBytes32(d.leafHash(7, 3, address(0x1111), 1234 ether));
    }
}
