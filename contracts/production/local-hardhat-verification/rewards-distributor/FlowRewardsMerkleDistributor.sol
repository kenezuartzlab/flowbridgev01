// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * FlowRewardsMerkleDistributor — FlowBridge V30.1B.2 canonical mainnet rewards
 * distributor: pre-funded, budgeted, epoch-reserved Merkle claims.
 *
 * Solvency model (enforced by canonical state, never by server trust):
 *
 *   balance      = token.balanceOf(address(this))          // actual FLOW held
 *   totalReserved= sum of unclaimed allocation of live epochs
 *   totalClaimed = FLOW already delivered to users
 *   freeBalance  = balance - totalReserved   (0 if balance < totalReserved)
 *
 * Invariants:
 *  - publishEpoch reverts unless balance >= totalReserved + allocation, so every
 *    live obligation is fully funded at the moment it becomes claimable.
 *  - publishEpoch reverts unless totalClaimed + totalReserved + allocation
 *    <= campaignBudget, so a publisher can never exceed approved budget.
 *  - Concurrent epochs cannot overbook the same inventory: each publication
 *    reserves against the SAME totalReserved accumulator.
 *  - recoverFree can move at most freeBalance, so privileged recovery can never
 *    consume FLOW reserved for live claims.
 *  - Claims pay only the leaf-committed account and amount; the bitmap makes
 *    replay impossible and a third-party submitter cannot redirect the payout.
 *  - Accounting is updated BEFORE the transfer and the claim path is
 *    nonReentrant.
 *  - There is no mint path. The contract can only move FLOW it already holds.
 *  - Role rotation never mutates epochs, reservations or claim bitmaps, so a
 *    live obligation survives any signer/publisher/admin change.
 */
contract FlowRewardsMerkleDistributor is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// Approves the campaign spending ceiling. Cannot publish entitlements.
    bytes32 public constant BUDGET_MANAGER_ROLE = keccak256("BUDGET_MANAGER_ROLE");
    /// Publishes epoch roots within the approved budget. Cannot raise the budget.
    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");
    /// Emergency pause only. Cannot move funds.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public constant MIN_PUBLISH_DELAY_FLOOR = 1 hours;
    uint64 public constant MIN_PUBLISH_DELAY_CEILING = 7 days;

    IERC20 public immutable token;

    /// Only destination of privileged recovery. Never an arbitrary caller.
    address public recoveryRecipient;

    /// Manager-approved ceiling on totalClaimed + totalReserved.
    uint256 public campaignBudget;

    /// Unclaimed allocation of every live (published, not cancelled/released) epoch.
    uint256 public totalReserved;

    /// Cumulative FLOW delivered to users.
    uint256 public totalClaimed;

    /// Delay between publication and the earliest allowed claim.
    uint64 public minPublishDelay;

    struct Epoch {
        bytes32 root;
        uint256 allocation;
        uint256 claimed;
        uint64 claimStart;
        uint64 claimEnd;
        bool cancelled;
        bool released;
    }

    /// 1-indexed epochs. epochCount is the highest published id.
    mapping(uint256 => Epoch) private _epochs;
    uint256 public epochCount;

    /// epochId => word index => bitmap of claimed leaf indexes.
    mapping(uint256 => mapping(uint256 => uint256)) private _claimedBitmap;

    event CampaignBudgetUpdated(uint256 previousBudget, uint256 newBudget);
    event MinPublishDelayUpdated(uint64 previousDelay, uint64 newDelay);
    event RecoveryRecipientUpdated(address indexed previous, address indexed next);
    event EpochPublished(
        uint256 indexed epochId,
        bytes32 root,
        uint256 allocation,
        uint64 claimStart,
        uint64 claimEnd
    );
    event EpochCancelled(uint256 indexed epochId, uint256 releasedAmount);
    event EpochExpiredReleased(uint256 indexed epochId, uint256 releasedAmount);
    event Claimed(uint256 indexed epochId, uint256 indexed index, address indexed account, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error InvalidRoot();
    error InvalidWindow();
    error PublishDelayTooShort();
    error DelayOutOfRange();
    error BudgetExceeded();
    error BudgetBelowCommitted();
    error InsufficientFunding();
    error UnknownEpoch();
    error EpochNotLive();
    error ClaimWindowClosed();
    error ClaimWindowNotOpen();
    error AlreadyClaimed();
    error InvalidProof();
    error ClaimsAlreadyStarted();
    error EpochNotExpired();
    error ExceedsFreeBalance();

    constructor(
        address token_,
        address admin_,
        address budgetManager_,
        address publisher_,
        address pauser_,
        address recoveryRecipient_,
        uint64 minPublishDelay_
    ) {
        if (
            token_ == address(0) ||
            admin_ == address(0) ||
            budgetManager_ == address(0) ||
            publisher_ == address(0) ||
            pauser_ == address(0) ||
            recoveryRecipient_ == address(0)
        ) revert ZeroAddress();
        if (minPublishDelay_ < MIN_PUBLISH_DELAY_FLOOR || minPublishDelay_ > MIN_PUBLISH_DELAY_CEILING) {
            revert DelayOutOfRange();
        }

        token = IERC20(token_);
        recoveryRecipient = recoveryRecipient_;
        minPublishDelay = minPublishDelay_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(BUDGET_MANAGER_ROLE, budgetManager_);
        _grantRole(PUBLISHER_ROLE, publisher_);
        _grantRole(PAUSER_ROLE, pauser_);

        emit RecoveryRecipientUpdated(address(0), recoveryRecipient_);
        emit MinPublishDelayUpdated(0, minPublishDelay_);
    }

    // ------------------------------------------------------------- solvency

    /// FLOW held by this contract that is NOT backing a live obligation.
    function freeBalance() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        return balance > totalReserved ? balance - totalReserved : 0;
    }

    /// Budget headroom a publisher may still reserve.
    function budgetRemaining() public view returns (uint256) {
        uint256 committed = totalClaimed + totalReserved;
        return campaignBudget > committed ? campaignBudget - committed : 0;
    }

    function getEpoch(uint256 epochId) external view returns (Epoch memory) {
        if (epochId == 0 || epochId > epochCount) revert UnknownEpoch();
        return _epochs[epochId];
    }

    function isClaimed(uint256 epochId, uint256 index) public view returns (bool) {
        uint256 word = index >> 8;
        uint256 bit = index & 0xff;
        return (_claimedBitmap[epochId][word] >> bit) & 1 == 1;
    }

    /**
     * Canonical leaf encoding. Binds chain id and this distributor so a manifest
     * can never be replayed on another chain or another deployment.
     */
    function leafHash(
        uint256 epochId,
        uint256 index,
        address account,
        uint256 amount
    ) public view returns (bytes32) {
        return
            keccak256(
                bytes.concat(
                    keccak256(abi.encode(block.chainid, address(this), epochId, index, account, amount))
                )
            );
    }

    // ------------------------------------------------------------ publishing

    function publishEpoch(
        bytes32 root,
        uint256 allocation,
        uint64 claimStart,
        uint64 claimEnd
    ) external onlyRole(PUBLISHER_ROLE) whenNotPaused returns (uint256 epochId) {
        if (root == bytes32(0)) revert InvalidRoot();
        if (allocation == 0) revert ZeroAmount();
        if (claimEnd <= claimStart) revert InvalidWindow();
        if (claimStart < block.timestamp + minPublishDelay) revert PublishDelayTooShort();

        uint256 newReserved = totalReserved + allocation;
        if (totalClaimed + newReserved > campaignBudget) revert BudgetExceeded();
        if (token.balanceOf(address(this)) < newReserved) revert InsufficientFunding();

        totalReserved = newReserved;
        epochId = ++epochCount;
        _epochs[epochId] = Epoch({
            root: root,
            allocation: allocation,
            claimed: 0,
            claimStart: claimStart,
            claimEnd: claimEnd,
            cancelled: false,
            released: false
        });

        emit EpochPublished(epochId, root, allocation, claimStart, claimEnd);
    }

    /// Cancel an epoch strictly before its claim window opens.
    function cancelEpoch(uint256 epochId) external onlyRole(BUDGET_MANAGER_ROLE) {
        Epoch storage epoch = _load(epochId);
        if (epoch.cancelled || epoch.released) revert EpochNotLive();
        if (block.timestamp >= epoch.claimStart) revert ClaimsAlreadyStarted();

        uint256 released = epoch.allocation - epoch.claimed;
        epoch.cancelled = true;
        totalReserved -= released;
        emit EpochCancelled(epochId, released);
    }

    /// Release only the still-unclaimed remainder, only after claimEnd.
    function releaseExpiredEpoch(uint256 epochId) external onlyRole(BUDGET_MANAGER_ROLE) {
        Epoch storage epoch = _load(epochId);
        if (epoch.cancelled || epoch.released) revert EpochNotLive();
        if (block.timestamp <= epoch.claimEnd) revert EpochNotExpired();

        uint256 released = epoch.allocation - epoch.claimed;
        epoch.released = true;
        totalReserved -= released;
        emit EpochExpiredReleased(epochId, released);
    }

    // ---------------------------------------------------------------- claims

    /**
     * Claim a leaf-committed allocation. Anyone may submit the proof; the FLOW
     * always goes to `account`.
     */
    function claim(
        uint256 epochId,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant {
        Epoch storage epoch = _load(epochId);
        if (epoch.cancelled || epoch.released) revert EpochNotLive();
        if (block.timestamp < epoch.claimStart) revert ClaimWindowNotOpen();
        if (block.timestamp > epoch.claimEnd) revert ClaimWindowClosed();
        if (amount == 0) revert ZeroAmount();
        if (account == address(0)) revert ZeroAddress();
        if (isClaimed(epochId, index)) revert AlreadyClaimed();

        bytes32 leaf = leafHash(epochId, index, account, amount);
        if (!MerkleProof.verifyCalldata(proof, epoch.root, leaf)) revert InvalidProof();

        // A correct manifest never allocates more than the epoch allocation.
        if (epoch.claimed + amount > epoch.allocation) revert BudgetExceeded();

        _claimedBitmap[epochId][index >> 8] |= (1 << (index & 0xff));
        epoch.claimed += amount;
        totalReserved -= amount;
        totalClaimed += amount;

        token.safeTransfer(account, amount);
        emit Claimed(epochId, index, account, amount);
    }

    // ------------------------------------------------------------ governance

    function setCampaignBudget(uint256 newBudget) external onlyRole(BUDGET_MANAGER_ROLE) {
        if (newBudget < totalClaimed + totalReserved) revert BudgetBelowCommitted();
        uint256 previous = campaignBudget;
        campaignBudget = newBudget;
        emit CampaignBudgetUpdated(previous, newBudget);
    }

    function setMinPublishDelay(uint64 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newDelay < MIN_PUBLISH_DELAY_FLOOR || newDelay > MIN_PUBLISH_DELAY_CEILING) {
            revert DelayOutOfRange();
        }
        uint64 previous = minPublishDelay;
        minPublishDelay = newDelay;
        emit MinPublishDelayUpdated(previous, newDelay);
    }

    function setRecoveryRecipient(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        address previous = recoveryRecipient;
        recoveryRecipient = next;
        emit RecoveryRecipientUpdated(previous, next);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * Recover UNRESERVED funding only, and only to the configured recipient.
     * Reserved obligations are unreachable by any privileged path.
     */
    function recoverFree(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > freeBalance()) revert ExceedsFreeBalance();
        token.safeTransfer(recoveryRecipient, amount);
    }

    function _load(uint256 epochId) private view returns (Epoch storage epoch) {
        if (epochId == 0 || epochId > epochCount) revert UnknownEpoch();
        epoch = _epochs[epochId];
    }
}
