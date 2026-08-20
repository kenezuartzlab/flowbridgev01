// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * FlowRewardsDistributor — pre-funded FLOW distributor with EIP-712 cumulative
 * entitlement claims.
 *
 * Invariants:
 *  - The distributor NEVER mints. It can only transfer FLOW it already holds.
 *  - claimed[account] is monotonically increasing and can never exceed the
 *    highest cumulative entitlement authorized by the reward signer.
 *  - Each claim transfers exactly cumulativeEntitlement - claimed[account].
 *  - Replaying a signature transfers nothing (reverts NothingToClaim), so a
 *    signature can never double-pay.
 *  - claimed[] is updated BEFORE the token transfer.
 */
contract FlowRewardsDistributor is EIP712, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    /// keccak256("Claim(address account,uint256 cumulativeEntitlement,uint256 deadline)")
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address account,uint256 cumulativeEntitlement,uint256 deadline)");

    IERC20 public immutable token;

    /// Server-held authority allowed to sign claim entitlements.
    address public rewardSigner;

    /// Cumulative FLOW already transferred to each account.
    mapping(address => uint256) public claimed;

    event Claim(address indexed account, uint256 delta, uint256 cumulativeEntitlement);
    event RewardSignerUpdated(address indexed previousSigner, address indexed newSigner);

    error TokenZeroAddress();
    error SignerZeroAddress();
    error SignatureExpired();
    error InvalidSigner();
    error NothingToClaim();

    constructor(
        address token_,
        address rewardSigner_,
        address owner_
    ) EIP712("FlowRewardsDistributor", "1") Ownable(owner_) {
        if (token_ == address(0)) revert TokenZeroAddress();
        if (rewardSigner_ == address(0)) revert SignerZeroAddress();
        token = IERC20(token_);
        rewardSigner = rewardSigner_;
        emit RewardSignerUpdated(address(0), rewardSigner_);
    }

    // ---------------------------------------------------------------- claims

    /**
     * Claim the difference between a server-authorized cumulative entitlement
     * and what this account has already been paid.
     */
    function claim(
        address account,
        uint256 cumulativeEntitlement,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, account, cumulativeEntitlement, deadline))
        );
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != rewardSigner) revert InvalidSigner();

        uint256 alreadyClaimed = claimed[account];
        if (cumulativeEntitlement <= alreadyClaimed) revert NothingToClaim();

        uint256 delta = cumulativeEntitlement - alreadyClaimed;
        claimed[account] = cumulativeEntitlement;

        token.safeTransfer(account, delta);
        emit Claim(account, delta, cumulativeEntitlement);
    }

    /// Convenience read for UI/preview. Never an authority for the amount.
    function claimableDelta(address account, uint256 cumulativeEntitlement)
        external
        view
        returns (uint256)
    {
        uint256 alreadyClaimed = claimed[account];
        return cumulativeEntitlement > alreadyClaimed ? cumulativeEntitlement - alreadyClaimed : 0;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ----------------------------------------------------------- admin paths

    function setRewardSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert SignerZeroAddress();
        address previous = rewardSigner;
        rewardSigner = newSigner;
        emit RewardSignerUpdated(previous, newSigner);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * Operator recovery of UNCLAIMED funding only, to the owner. There is no
     * per-user admin withdrawal and no browser-selectable amount authority.
     */
    function withdrawFunding(uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }
}
