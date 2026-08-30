// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * FlowStakingRewardTreasury — segregated pre-funded FLOW reward reserve for
 * Staking v2. Holds REWARD INVENTORY ONLY: user principal lives in
 * FlowStakingVaultV2 and can never be classified as distributable rewards.
 *
 * Bucket accounting (all in FLOW wei):
 *   reservedGenesis   — obligations reserved for granted Genesis windows.
 *   reservedFloors    — obligations reserved for locked-product floors.
 *   committedEpoch    — variable emission committed to the active epoch.
 *   accruedUnclaimed  — rewards users have earned but not yet claimed.
 *
 * Invariant T1: token.balanceOf(this) >=
 *   reservedGenesis + reservedFloors + committedEpoch + accruedUnclaimed.
 * Invariant T2: recovery may only move freeBalance() (demonstrably unreserved).
 */
contract FlowStakingRewardTreasury is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    IERC20 public immutable token;

    uint256 public reservedGenesis;
    uint256 public reservedFloors;
    uint256 public committedEpoch;
    uint256 public accruedUnclaimed;

    address public recoveryRecipient;

    event Deposited(address indexed from, uint256 amount, uint256 balance);
    event ReservedGenesis(uint256 amount);
    event ReleasedGenesis(uint256 amount);
    event ReservedFloor(uint256 amount);
    event ReleasedFloor(uint256 amount);
    event CommittedEpoch(uint256 amount);
    event ReconciledEpoch(uint256 unused);
    event Accrued(uint8 indexed bucket, uint256 amount);
    event PaidOut(address indexed to, uint256 amount);
    event RecoveredFree(address indexed to, uint256 amount);
    event RecoveryRecipientUpdated(address indexed previous, address indexed current);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientFreeBalance();
    error InsufficientBucket();
    error InsufficientAccrued();
    error NotRecoveryRecipient();

    constructor(address token_, address admin, address recoveryRecipient_) {
        if (token_ == address(0) || admin == address(0)) revert ZeroAddress();
        if (recoveryRecipient_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        recoveryRecipient = recoveryRecipient_;
    }

    /// Reward inventory funding. Never callable for user principal.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, token.balanceOf(address(this)));
    }

    function totalObligations() public view returns (uint256) {
        return reservedGenesis + reservedFloors + committedEpoch + accruedUnclaimed;
    }

    /// Demonstrably unreserved reward inventory.
    function freeBalance() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 ob = totalObligations();
        return bal > ob ? bal - ob : 0;
    }

    // ------------------------------------------------------- vault paths

    function reserveGenesis(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeBalance()) revert InsufficientFreeBalance();
        reservedGenesis += amount;
        emit ReservedGenesis(amount);
    }

    function releaseGenesis(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount > reservedGenesis) revert InsufficientBucket();
        reservedGenesis -= amount;
        emit ReleasedGenesis(amount);
    }

    function reserveFloor(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeBalance()) revert InsufficientFreeBalance();
        reservedFloors += amount;
        emit ReservedFloor(amount);
    }

    function releaseFloor(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount > reservedFloors) revert InsufficientBucket();
        reservedFloors -= amount;
        emit ReleasedFloor(amount);
    }

    /// Move earned-but-unclaimed genesis reward from its reservation.
    function accrueFromGenesis(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount == 0) return;
        if (amount > reservedGenesis) revert InsufficientBucket();
        reservedGenesis -= amount;
        accruedUnclaimed += amount;
        emit Accrued(0, amount);
    }

    function accrueFromFloor(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount == 0) return;
        if (amount > reservedFloors) revert InsufficientBucket();
        reservedFloors -= amount;
        accruedUnclaimed += amount;
        emit Accrued(1, amount);
    }

    /// Move earned variable emission out of the active epoch commitment.
    function accrueFromCommitted(uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount == 0) return;
        if (amount > committedEpoch) revert InsufficientBucket();
        committedEpoch -= amount;
        accruedUnclaimed += amount;
        emit Accrued(2, amount);
    }

    function payOut(address to, uint256 amount) external onlyRole(VAULT_ROLE) {
        if (amount > accruedUnclaimed) revert InsufficientAccrued();
        accruedUnclaimed -= amount;
        token.safeTransfer(to, amount);
        emit PaidOut(to, amount);
    }

    // --------------------------------------------------- controller paths

    /// Commit free reward inventory to a new variable epoch.
    function commitEpoch(uint256 amount) external onlyRole(CONTROLLER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeBalance()) revert InsufficientFreeBalance();
        committedEpoch += amount;
        emit CommittedEpoch(amount);
    }

    /// Return unused variable emission (zero-staker time, rounding) to free.
    function reconcileEpoch(uint256 unused) external onlyRole(CONTROLLER_ROLE) {
        if (unused > committedEpoch) revert InsufficientBucket();
        committedEpoch -= unused;
        emit ReconciledEpoch(unused);
    }

    // -------------------------------------------------------- admin paths

    function setRecoveryRecipient(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        emit RecoveryRecipientUpdated(recoveryRecipient, to);
        recoveryRecipient = to;
    }

    /// Moves ONLY demonstrably unreserved reward inventory, only to the
    /// configured recovery recipient. Reserved/committed/accrued funds and
    /// (by construction, since none is held here) user principal are
    /// unreachable.
    function recoverFree(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == 0) revert ZeroAmount();
        address to = recoveryRecipient;
        if (to == address(0)) revert NotRecoveryRecipient();
        if (amount > freeBalance()) revert InsufficientFreeBalance();
        token.safeTransfer(to, amount);
        emit RecoveredFree(to, amount);
    }
}
