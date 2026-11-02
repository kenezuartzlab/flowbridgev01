// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Prefunded, non-upgradeable accumulated rewards. No expiry or relayer.
/// @dev OZ 5.0.2 / solc 0.8.20. Initial limits ZERO and initially paused.
contract FlowRewardsVaultV2 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable flow;
    address public publisher;
    uint256 public constant MAX_RECIPIENTS = 100;
    uint256 public batchCap;
    uint256 public dailyCap;
    uint256 public creditDay;
    uint256 public creditedToday;
    uint256 public totalLiabilities;
    mapping(address => uint256) public claimable;
    mapping(address => uint256) public totalClaimed;
    mapping(bytes32 => bool) public processedBatch;

    error InvalidInput();
    error UnauthorizedPublisher();
    error DuplicateWallet();
    error BatchReplay();
    error LimitExceeded();
    error InsufficientBacking();
    error NothingToClaim();
    error InexactTransfer();
    event BatchCredited(bytes32 indexed batchId, uint256 total, uint256 recipients);
    event WalletCredited(bytes32 indexed batchId, address indexed wallet, uint256 amount);
    event Claimed(address indexed wallet, uint256 amount);
    event PublisherChanged(address indexed previous, address indexed current);
    event LimitsChanged(uint256 batchCap, uint256 dailyCap);
    event SurplusRecovered(address indexed recipient, uint256 amount);

    constructor(address token, address admin, address signer) Ownable(admin) {
        if (token.code.length == 0 || signer == address(0) || signer == admin || IERC20Metadata(token).decimals() != 18) revert InvalidInput();
        flow = IERC20(token);
        publisher = signer;
        _pause();
    }

    function setPublisher(address signer) external onlyOwner {
        if (signer == address(0) || signer == owner() || signer == pendingOwner()) revert InvalidInput();
        emit PublisherChanged(publisher, signer);
        publisher = signer;
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0) || newOwner == publisher) revert InvalidInput();
        super.transferOwnership(newOwner);
    }

    function acceptOwnership() public override {
        if (msg.sender == publisher) revert InvalidInput();
        super.acceptOwnership();
    }

    /// @dev Renunciation cannot strand governance or recovery.
    function renounceOwnership() public pure override { revert InvalidInput(); }
    function setLimits(uint256 perBatch, uint256 perDay) external onlyOwner {
        if (perBatch > perDay) revert InvalidInput();
        batchCap = perBatch;
        dailyCap = perDay;
        emit LimitsChanged(perBatch, perDay);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function freeBalance() public view returns (uint256) {
        uint256 held = flow.balanceOf(address(this));
        if (held < totalLiabilities) revert InsufficientBacking();
        return held - totalLiabilities;
    }

    function creditBatch(bytes32 batchId, address[] calldata wallets, uint256[] calldata amounts) external nonReentrant whenNotPaused {
        if (msg.sender != publisher) revert UnauthorizedPublisher();
        uint256 n = wallets.length;
        if (batchId == bytes32(0) || n == 0 || n > MAX_RECIPIENTS || n != amounts.length) revert InvalidInput();
        if (processedBatch[batchId]) revert BatchReplay();
        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (wallets[i] == address(0) || wallets[i] == address(this) || amounts[i] == 0) revert InvalidInput();
            for (uint256 j; j < i; ++j) if (wallets[j] == wallets[i]) revert DuplicateWallet();
            total += amounts[i];
        }
        uint256 day = block.timestamp / 1 days;
        uint256 spent = day == creditDay ? creditedToday : 0;
        if (total > batchCap || spent + total > dailyCap) revert LimitExceeded();
        if (total > freeBalance()) revert InsufficientBacking();
        creditDay = day;
        creditedToday = spent + total;
        processedBatch[batchId] = true;
        totalLiabilities += total;
        for (uint256 i; i < n; ++i) {
            claimable[wallets[i]] += amounts[i];
            emit WalletCredited(batchId, wallets[i], amounts[i]);
        }
        emit BatchCredited(batchId, total, n);
    }

    function claim() external nonReentrant whenNotPaused {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        // Detect insolvency before effects; a revert leaves all obligations intact.
        freeBalance();
        claimable[msg.sender] = 0;
        totalLiabilities -= amount;
        totalClaimed[msg.sender] += amount;
        _exactTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function recoverSurplus(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this) || amount == 0) revert InvalidInput();
        if (amount > freeBalance()) revert InsufficientBacking();
        _exactTransfer(recipient, amount);
        emit SurplusRecovered(recipient, amount);
    }

    /// @dev Both sides must move exactly; rejects fee/rebase/inexact transfers.
    function _exactTransfer(address recipient, uint256 amount) private {
        uint256 beforeHeld = flow.balanceOf(address(this));
        uint256 beforeUser = flow.balanceOf(recipient);
        flow.safeTransfer(recipient, amount);
        uint256 afterHeld = flow.balanceOf(address(this));
        uint256 afterUser = flow.balanceOf(recipient);
        if (afterHeld > beforeHeld || beforeHeld - afterHeld != amount || afterUser < beforeUser || afterUser - beforeUser != amount) revert InexactTransfer();
        if (afterHeld < totalLiabilities) revert InsufficientBacking();
    }
}