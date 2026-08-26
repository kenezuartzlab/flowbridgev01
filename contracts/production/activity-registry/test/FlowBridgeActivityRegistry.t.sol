// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlowBridgeActivityRegistry} from "../contracts/FlowBridgeActivityRegistry.sol";

contract RegistryActor {
    function record(
        FlowBridgeActivityRegistry registry,
        FlowBridgeActivityRegistry.Activity calldata a
    ) external returns (bytes32) {
        return registry.recordActivity(a);
    }

    function pause(FlowBridgeActivityRegistry registry) external {
        registry.pause();
    }

    function unpause(FlowBridgeActivityRegistry registry) external {
        registry.unpause();
    }
}

contract FlowBridgeActivityRegistryTest {
    FlowBridgeActivityRegistry internal registry;
    RegistryActor internal attester;
    RegistryActor internal pauser;
    RegistryActor internal outsider;

    bytes32 internal constant ACTION_BRIDGE_SUBMITTED = keccak256("BRIDGE_SUBMITTED");
    bytes32 internal constant ACTION_SWAP = keccak256("SWAP");
    bytes32 internal constant TX_HASH = bytes32(uint256(0x1234));
    bytes32 internal constant CAMPAIGN_ID = bytes32(uint256(0xCA11));
    bytes32 internal constant INTENT_HASH = bytes32(uint256(0x1A2B));

    function setUp() public {
        attester = new RegistryActor();
        pauser = new RegistryActor();
        outsider = new RegistryActor();
        registry = new FlowBridgeActivityRegistry(address(this), address(attester), address(pauser));
    }

    function _activity() internal pure returns (FlowBridgeActivityRegistry.Activity memory a) {
        a = FlowBridgeActivityRegistry.Activity({
            user: address(0xBEEF),
            actionType: ACTION_BRIDGE_SUBMITTED,
            sourceChainId: 97,
            sourceTxHash: TX_HASH,
            sourceLogIndex: 7,
            amount: 10_500_000_000_000_000_000,
            campaignId: CAMPAIGN_ID,
            intentHash: INTENT_HASH,
            observedAt: 1_786_000_000
        });
    }

    function _expectConstructorRevert(address admin, address attest, address pause_) internal {
        bool reverted;
        try new FlowBridgeActivityRegistry(admin, attest, pause_) returns (FlowBridgeActivityRegistry) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "constructor should revert");
    }

    function _expectRecordRevert(RegistryActor actor, FlowBridgeActivityRegistry.Activity memory a) internal {
        bool reverted;
        try actor.record(registry, a) returns (bytes32) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "record should revert");
    }

    function testConstructorRejectsZeroAdmin() public {
        _expectConstructorRevert(address(0), address(attester), address(pauser));
    }

    function testConstructorRejectsZeroAttester() public {
        _expectConstructorRevert(address(this), address(0), address(pauser));
    }

    function testConstructorRejectsZeroPauser() public {
        _expectConstructorRevert(address(this), address(attester), address(0));
    }

    function testConstructorRejectsAdminEqualAttester() public {
        _expectConstructorRevert(address(this), address(this), address(pauser));
    }

    function testAuthorizedAttesterRecordsAndReadsExactFields() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bytes32 id = attester.record(registry, a);
        require(registry.isRecorded(id), "recorded flag false");

        FlowBridgeActivityRegistry.Activity memory stored = registry.getActivity(id);
        require(stored.user == a.user, "user mismatch");
        require(stored.actionType == a.actionType, "action mismatch");
        require(stored.sourceChainId == a.sourceChainId, "chain mismatch");
        require(stored.sourceTxHash == a.sourceTxHash, "tx mismatch");
        require(stored.sourceLogIndex == a.sourceLogIndex, "log mismatch");
        require(stored.amount == a.amount, "amount mismatch");
        require(stored.campaignId == a.campaignId, "campaign mismatch");
        require(stored.intentHash == a.intentHash, "intent mismatch");
        require(stored.observedAt == a.observedAt, "observedAt mismatch");
    }

    function testComputeActivityIdUsesCanonicalAbiEncodeFormula() public view {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bytes32 expected = keccak256(
            abi.encode(a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, a.actionType)
        );
        require(
            registry.computeActivityId(a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, a.actionType) == expected,
            "activityId formula mismatch"
        );
    }

    function testIntentHashDoesNotAffectActivityId() public view {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bytes32 first = registry.computeActivityId(
            a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, a.actionType
        );
        // Intent hash is intentionally absent from computeActivityId.
        a.intentHash = bytes32(uint256(0xDEAD));
        bytes32 second = registry.computeActivityId(
            a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, a.actionType
        );
        require(first == second, "intentHash changed activityId");
    }

    function testDifferentLogIndexProducesDifferentId() public view {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bytes32 first = registry.computeActivityId(a.sourceChainId, a.sourceTxHash, 7, a.actionType);
        bytes32 second = registry.computeActivityId(a.sourceChainId, a.sourceTxHash, 8, a.actionType);
        require(first != second, "log index collision");
    }

    function testDifferentActionTypeProducesDifferentId() public view {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bytes32 first = registry.computeActivityId(a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, a.actionType);
        bytes32 second = registry.computeActivityId(a.sourceChainId, a.sourceTxHash, a.sourceLogIndex, ACTION_SWAP);
        require(first != second, "action type collision");
    }

    function testAdminCannotGrantItselfAttesterRole() public {
        bool reverted;
        try registry.grantRole(registry.ATTESTER_ROLE(), address(this)) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "admin unexpectedly became attester");
    }

    function testAttesterCannotBeGrantedAdminRole() public {
        bool reverted;
        try registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), address(attester)) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "attester unexpectedly became admin");
    }

    function testAdminWithoutAttesterRoleCannotRecord() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        bool reverted;
        try registry.recordActivity(a) returns (bytes32) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "admin unexpectedly recorded");
    }

    function testPauserWithoutAttesterRoleCannotRecord() public {
        _expectRecordRevert(pauser, _activity());
    }

    function testOutsiderCannotRecord() public {
        _expectRecordRevert(outsider, _activity());
    }

    function testDuplicateActivityRevertsAndOriginalRemains() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();

        uint256 originalAmount = a.amount;
        bytes32 originalIntentHash = a.intentHash;

        bytes32 id = attester.record(registry, a);

        // Create a fresh memory object. Do not use `changed = a`,
        // because memory-to-memory struct assignment aliases the same object.
        FlowBridgeActivityRegistry.Activity memory changed = _activity();
        changed.amount = originalAmount + 1;
        changed.intentHash = bytes32(uint256(0x9999));

        // amount and intentHash are evidence fields, not part of activityId,
        // so this still represents the same canonical activity and must revert.
        _expectRecordRevert(attester, changed);

        FlowBridgeActivityRegistry.Activity memory stored =
            registry.getActivity(id);

        require(stored.amount == originalAmount, "original amount changed");
        require(
            stored.intentHash == originalIntentHash,
            "original intent changed"
        );
    }

    function testZeroUserRejected() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.user = address(0);
        _expectRecordRevert(attester, a);
    }

    function testZeroActionTypeRejected() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.actionType = bytes32(0);
        _expectRecordRevert(attester, a);
    }

    function testZeroSourceChainRejected() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.sourceChainId = 0;
        _expectRecordRevert(attester, a);
    }

    function testZeroSourceTxHashRejected() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.sourceTxHash = bytes32(0);
        _expectRecordRevert(attester, a);
    }

    function testZeroAmountAllowed() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.amount = 0;
        bytes32 id = attester.record(registry, a);
        require(registry.getActivity(id).amount == 0, "zero amount not stored");
    }

    function testZeroCampaignIdAllowed() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.campaignId = bytes32(0);
        bytes32 id = attester.record(registry, a);
        require(registry.getActivity(id).campaignId == bytes32(0), "zero campaign not stored");
    }

    function testZeroIntentHashAllowedForGenericActivity() public {
        FlowBridgeActivityRegistry.Activity memory a = _activity();
        a.intentHash = bytes32(0);
        bytes32 id = attester.record(registry, a);
        require(registry.getActivity(id).intentHash == bytes32(0), "zero intent not stored");
    }

    function testPauserCanPauseAndPauseBlocksAttestation() public {
        pauser.pause(registry);
        require(registry.paused(), "not paused");
        _expectRecordRevert(attester, _activity());
    }

    function testPauserCannotUnpauseWithoutAdminRole() public {
        pauser.pause(registry);
        bool reverted;
        try pauser.unpause(registry) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "pauser unexpectedly unpaused");
        require(registry.paused(), "pause unexpectedly cleared");
    }

    function testAdminCanUnpauseAndRecordingResumes() public {
        pauser.pause(registry);
        registry.unpause();
        require(!registry.paused(), "still paused");
        bytes32 id = attester.record(registry, _activity());
        require(registry.isRecorded(id), "recording did not resume");
    }

    function testRevokedAttesterCanNoLongerRecord() public {
        registry.revokeRole(registry.ATTESTER_ROLE(), address(attester));
        _expectRecordRevert(attester, _activity());
    }

    function testUnknownGetActivityFailsClosed() public view {
        bool reverted;
        try registry.getActivity(bytes32(uint256(0xABC))) returns (FlowBridgeActivityRegistry.Activity memory) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "unknown activity returned zero struct");
    }
}
