// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FlowBridgeMultiSend} from "../FlowBridgeMultiSend.sol";

contract Mock20 is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev ERC-20 that returns false instead of reverting — a non-standard success signal.
contract FalseReturnToken is ERC20 {
    constructor() ERC20("False", "FALSE") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function transferFrom(address, address, uint256) public pure override returns (bool) { return false; }
}

/// @dev ERC-20 with no boolean return value at all (pre-standard token shape).
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external { allowance[msg.sender][spender] = amount; }
    function transferFrom(address from, address to, uint256 amount) external {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Native recipient that always reverts, proving atomic rollback of a whole batch.
contract RevertingReceiver {
    receive() external payable { revert("no thanks"); }
}

/// @dev Token whose transferFrom re-enters MultiSend to prove the reentrancy guard holds.
contract ReentrantToken is ERC20 {
    FlowBridgeMultiSend public target;
    bool private entered;

    constructor() ERC20("Reentrant", "RE") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function arm(FlowBridgeMultiSend t) external { target = t; }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!entered && address(target) != address(0)) {
            entered = true;
            address[] memory recipients = new address[](1);
            recipients[0] = address(0xBEEF);
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = 1;
            target.sendToken(
                keccak256("reentry"), address(this), recipients, amounts, target.feeBps(), target.configNonce(), block.timestamp + 1
            );
        }
        return super.transferFrom(from, to, amount);
    }
}

/**
 * Negative and adversarial acceptance for FlowBridgeMultiSend V1.
 * Every case asserts the contract refuses unsafe input or keeps no residual custody.
 */
contract FlowBridgeMultiSendAdversarialTest is Test {
    FlowBridgeMultiSend internal multi;
    Mock20 internal token;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal batchId = keccak256("adversarial");
    uint256 internal deadline;

    function setUp() public {
        vm.prank(owner);
        multi = new FlowBridgeMultiSend(owner, treasury);
        token = new Mock20();
        token.mint(alice, 1_000_000 ether);
        vm.deal(alice, 1_000 ether);
        deadline = block.timestamp + 1 hours;
    }

    function _one(address to, uint256 amount) internal pure returns (address[] memory r, uint256[] memory a) {
        r = new address[](1);
        a = new uint256[](1);
        r[0] = to;
        a[0] = amount;
    }

    /* ------------------------------------------------------------ input ---- */

    function test_RejectsZeroRecipientAddress() public {
        (address[] memory r, uint256[] memory a) = _one(address(0), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidRecipient.selector, 0, address(0)));
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, r, a, 1, 0, deadline);
    }

    function test_RejectsContractItselfAsRecipient() public {
        (address[] memory r, uint256[] memory a) = _one(address(multi), 1 ether);
        vm.expectRevert();
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, r, a, 1, 0, deadline);
    }

    function test_RejectsZeroAmount() public {
        (address[] memory r, uint256[] memory a) = _one(bob, 0);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidAmount.selector, 0));
        vm.prank(alice);
        multi.sendNative{value: 0}(batchId, r, a, 1, 0, deadline);
    }

    function test_RejectsEmptyBatch() public {
        address[] memory r = new address[](0);
        uint256[] memory a = new uint256[](0);
        vm.expectRevert(FlowBridgeMultiSend.EmptyBatch.selector);
        vm.prank(alice);
        multi.sendNative{value: 0}(batchId, r, a, 1, 0, deadline);
    }

    function test_RejectsMalformedLengthMismatch() public {
        address[] memory r = new address[](2);
        r[0] = bob;
        r[1] = carol;
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.LengthMismatch.selector, 2, 1));
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, r, a, 1, 0, deadline);
    }

    function test_AcceptsMaxRecipientBoundaryAndRejectsOneMore() public {
        uint16 cap = multi.maxRecipients();
        assertEq(cap, 100);

        address[] memory r = new address[](cap);
        uint256[] memory a = new uint256[](cap);
        for (uint256 i; i < cap; ++i) {
            r[i] = address(uint160(1_000 + i));
            a[i] = 0.01 ether;
        }
        uint256 total = uint256(cap) * 0.01 ether;
        vm.prank(alice);
        multi.sendNative{value: total + multi.quoteFee(total)}(batchId, r, a, 1, 0, deadline);
        assertEq(address(multi).balance, 0);

        address[] memory rBig = new address[](uint256(cap) + 1);
        uint256[] memory aBig = new uint256[](uint256(cap) + 1);
        for (uint256 i; i < rBig.length; ++i) {
            rBig[i] = address(uint160(5_000 + i));
            aBig[i] = 0.01 ether;
        }
        uint256 bigTotal = rBig.length * 0.01 ether;
        uint256 bigRequired = bigTotal + multi.quoteFee(bigTotal);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.TooManyRecipients.selector, rBig.length, cap));
        vm.prank(alice);
        multi.sendNative{value: bigRequired}(batchId, rBig, aBig, 1, 0, deadline);
    }

    function test_DuplicateRecipientsAreCreditedTwice() public {
        address[] memory r = new address[](2);
        r[0] = bob;
        r[1] = bob;
        uint256[] memory a = new uint256[](2);
        a[0] = 1 ether;
        a[1] = 2 ether;
        uint256 fee = multi.quoteFee(3 ether);
        vm.prank(alice);
        multi.sendNative{value: 3 ether + fee}(batchId, r, a, 1, 0, deadline);
        assertEq(bob.balance, 3 ether);
        assertEq(address(multi).balance, 0);
    }

    /* ----------------------------------------------------------- balances -- */

    function test_InsufficientTokenBalanceReverts() public {
        address poor = makeAddr("poor");
        token.mint(poor, 10 ether);
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        vm.startPrank(poor);
        token.approve(address(multi), 1_000 ether);
        vm.expectRevert();
        multi.sendToken(batchId, address(token), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(address(multi)), 0);
    }

    function test_InsufficientAllowanceReverts() public {
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        vm.startPrank(alice);
        token.approve(address(multi), 10 ether);
        vm.expectRevert();
        multi.sendToken(batchId, address(token), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(token.balanceOf(bob), 0);
    }

    function test_ExactAllowanceIsFullyConsumedAndNotExceeded() public {
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        uint256 fee = multi.quoteFee(100 ether);
        vm.startPrank(alice);
        token.approve(address(multi), 100 ether + fee);
        multi.sendToken(batchId, address(token), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(token.allowance(alice, address(multi)), 0);
        assertEq(token.balanceOf(bob), 100 ether);
        assertEq(token.balanceOf(treasury), fee);
        assertEq(token.balanceOf(address(multi)), 0);
    }

    function test_InsufficientNativeValueRevertsWithoutPartialCredit() public {
        address[] memory r = new address[](2);
        r[0] = bob;
        r[1] = carol;
        uint256[] memory a = new uint256[](2);
        a[0] = 1 ether;
        a[1] = 1 ether;
        vm.expectRevert();
        vm.prank(alice);
        multi.sendNative{value: 1 ether}(batchId, r, a, 1, 0, deadline);
        assertEq(bob.balance, 0);
        assertEq(carol.balance, 0);
    }

    /* ---------------------------------------------------------- rollback --- */

    function test_RevertingNativeRecipientRollsBackWholeBatch() public {
        RevertingReceiver bad = new RevertingReceiver();
        address[] memory r = new address[](2);
        r[0] = bob;
        r[1] = address(bad);
        uint256[] memory a = new uint256[](2);
        a[0] = 1 ether;
        a[1] = 1 ether;
        uint256 fee = multi.quoteFee(2 ether);
        uint256 aliceBefore = alice.balance;

        vm.expectRevert();
        vm.prank(alice);
        multi.sendNative{value: 2 ether + fee}(batchId, r, a, 1, 0, deadline);

        assertEq(bob.balance, 0);
        assertEq(treasury.balance, 0);
        assertEq(alice.balance, aliceBefore);
        assertEq(address(multi).balance, 0);
    }

    /* ------------------------------------------------------------- tokens -- */

    function test_RejectsTokenReturningFalse() public {
        FalseReturnToken bad = new FalseReturnToken();
        bad.mint(alice, 1_000 ether);
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        vm.startPrank(alice);
        bad.approve(address(multi), 1_000 ether);
        vm.expectRevert();
        multi.sendToken(batchId, address(bad), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(bad.balanceOf(bob), 0);
    }

    function test_NonStandardNoReturnTokenStillTransfersExactly() public {
        NoReturnToken odd = new NoReturnToken();
        odd.mint(alice, 1_000 ether);
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        uint256 fee = multi.quoteFee(100 ether);
        vm.startPrank(alice);
        odd.approve(address(multi), 100 ether + fee);
        multi.sendToken(batchId, address(odd), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(odd.balanceOf(bob), 100 ether);
        assertEq(odd.balanceOf(treasury), fee);
        assertEq(odd.balanceOf(address(multi)), 0);
    }

    function test_RejectsZeroTokenAddress() public {
        (address[] memory r, uint256[] memory a) = _one(bob, 1 ether);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidToken.selector, address(0)));
        vm.prank(alice);
        multi.sendToken(batchId, address(0), r, a, 1, 0, deadline);
    }

    function test_ReentrancyAttemptIsBlocked() public {
        ReentrantToken evil = new ReentrantToken();
        evil.mint(alice, 1_000 ether);
        evil.arm(multi);
        (address[] memory r, uint256[] memory a) = _one(bob, 100 ether);
        vm.startPrank(alice);
        evil.approve(address(multi), 1_000 ether);
        vm.expectRevert();
        multi.sendToken(batchId, address(evil), r, a, 1, 0, deadline);
        vm.stopPrank();
        assertEq(evil.balanceOf(bob), 0);
        assertEq(evil.balanceOf(address(multi)), 0);
    }

    /* -------------------------------------------------------------- admin -- */

    function test_UnauthorizedAdminChangesRejected() public {
        vm.startPrank(alice);
        vm.expectRevert();
        multi.setFeeRecipient(alice);
        vm.expectRevert();
        multi.setMaxRecipients(5);
        vm.expectRevert();
        multi.pause();
        vm.expectRevert();
        multi.rescueNative(payable(alice), 0);
        vm.expectRevert();
        multi.rescueToken(address(token), alice, 0);
        vm.stopPrank();
    }

    function test_PausedThenUnpausedResumesSafely() public {
        vm.prank(owner);
        multi.pause();
        (address[] memory r, uint256[] memory a) = _one(bob, 1 ether);
        uint256 required = 1 ether + multi.quoteFee(1 ether);
        vm.expectRevert();
        vm.prank(alice);
        multi.sendNative{value: required}(batchId, r, a, 1, 0, deadline);

        vm.prank(owner);
        multi.unpause();
        vm.prank(alice);
        multi.sendNative{value: required}(batchId, r, a, 1, 0, deadline);
        assertEq(bob.balance, 1 ether);
    }

    function test_MaxRecipientsCannotExceedHardMaximum() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidMaxRecipients.selector, uint16(501)));
        multi.setMaxRecipients(501);
        assertEq(multi.HARD_MAX_RECIPIENTS(), 500);
    }

    function test_FeeRecipientCannotBeZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.InvalidFeeRecipient.selector, address(0)));
        multi.setFeeRecipient(address(0));
    }

    function test_StaleConfigNonceRejectedAfterMaxRecipientsChange() public {
        uint64 reviewed = multi.configNonce();
        vm.prank(owner);
        multi.setMaxRecipients(50);
        (address[] memory r, uint256[] memory a) = _one(bob, 1 ether);
        uint256 required = 1 ether + multi.quoteFee(1 ether);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.ConfigChanged.selector, reviewed, reviewed + 1));
        vm.prank(alice);
        multi.sendNative{value: required}(batchId, r, a, 1, reviewed, deadline);
    }

    function test_FeeRecipientCannotBeTheSender() public {
        vm.deal(treasury, 10 ether);
        (address[] memory r, uint256[] memory a) = _one(bob, 1 ether);
        uint256 required = 1 ether + multi.quoteFee(1 ether);
        vm.expectRevert(abi.encodeWithSelector(FlowBridgeMultiSend.FeeRecipientIsSender.selector, treasury));
        vm.prank(treasury);
        multi.sendNative{value: required}(batchId, r, a, 1, 0, deadline);
    }

    function test_OwnerRescueOnlyMovesStrandedFunds() public {
        vm.deal(address(multi), 5 ether);
        vm.prank(owner);
        multi.rescueNative(payable(owner), 5 ether);
        assertEq(address(multi).balance, 0);
        assertEq(owner.balance, 5 ether);

        token.mint(address(multi), 7 ether);
        vm.prank(owner);
        multi.rescueToken(address(token), owner, 7 ether);
        assertEq(token.balanceOf(address(multi)), 0);
        assertEq(token.balanceOf(owner), 7 ether);
    }

    function test_OwnershipTransferIsTwoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        multi.transferOwnership(next);
        assertEq(multi.owner(), owner);
        vm.prank(next);
        multi.acceptOwnership();
        assertEq(multi.owner(), next);
    }
}
