// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FlowBridgeActivityRegistry
 * @notice Append-only, non-custodial evidence anchor for activity that has
 *         already been verified from finalized source-chain data.
 * @dev This contract does not move user assets, calculate rewards, award XP or
 *      PTS, mint FLOW, or settle FLOW claims.
 */
contract FlowBridgeActivityRegistry is AccessControl, Pausable {
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error ZeroAddress();
    error AdminAttesterMustDiffer();
    error ZeroActionType();
    error ZeroSourceChainId();
    error ZeroSourceTxHash();
    error DuplicateActivity(bytes32 activityId);
    error UnknownActivity(bytes32 activityId);

    struct Activity {
        address user;
        bytes32 actionType;
        uint256 sourceChainId;
        bytes32 sourceTxHash;
        uint256 sourceLogIndex;
        uint256 amount;
        bytes32 campaignId;
        bytes32 intentHash;
        uint64 observedAt;
    }

    mapping(bytes32 activityId => Activity activity) private _activities;
    mapping(bytes32 activityId => bool isRecorded_) private _recorded;

    event ActivityRecorded(
        bytes32 indexed activityId,
        address indexed user,
        bytes32 indexed actionType,
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        uint256 sourceLogIndex,
        uint256 amount,
        bytes32 campaignId,
        bytes32 intentHash,
        uint64 observedAt
    );

    /**
     * @param admin DEFAULT_ADMIN_ROLE holder. For mainnet this should later be
     *              a reviewed governance address, not the verifier key.
     * @param attester Address authorized to anchor already-verified activity.
     * @param pauser Address authorized to pause new attestations.
     */
    constructor(address admin, address attester, address pauser) {
        if (admin == address(0) || attester == address(0) || pauser == address(0)) {
            revert ZeroAddress();
        }
        if (admin == attester) revert AdminAttesterMustDiffer();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTER_ROLE, attester);
        _grantRole(PAUSER_ROLE, pauser);
    }

    /**
     * @notice Canonical activity identity shared with the A2.1 verifier.
     * @dev IMPORTANT: sourceLogIndex is uint256 here because A2.1 hashes
     *      abi.encode(uint256, bytes32, uint256, bytes32). Changing the Solidity
     *      type would change the ABI encoding and therefore the activityId.
     */
    function computeActivityId(
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        uint256 sourceLogIndex,
        bytes32 actionType
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceChainId, sourceTxHash, sourceLogIndex, actionType));
    }

    /**
     * @notice Enforce admin/attester identity separation for future role changes too.
     */
    function grantRole(bytes32 role, address account) public override {
        if (
            (role == ATTESTER_ROLE && hasRole(DEFAULT_ADMIN_ROLE, account)) ||
            (role == DEFAULT_ADMIN_ROLE && hasRole(ATTESTER_ROLE, account))
        ) {
            revert AdminAttesterMustDiffer();
        }
        super.grantRole(role, account);
    }

    function isRecorded(bytes32 activityId) external view returns (bool) {
        return _recorded[activityId];
    }

    function getActivity(bytes32 activityId) external view returns (Activity memory) {
        if (!_recorded[activityId]) revert UnknownActivity(activityId);
        return _activities[activityId];
    }

    /**
     * @notice Anchor one already-verified activity record.
     * @dev amount may be zero because the registry is generic evidence storage;
     *      economic qualification belongs to the campaign/reward engine.
     */
    function recordActivity(Activity calldata a)
        external
        onlyRole(ATTESTER_ROLE)
        whenNotPaused
        returns (bytes32 activityId)
    {
        if (a.user == address(0)) revert ZeroAddress();
        if (a.actionType == bytes32(0)) revert ZeroActionType();
        if (a.sourceChainId == 0) revert ZeroSourceChainId();
        if (a.sourceTxHash == bytes32(0)) revert ZeroSourceTxHash();

        activityId = computeActivityId(
            a.sourceChainId,
            a.sourceTxHash,
            a.sourceLogIndex,
            a.actionType
        );
        if (_recorded[activityId]) revert DuplicateActivity(activityId);

        // Effects first. There are no external calls in this function.
        _recorded[activityId] = true;
        _activities[activityId] = a;

        emit ActivityRecorded(
            activityId,
            a.user,
            a.actionType,
            a.sourceChainId,
            a.sourceTxHash,
            a.sourceLogIndex,
            a.amount,
            a.campaignId,
            a.intentHash,
            a.observedAt
        );
    }

    /// @notice Emergency stop for NEW attestations only.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume attestations. Kept under DEFAULT_ADMIN_ROLE intentionally.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
