// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFlowStakingController {
    struct Product {
        bool active;
        uint32 lockSeconds;
        uint16 genesisAprBps;
        uint16 floorBps;
        uint16 targetBps;
        uint16 hardCapBps;
        uint256 minPrincipal;
    }

    // NOTE: the controller's public fixed-array getter encodes the index as
    // uint256; using uint8 here would compute the wrong selector.
    function products(uint256 productId)
        external
        view
        returns (bool active, uint32 lockSeconds, uint16 genesisAprBps, uint16 floorBps, uint16 targetBps, uint16 hardCapBps, uint256 minPrincipal);
    function tryConsumeGenesisBudget(uint256 amount) external returns (bool);
    function releaseGenesisBudget(uint256 amount) external;
    function tryConsumeStandardBudget(uint256 amount) external returns (bool);
    function releaseStandardBudget(uint256 amount) external;
}

interface IFlowStakingRewardTreasury {
    function reserveGenesis(uint256 amount) external;
    function releaseGenesis(uint256 amount) external;
    function reserveFloor(uint256 amount) external;
    function releaseFloor(uint256 amount) external;
    function accrueFromGenesis(uint256 amount) external;
    function accrueFromFloor(uint256 amount) external;
    function accrueFromCommitted(uint256 amount) external;
    function payOut(address to, uint256 amount) external;
    function commitEpoch(uint256 amount) external;
    function reconcileEpoch(uint256 unused) external;
}

/**
 * FlowStakingVaultV2 — non-upgradeable production-candidate FLOW staking.
 *
 * Products (bounds live in FlowStakingController):
 *   Flexible | Lock 30D | Lock 90D | Lock 180D | Lock 365D.
 *
 * Reward tiers per position:
 *   1. Genesis window  — capped at 90 reward-days lifetime per wallet
 *      (anti-reset: withdraw/redeposit/churn never restores quota), reserved
 *      in full at entry or the position is explicitly repriced to standard.
 *   2. Locked floor    — reserved in full at entry for locked products, or
 *      entry reverts (never diluted, never retroactively reduced).
 *   3. Variable        — weekly controller-published epochs via per-product
 *      stake-time accumulators; unused commitment returns to free inventory.
 *
 * Invariants:
 *   V1. Principal is exact: withdraw() returns exactly principal; no slashing,
 *       no confiscation path, no upgrade path.
 *   V2. Rewards pay only from the segregated treasury; principal in this
 *       contract is never classified as reward inventory.
 *   V3. Reserved obligations are immutable while a position is open; closing
 *       releases only the provably unvested remainder.
 *   V4. Mature principal withdrawal works even while paused.
 *   V5. No early exit for locked products; flexible exits anytime.
 */
contract FlowStakingVaultV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant EPOCH_ROLE = keccak256("EPOCH_ROLE"); // controller

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant PRODUCT_COUNT = 5;
    uint256 public constant GENESIS_MAX_SECONDS = 90 days;
    uint256 public constant MAX_POSITIONS_PER_WALLET = 32;

    IERC20 public immutable token;
    IFlowStakingController public immutable controller;
    IFlowStakingRewardTreasury public immutable treasury;

    struct Position {
        address owner;
        uint8 productId;
        uint96 status; // 0 open, 1 closed
        uint256 principal;
        uint40 openedAt;
        uint40 maturityAt;    // 0 for flexible
        uint40 genesisEndAt;  // 0 when repriced to standard / quota exhausted
        uint16 genesisRateBps;
        uint16 floorRateBps;
        uint256 genesisReserved; // original genesis obligation
        uint256 genesisAccrued;  // cumulative genesis moved to claimable
        uint256 floorReserved;
        uint256 floorAccrued;
        uint256 varPaid;         // variable accumulator snapshot (1e18-scaled)
        uint256 pending;         // accrued, unclaimed
        uint40 lastAccrualAt;
    }

    uint256 public nextPositionId; // ids start at 1
    mapping(uint256 => Position) internal _positions;
    mapping(address => uint256[]) public positionsOf;
    mapping(address => uint256) public genesisSecondsConsumed; // lifetime lineage

    uint256 public totalPrincipal;
    mapping(uint8 => uint256) public totalStakedByProduct;

    // Variable epoch accumulator state (per product).
    mapping(uint8 => uint256) public varPerTokenStored; // 1e18-scaled
    mapping(uint8 => uint256) public currentFlowPerSecond;
    uint256 public currentEpochEnd;
    uint256 public lastVarUpdate;
    uint256 public currentEpochCommitted;
    uint256 public currentEpochMoved; // variable already moved to accrued at claims

    event PositionOpened(uint256 indexed positionId, address indexed owner, uint8 productId, uint256 principal, uint16 genesisRateBps, uint16 floorRateBps, uint40 genesisEndAt, uint40 maturityAt, bool genesisApplied);
    event RewardsClaimed(uint256 indexed positionId, address indexed owner, uint256 amount);
    event PositionClosed(uint256 indexed positionId, address indexed owner, uint256 principalReturned, uint256 genesisReleased, uint256 floorReleased);
    event EpochApplied(uint256 duration, uint256 committed, uint256 unused);

    error ZeroAmount();
    error InvalidProduct();
    error ProductInactive();
    error BelowMinPrincipal();
    error NotPositionOwner();
    error PositionNotOpen();
    error PositionLocked();
    error NothingToClaim();
    error TooManyPositions();
    error FloorNotReservable();
    error NotController();
    error EpochStillActive();
    error BadEpochInput();

    constructor(address token_, address controller_, address treasury_, address admin) {
        if (token_ == address(0) || controller_ == address(0) || treasury_ == address(0) || admin == address(0)) {
            revert InvalidProduct();
        }
        token = IERC20(token_);
        controller = IFlowStakingController(controller_);
        treasury = IFlowStakingRewardTreasury(treasury_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ------------------------------------------------------------- views

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    function positionCountOf(address owner) external view returns (uint256) {
        return positionsOf[owner].length;
    }

    /// Genesis seconds still available to this wallet (lifetime lineage).
    function genesisQuotaRemainingSeconds(address owner) public view returns (uint256) {
        uint256 used = genesisSecondsConsumed[owner];
        return used >= GENESIS_MAX_SECONDS ? 0 : GENESIS_MAX_SECONDS - used;
    }

    /// What openPosition() would grant — UI must quote BEFORE the user commits.
    function quoteOpen(uint8 productId, address owner, uint256 principal)
        external
        view
        returns (uint16 genesisRateBps, uint40 genesisSeconds, uint256 genesisObligation, uint16 floorRateBps, uint256 floorObligation)
    {
        (bool active, uint32 lockSeconds, uint16 gApr, uint16 floor, , , uint256 minP) = controller.products(productId);
        if (!active || principal < minP) return (0, 0, 0, 0, 0);
        floorRateBps = floor;
        if (lockSeconds > 0) {
            floorObligation = (principal * floor * lockSeconds) / (BPS * YEAR);
        }
        uint256 remaining = genesisQuotaRemainingSeconds(owner);
        uint256 window = lockSeconds == 0 ? GENESIS_MAX_SECONDS : uint256(lockSeconds);
        if (window > GENESIS_MAX_SECONDS) window = GENESIS_MAX_SECONDS;
        genesisSeconds = uint40(window < remaining ? window : remaining);
        if (genesisSeconds > 0) {
            genesisRateBps = gApr;
            genesisObligation = (principal * gApr * genesisSeconds) / (BPS * YEAR);
        }
    }

    function previewPending(uint256 positionId) public view returns (uint256) {
        Position memory p = _positions[positionId];
        if (p.owner == address(0)) return 0;
        (uint256 g, uint256 f, uint256 v, ) = _accrualDelta(p);
        return p.pending + g + f + v;
    }

    function _accrualDelta(Position memory p) internal view returns (uint256 g, uint256 f, uint256 v, uint40 nowC) {
        if (p.status != 0) return (0, 0, 0, 0);
        uint40 end = p.maturityAt == 0 ? uint40(block.timestamp) : p.maturityAt;
        nowC = uint40(block.timestamp) < end ? uint40(block.timestamp) : end;
        if (nowC <= p.lastAccrualAt) return (0, 0, 0, nowC);
        uint256 dt = nowC - p.lastAccrualAt;

        if (p.genesisRateBps > 0 && p.lastAccrualAt < p.genesisEndAt) {
            uint256 gEnd = nowC < p.genesisEndAt ? nowC : p.genesisEndAt;
            uint256 gSecs = gEnd > p.lastAccrualAt ? gEnd - p.lastAccrualAt : 0;
            g = (p.principal * p.genesisRateBps * gSecs) / (BPS * YEAR);
        }
        if (p.floorRateBps > 0) {
            f = (p.principal * p.floorRateBps * dt) / (BPS * YEAR);
        }
        uint256 acc = varPerTokenStored[p.productId];
        if (acc > p.varPaid) {
            v = (p.principal * (acc - p.varPaid)) / 1e18;
        }
    }

    // --------------------------------------------------------- epoch engine

    /// Controller-only. Finalizes the outgoing epoch (global variable accrual,
    /// remainder returned to free inventory) and starts the next one.
    function settleVariableEpoch(uint8[] calldata productIds, uint256[] calldata flowPerSecond, uint256 duration)
        external
        nonReentrant
        returns (uint256 unused)
    {
        if (msg.sender != address(controller)) revert NotController();
        if (productIds.length != flowPerSecond.length) revert BadEpochInput();

        uint256 now_ = block.timestamp;
        uint256 elapsed = 0;
        if (lastVarUpdate != 0) {
            uint256 end = currentEpochEnd;
            uint256 upto = now_ < end ? now_ : end;
            if (upto > lastVarUpdate) elapsed = upto - lastVarUpdate;
        }

        uint256 globallyAccrued = 0;
        if (elapsed > 0) {
            for (uint8 pid; pid < PRODUCT_COUNT; ++pid) {
                uint256 fps = currentFlowPerSecond[pid];
                if (fps == 0) continue;
                uint256 staked = totalStakedByProduct[pid];
                uint256 earned = fps * elapsed;
                if (staked > 0) {
                    varPerTokenStored[pid] += (fps * elapsed * 1e18) / staked;
                    globallyAccrued += earned;
                }
                currentFlowPerSecond[pid] = 0;
            }
        }

        uint256 committed = currentEpochCommitted;
        if (committed > 0) {
            uint256 accrued = globallyAccrued > committed ? committed : globallyAccrued;
            uint256 outstanding = accrued > currentEpochMoved ? accrued - currentEpochMoved : 0;
            if (outstanding > 0) treasury.accrueFromCommitted(outstanding);
            unused = committed - accrued;
            if (unused > 0) treasury.reconcileEpoch(unused);
        }

        // Start the next epoch (empty arrays simply close the current one).
        uint256 newCommitted = 0;
        for (uint256 i; i < productIds.length; ++i) {
            if (productIds[i] >= PRODUCT_COUNT) revert BadEpochInput();
            currentFlowPerSecond[productIds[i]] = flowPerSecond[i];
            newCommitted += flowPerSecond[i] * duration;
        }
        if (newCommitted > 0) treasury.commitEpoch(newCommitted);
        currentEpochCommitted = newCommitted;
        currentEpochMoved = 0;
        lastVarUpdate = now_;
        currentEpochEnd = duration == 0 ? now_ : now_ + duration;
        emit EpochApplied(duration, newCommitted, unused);
    }

    // --------------------------------------------------------- user paths

    function openPosition(uint8 productId, uint256 principal) external nonReentrant whenNotPaused returns (uint256 positionId) {
        if (principal == 0) revert ZeroAmount();
        if (productId >= PRODUCT_COUNT) revert InvalidProduct();
        if (positionsOf[msg.sender].length >= MAX_POSITIONS_PER_WALLET) revert TooManyPositions();

        (bool active, uint32 lockSeconds, uint16 gApr, uint16 floor, , , uint256 minP) = controller.products(productId);
        if (!active) revert ProductInactive();
        if (principal < minP) revert BelowMinPrincipal();

        // Floor: locked products reserve the full obligation at entry or revert.
        uint256 floorObligation = 0;
        if (lockSeconds > 0) {
            floorObligation = (principal * floor * lockSeconds) / (BPS * YEAR);
            if (floorObligation == 0) revert FloorNotReservable();
            if (!controller.tryConsumeStandardBudget(floorObligation)) revert FloorNotReservable();
            treasury.reserveFloor(floorObligation);
        }

        // Genesis: granted only within lifetime quota and Year-1 capacity;
        // otherwise the position is explicitly repriced to standard (event).
        uint256 remaining = genesisQuotaRemainingSeconds(msg.sender);
        uint256 window = lockSeconds == 0 ? GENESIS_MAX_SECONDS : uint256(lockSeconds);
        if (window > GENESIS_MAX_SECONDS) window = GENESIS_MAX_SECONDS;
        uint256 grant = window < remaining ? window : remaining;
        uint256 genesisObligation = grant == 0 ? 0 : (principal * gApr * grant) / (BPS * YEAR);
        uint16 appliedGenesisBps = 0;
        uint40 genesisEndAt = 0;
        if (genesisObligation > 0 && controller.tryConsumeGenesisBudget(genesisObligation)) {
            // Capacity approved; funding must cover it too, else reprice.
            try treasury.reserveGenesis(genesisObligation) {
                appliedGenesisBps = gApr;
                genesisEndAt = uint40(block.timestamp + grant);
            } catch {
                controller.releaseGenesisBudget(genesisObligation);
                genesisObligation = 0;
            }
        } else {
            genesisObligation = 0;
        }

        positionId = ++nextPositionId;
        Position storage p = _positions[positionId];
        p.owner = msg.sender;
        p.productId = productId;
        p.principal = principal;
        p.openedAt = uint40(block.timestamp);
        p.maturityAt = lockSeconds == 0 ? 0 : uint40(block.timestamp + lockSeconds);
        p.genesisRateBps = appliedGenesisBps;
        p.genesisEndAt = genesisEndAt;
        p.genesisReserved = genesisObligation;
        p.floorRateBps = floor;
        p.floorReserved = floorObligation;
        p.varPaid = varPerTokenStored[productId];
        p.lastAccrualAt = uint40(block.timestamp);

        positionsOf[msg.sender].push(positionId);
        totalPrincipal += principal;
        totalStakedByProduct[productId] += principal;

        token.safeTransferFrom(msg.sender, address(this), principal);
        emit PositionOpened(positionId, msg.sender, productId, principal, appliedGenesisBps, floor, genesisEndAt, p.maturityAt, appliedGenesisBps > 0);
    }

    function _settle(uint256 positionId) internal returns (Position storage p, uint256 g, uint256 f, uint256 v) {
        p = _positions[positionId];
        if (p.owner != msg.sender) revert NotPositionOwner();
        uint40 nowC;
        (g, f, v, nowC) = _accrualDelta(p);
        if (g > 0) {
            treasury.accrueFromGenesis(g);
            p.genesisAccrued += g;
            uint256 gSecs = ((nowC < p.genesisEndAt ? nowC : p.genesisEndAt) - p.lastAccrualAt);
            genesisSecondsConsumed[msg.sender] += gSecs;
        }
        if (f > 0) {
            treasury.accrueFromFloor(f);
            p.floorAccrued += f;
        }
        if (v > 0) {
            treasury.accrueFromCommitted(v);
            currentEpochMoved += v;
        }
        p.pending += g + f + v;
        p.varPaid = varPerTokenStored[p.productId];
        p.lastAccrualAt = nowC;
    }

    /// Claims only EARNED rewards from the segregated treasury. Repeated
    /// claims return zero and revert; principal is never touched.
    function claim(uint256 positionId) external nonReentrant whenNotPaused {
        (Position storage p, , , ) = _settle(positionId);
        uint256 amount = p.pending;
        if (amount == 0) revert NothingToClaim();
        p.pending = 0;
        treasury.payOut(msg.sender, amount);
        emit RewardsClaimed(positionId, msg.sender, amount);
    }

    /// Exact principal return. Flexible: anytime. Locked: at/after maturity.
    /// Deliberately available while paused (V4). No early exit (V5).
    function withdraw(uint256 positionId) public nonReentrant {
        (Position storage p, , , ) = _settle(positionId);
        if (p.status != 0) revert PositionNotOpen();
        if (p.maturityAt != 0 && block.timestamp < p.maturityAt) revert PositionLocked();

        p.status = 1;
        uint256 principal = p.principal;
        totalPrincipal -= principal;
        totalStakedByProduct[p.productId] -= principal;

        // Release only provably unvested reservations (V3).
        uint256 gRelease = p.genesisReserved > p.genesisAccrued ? p.genesisReserved - p.genesisAccrued : 0;
        if (gRelease > 0) {
            treasury.releaseGenesis(gRelease);
            controller.releaseGenesisBudget(gRelease);
        }
        uint256 fRelease = p.floorReserved > p.floorAccrued ? p.floorReserved - p.floorAccrued : 0;
        if (fRelease > 0) {
            treasury.releaseFloor(fRelease);
            controller.releaseStandardBudget(fRelease);
        }

        token.safeTransfer(msg.sender, principal);
        emit PositionClosed(positionId, msg.sender, principal, gRelease, fRelease);
    }

    // ------------------------------------------------------------ admin

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
