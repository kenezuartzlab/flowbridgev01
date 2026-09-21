// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FlowBridgeMultiSend} from "../FlowBridgeMultiSend.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Simple tax token used to prove exact-receipt protection rejects fee-on-transfer behavior.
contract TaxToken is ERC20 {
    constructor() ERC20("Tax Token", "TAX") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value >= 100) {
            uint256 tax = value / 100;
            super._update(from, address(0xdead), tax);
            super._update(from, to, value - tax);
        } else {
            super._update(from, to, value);
        }
    }
}

contract FlowBridgeMultiSendTest is Test {
    FlowBridgeMultiSend internal multi;
    MockToken internal token;
    TaxToken internal taxToken;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal batchId = keccak256("batch-1");

    function setUp() public {
        vm.prank(owner);
        multi = new FlowBridgeMultiSend(owner, treasury);
        token = new MockToken();
        taxToken = new TaxToken();
        token.mint(alice, 1_000_000 ether);
        taxToken.mint(alice, 1_000_000 ether);
        vm.deal(alice, 1_000 ether);
    }

    function test_DefaultFeeIsOneBasisPoint() public view {
        assertEq(multi.feeBps(), 1);
        assertEq(multi.quoteFee(10_000 ether), 1 ether);
    }

    function test_OwnerCanSetFeeToZero() public {
        vm.prank(owner);
        multi.setFeeBps(0);
        assertEq(multi.feeBps(), 0);
    }

    function test_FeeCannotExceedOnePercent() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidFeeBps.selector, 101));
        multi.setFeeBps(101);
    }

    function test_ConfigNonceChangesWithEconomicConfig() public {
        assertEq(multi.configNonce(), 0);
        vm.startPrank(owner);
        multi.setFeeBps(2);
        assertEq(multi.configNonce(), 1);
        multi.setFeeRecipient(makeAddr("newTreasury"));
        assertEq(multi.configNonce(), 2);
        multi.setMaxRecipients(80);
        assertEq(multi.configNonce(), 3);
        vm.stopPrank();
    }

    function test_NativeOneToManyDistributesAndChargesFee() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;

        uint256 fee = multi.quoteFee(300 ether);
        uint256 bobBefore = bob.balance;
        uint256 carolBefore = carol.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(alice);
        multi.sendNative{value: 300 ether + fee}(
            batchId, recipients, amounts, multi.feeBps(), multi.configNonce(), block.timestamp + 10 minutes
        );

        assertEq(bob.balance - bobBefore, 100 ether);
        assertEq(carol.balance - carolBefore, 200 ether);
        assertEq(treasury.balance - treasuryBefore, fee);
    }

    function test_EqualNativeDistribution() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256 total = 20 ether;
        uint256 fee = multi.quoteFee(total);

        vm.prank(alice);
        multi.sendNativeEqual{value: total + fee}(
            batchId, recipients, 10 ether, multi.feeBps(), multi.configNonce(), block.timestamp + 10 minutes
        );
        assertEq(bob.balance, 10 ether);
        assertEq(carol.balance, 10 ether);
    }

    function test_ERC20OneToManyDistributesAndChargesFee() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1_000 ether;
        amounts[1] = 2_000 ether;
        uint256 total = 3_000 ether;
        uint256 fee = multi.quoteFee(total);

        vm.startPrank(alice);
        token.approve(address(multi), total + fee);
        multi.sendToken(
            batchId,
            address(token),
            recipients,
            amounts,
            multi.feeBps(),
            multi.configNonce(),
            block.timestamp + 10 minutes
        );
        vm.stopPrank();

        assertEq(token.balanceOf(bob), 1_000 ether);
        assertEq(token.balanceOf(carol), 2_000 ether);
        assertEq(token.balanceOf(treasury), fee);
    }

    function test_ManyToOneIsOneAuthorizedCallPerSource() public {
        address dave = makeAddr("dave");
        token.mint(dave, 10_000 ether);
        address[] memory destination = new address[](1);
        destination[0] = bob;
        uint256[] memory aliceAmount = new uint256[](1);
        aliceAmount[0] = 1_000 ether;
        uint256[] memory daveAmount = new uint256[](1);
        daveAmount[0] = 2_000 ether;

        vm.startPrank(alice);
        token.approve(address(multi), 2_000 ether);
        multi.sendToken(batchId, address(token), destination, aliceAmount, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
        vm.stopPrank();

        vm.startPrank(dave);
        token.approve(address(multi), 3_000 ether);
        multi.sendToken(batchId, address(token), destination, daveAmount, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
        vm.stopPrank();

        assertEq(token.balanceOf(bob), 3_000 ether);
    }

    function test_FeeSnapshotRejectsChangedFee() public {
        uint16 reviewedFee = multi.feeBps();
        uint64 reviewedNonce = multi.configNonce();
        vm.prank(owner);
        multi.setFeeBps(2);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 ether;

        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.FeeChanged.selector, reviewedFee, 2));
        vm.prank(alice);
        multi.sendNative{value: 101 ether}(batchId, recipients, amounts, reviewedFee, reviewedNonce, block.timestamp + 10 minutes);
    }

    function test_ConfigSnapshotRejectsChangedTreasury() public {
        uint16 reviewedFee = multi.feeBps();
        uint64 reviewedNonce = multi.configNonce();
        vm.prank(owner);
        multi.setFeeRecipient(makeAddr("treasury2"));

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 ether;

        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.ConfigChanged.selector, reviewedNonce, 1));
        vm.prank(alice);
        multi.sendNative{value: 101 ether}(batchId, recipients, amounts, reviewedFee, reviewedNonce, block.timestamp + 10 minutes);
    }

    function test_RejectsExpiredPlan() public {
        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.warp(100);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.TransactionExpired.selector, 99, 100));
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, recipients, amounts, multi.feeBps(), multi.configNonce(), 99);
    }

    function test_RejectsIncorrectNativeValue() public {
        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10_000;
        uint256 required = 10_001;

        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.IncorrectNativeValue.selector, required, 10_000));
        vm.prank(alice);
        multi.sendNative{value: 10_000}(batchId, recipients, amounts, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
    }

    function test_RejectsSelfRecipient() public {
        address[] memory recipients = new address[](1);
        recipients[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.RecipientIsSender.selector, 0));
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, recipients, amounts, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
    }

    function test_RejectsFeeOnTransferToken() public {
        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1_000 ether;
        uint256 fee = multi.quoteFee(1_000 ether);

        vm.prank(alice);
        taxToken.approve(address(multi), 1_000 ether + fee);
        vm.expectRevert();
        vm.prank(alice);
        multi.sendToken(batchId, address(taxToken), recipients, amounts, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
    }

    function test_PauseBlocksExecution() public {
        vm.prank(owner);
        multi.pause();

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.expectRevert();
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, recipients, amounts, multi.feeBps(), multi.configNonce(), block.timestamp + 1 hours);
    }

    function test_NonOwnerCannotChangeFee() public {
        vm.prank(alice);
        vm.expectRevert();
        multi.setFeeBps(10);
    }

    function test_RenounceOwnershipDisabled() public {
        vm.prank(owner);
        vm.expectRevert(FlowBridgeMultiSend.RenounceOwnershipDisabled.selector);
        multi.renounceOwnership();
    }
}
