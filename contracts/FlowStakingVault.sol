// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * FlowStakingVault — pre-funded, non-minting FLOW staking vault.
 *
 * Design (FlowBridge V13 build gate):
 *  - Principal: users stake the EXISTING fixed-supply FLOW token. The vault
 *    never mints and never creates new supply.
 *  - Rewards: paid only out of a SEPARATE pre-funded reward inventory that the
 *    treasury/operator deposits with `fundRewards`. Principal (`totalStaked`)
 *    and reward inventory (`rewardInventory`) are accounted independently and
 *    can never be confused: a reward schedule may only ever commit inventory.
 *  - Accounting: standard proportional stake-time accumulator
 *    (rewardPerTokenStored / userRewardPerTokenPaid / rewards), so a user's
 *    reward depends only on stake amount, time, total staked and the funded
 *    schedule.
 *
 * Invariants:
 *  I1. token.balanceOf(vault) >= totalStaked + rewardInventory.
 *  I2. Reward schedules can never commit more than uncommitted inventory.
 *  I3. Staked principal is never distributable as rewards.
 *  I4. withdraw() returns exact principal; there is NO slashing and NO owner
 *      path that can seize user principal.
 *  I5. Reward top-ups never alter already-earned rewards or stake balances.
 *  I6. Users can always withdraw principal, even while paused (emergency
 *      pause blocks new stakes and reward claims only) — nobody gets trapped.
 *
 * Economics (minimum stake, reward budget, duration, start time, lock/cooldown)
 * are owner-gated and NOT hardcoded here. Until the owner sets a schedule the
 * vault accrues nothing.
 */
contract FlowStakingVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// The existing FLOW token. Immutable: this vault is single-asset.
    IERC20 public immutable token;

    /// Sum of all user principal. NEVER payable as rewards.
    uint256 public totalStaked;

    /// Pre-funded FLOW available for rewards (committed + uncommitted).
    uint256 public rewardInventory;

    /// Reward inventory already committed to the active/past schedules and to
    /// accrued-but-unclaimed user rewards.
    uint256 public rewardCommitted;

    /// Owner-approved minimum stake (0 = no minimum configured).
    uint256 public minStake;

    /// Owner-approved maximum stake per wallet (0 = unlimited).
    uint256 public maxStakePerWallet;

    // --- reward schedule (owner-gated) ---
    uint256 public rewardRate; // FLOW per second, 0 until a schedule is activated
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardPaid(address indexed account, uint256 amount);
    event RewardsFunded(address indexed from, uint256 amount, uint256 rewardInventory);
    event ScheduleActivated(uint256 budget, uint256 duration, uint256 rewardRate, uint256 periodFinish);
    event MinStakeUpdated(uint256 previous, uint256 current);
    event MaxStakePerWalletUpdated(uint256 previous, uint256 current);
    event UncommittedRewardsRecovered(address indexed to, uint256 amount);

    error TokenZeroAddress();
    error ZeroAmount();
    error BelowMinStake();
    error AboveMaxStake();
    error InsufficientStake();
    error NothingToClaim();
    error ScheduleUnderfunded();
    error InvalidDuration();
    error ScheduleActive();
    error NotRecoverable();

    constructor(address token_, address owner_) Ownable(owner_) {
        if (token_ == address(0)) revert TokenZeroAddress();
        token = IERC20(token_);
    }

    // ---------------------------------------------------------------- views

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 elapsed = lastTimeRewardApplicable();
        if (elapsed <= lastUpdateTime) return rewardPerTokenStored;
        return rewardPerTokenStored + (((elapsed - lastUpdateTime) * rewardRate * 1e18) / totalStaked);
    }

    function earned(address account) public view returns (uint256) {
        uint256 delta = rewardPerToken() - userRewardPerTokenPaid[account];
        return rewards[account] + ((balanceOf[account] * delta) / 1e18);
    }

    /// Reward inventory not yet committed to a schedule or to accrued rewards.
    function uncommittedRewards() public view returns (uint256) {
        return rewardInventory > rewardCommitted ? rewardInventory - rewardCommitted : 0;
    }

    /// True when a funded schedule is currently emitting.
    function scheduleActive() public view returns (bool) {
        return rewardRate > 0 && block.timestamp < periodFinish;
    }

    // ------------------------------------------------------------ accounting

    function _updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    // ------------------------------------------------------------ user paths

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 next = balanceOf[msg.sender] + amount;
        if (minStake != 0 && next < minStake) revert BelowMinStake();
        if (maxStakePerWallet != 0 && next > maxStakePerWallet) revert AboveMaxStake();

        _updateReward(msg.sender);
        balanceOf[msg.sender] = next;
        totalStaked += amount;

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// Principal withdrawal. Deliberately available even while paused (I6).
    function withdraw(uint256 amount) public nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[msg.sender] < amount) revert InsufficientStake();

        _updateReward(msg.sender);
        balanceOf[msg.sender] -= amount;
        totalStaked -= amount;

        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// Transfers only EARNED, pre-funded FLOW. Never touches principal.
    function claimReward() public nonReentrant whenNotPaused {
        _updateReward(msg.sender);
        uint256 amount = rewards[msg.sender];
        if (amount == 0) revert NothingToClaim();

        rewards[msg.sender] = 0;
        rewardInventory -= amount;
        rewardCommitted -= amount;

        token.safeTransfer(msg.sender, amount);
        emit RewardPaid(msg.sender, amount);
    }

    function exit() external {
        uint256 staked = balanceOf[msg.sender];
        if (staked > 0) withdraw(staked);
        if (earned(msg.sender) > 0 && !paused()) claimReward();
    }

    // ----------------------------------------------------------- owner paths

    /// Treasury/operator deposits reward inventory. Not stakeable principal.
    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        rewardInventory += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(msg.sender, amount, rewardInventory);
    }

    /**
     * Activate an owner-approved reward schedule. Fails closed unless the
     * uncommitted, already-deposited reward inventory fully funds `budget`.
     * Cannot overwrite a live schedule (economics stay explicit).
     */
    function activateSchedule(uint256 budget, uint256 duration) external onlyOwner {
        if (duration == 0) revert InvalidDuration();
        if (budget == 0) revert ZeroAmount();
        if (scheduleActive()) revert ScheduleActive();
        if (budget > uncommittedRewards()) revert ScheduleUnderfunded();

        _updateReward(address(0));
        rewardCommitted += budget;
        rewardRate = budget / duration;
        if (rewardRate == 0) revert ScheduleUnderfunded();
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit ScheduleActivated(budget, duration, rewardRate, periodFinish);
    }

    function setMinStake(uint256 value) external onlyOwner {
        emit MinStakeUpdated(minStake, value);
        minStake = value;
    }

    function setMaxStakePerWallet(uint256 value) external onlyOwner {
        emit MaxStakePerWalletUpdated(maxStakePerWallet, value);
        maxStakePerWallet = value;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * Owner may recover ONLY uncommitted reward inventory. User principal and
     * committed rewards are unreachable by design (I4).
     */
    function recoverUncommittedRewards(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert TokenZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > uncommittedRewards()) revert NotRecoverable();
        rewardInventory -= amount;
        token.safeTransfer(to, amount);
        emit UncommittedRewardsRecovered(to, amount);
    }
}
