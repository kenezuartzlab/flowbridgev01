// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IFlowReferenceOracle {
    /// Minimal production reference interface. A compliant adapter must expose
    /// a 7-day TWAP-derived USD reference (8 decimals), last update timestamp,
    /// an observed liquidity depth metric (USD, 8 decimals) and the short-term
    /// deviation of spot vs the reference (basis points).
    function latestReference()
        external
        view
        returns (uint256 priceUsd8, uint256 updatedAt, uint256 liquidityUsd8, uint256 deviationBps);
}

interface IFlowStakingVaultV2View {
    function totalStakedByProduct(uint8 productId) external view returns (uint256);
    function settleVariableEpoch(uint8[] calldata productIds, uint256[] calldata flowPerSecond, uint256 duration)
        external
        returns (uint256 unused);
}

/**
 * FlowStakingController — bounded economic authority for Staking v2.
 *
 * It can ONLY act inside governor-approved bounds: product rate bounds,
 * Year-1 budget ceilings, maxFlowPerEpoch, oracle freshness/liquidity/
 * deviation gates and a ±10%/week rate guard. It cannot mint FLOW, cannot
 * move principal, cannot reduce earned/reserved rewards retroactively, and
 * without a healthy reference oracle it cannot publish a variable epoch —
 * the dynamic-rate path is then BLOCKED by construction.
 *
 * Product matrix (BPS = 1e4; 365-day year):
 *   id  name        lock      genesisApr  floor  target  hardCap
 *   0   Flexible    none      18%         0%     10%     12%
 *   1   Lock 30D    30 days   27%         8%     14%     18%
 *   2   Lock 90D    90 days   36%         10%    18%     24%
 *   3   Lock 180D   180 days  48%         12%    24%     32%
 *   4   Lock 365D   365 days  60%         15%    30%     40%
 *
 * Year-1 ceilings (enforced on reservations + commitments):
 *   genesis <= 1,000,000 FLOW; standard (floors + variable) <= 2,000,000 FLOW;
 *   total <= 3,000,000 FLOW.
 */
contract FlowStakingController is AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant EPOCH = 7 days;
    uint256 public constant PRODUCT_COUNT = 5;
    uint256 public constant GENESIS_MAX_SECONDS = 90 days;

    uint256 public constant GENESIS_YEAR1_CAP = 1_000_000 ether;
    uint256 public constant STANDARD_YEAR1_CAP = 2_000_000 ether;
    uint256 public constant TOTAL_YEAR1_CAP = 3_000_000 ether;

    struct Product {
        bool active;
        uint32 lockSeconds;
        uint16 genesisAprBps;
        uint16 floorBps;
        uint16 targetBps;
        uint16 hardCapBps;
        uint256 minPrincipal;
    }

    /// Reference health gates (governor-tunable within reason).
    struct OraclePolicy {
        uint256 maxStalenessSeconds;
        uint256 minLiquidityUsd8;
        uint256 maxDeviationBps;
    }

    Product[5] public products;
    OraclePolicy public oraclePolicy;
    IFlowReferenceOracle public oracle;
    IFlowStakingVaultV2View public vault;

    /// Governor-approved weekly USD reward budget (8 decimals) that the oracle
    /// reference converts into FLOW. Bounded by maxFlowPerEpoch + Year-1 caps.
    uint256 public weeklyUsdBudget8;
    uint256 public maxFlowPerEpoch;

    uint256 public immutable year1Start;
    uint256 public genesisYear1Used;
    uint256 public standardYear1Used;

    /// Active variable epoch.
    uint256 public epochEnd;
    uint256 public epochCommitted;
    uint256 public prevImpliedVarBps; // blended implied variable rate of prior epoch
    bool public emergencyMode;

    event ProductConfigured(uint8 indexed productId, uint32 lockSeconds, uint16 genesisAprBps, uint16 floorBps, uint16 targetBps, uint16 hardCapBps, uint256 minPrincipal);
    event OracleUpdated(address indexed oracle);
    event OraclePolicyUpdated(uint256 maxStalenessSeconds, uint256 minLiquidityUsd8, uint256 maxDeviationBps);
    event BudgetConfigured(uint256 weeklyUsdBudget8, uint256 maxFlowPerEpoch);
    event EpochPublished(uint256 indexed epochIndex, uint256 budgetFlow, uint256 impliedVarBps, uint256 epochEnd);
    event EpochSettled(uint256 indexed epochIndex, uint256 unused);
    event EmergencyModeSet(bool enabled);
    event GenesisBudgetConsumed(uint256 amount, uint256 genesisYear1Used);
    event GenesisBudgetReleased(uint256 amount, uint256 genesisYear1Used);
    event StandardBudgetConsumed(uint256 amount, uint256 standardYear1Used);
    event StandardBudgetReleased(uint256 amount, uint256 standardYear1Used);

    error ZeroAddress();
    error ZeroAmount();
    error InvalidProduct();
    error InvalidBounds();
    error EpochActive();
    error NoActiveEpoch();
    error OracleNotConfigured();
    error OracleStale();
    error OracleInsufficientLiquidity();
    error OracleDeviationTooHigh();
    error EpochBudgetExceedsMaxFlow();
    error Year1CapExceeded();
    error RateGuardBreached();
    error NotVault();

    constructor(address admin, address governor, address publisher) {
        if (admin == address(0) || governor == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, governor);
        if (publisher != address(0)) _grantRole(PUBLISHER_ROLE, publisher);
        year1Start = block.timestamp;

        // Canonical product matrix (governor may tighten, never exceed hard cap
        // or reduce reserved/earned rewards — bounds are validated on change).
        _setProduct(0, 0,            1800, 0,    1000, 1200, 1 ether);   // Flexible
        _setProduct(1, 30 days,      2700, 800,  1400, 1800, 1 ether);   // Lock 30D
        _setProduct(2, 90 days,      3600, 1000, 1800, 2400, 1 ether);   // Lock 90D
        _setProduct(3, 180 days,     4800, 1200, 2400, 3200, 1 ether);   // Lock 180D
        _setProduct(4, 365 days,     6000, 1500, 3000, 4000, 1 ether);   // Lock 365D

        oraclePolicy = OraclePolicy({
            maxStalenessSeconds: 2 hours,
            minLiquidityUsd8: 0, // governor MUST set before enabling epochs
            maxDeviationBps: 500
        });
    }

    // ------------------------------------------------------------ governance

    function configureProduct(
        uint8 productId,
        uint32 lockSeconds,
        uint16 genesisAprBps,
        uint16 floorBps,
        uint16 targetBps,
        uint16 hardCapBps,
        uint256 minPrincipal
    ) external onlyRole(GOVERNOR_ROLE) {
        _validateBounds(lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps);
        _setProduct(productId, lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal);
    }

    function _setProduct(uint8 id, uint32 lockSeconds, uint16 g, uint16 f, uint16 t, uint16 cap, uint256 minP) internal {
        _validateBounds(lockSeconds, g, f, t, cap);
        products[id] = Product({active: true, lockSeconds: lockSeconds, genesisAprBps: g, floorBps: f, targetBps: t, hardCapBps: cap, minPrincipal: minP});
        emit ProductConfigured(id, lockSeconds, g, f, t, cap, minP);
    }

    function _validateBounds(uint32 lockSeconds, uint16 g, uint16 f, uint16 t, uint16 cap) internal pure {
        if (cap > 10_000 || t > cap || f > cap) revert InvalidBounds();
        if (lockSeconds == 0 && f != 0) revert InvalidBounds(); // flexible: no floor
        if (lockSeconds > 0 && f == 0) revert InvalidBounds();  // locked: floor required
        if (g > cap + 2_000) revert InvalidBounds();            // genesis band sanity
        if (lockSeconds > 365 days) revert InvalidBounds();
    }

    function setOracle(address oracle_) external onlyRole(GOVERNOR_ROLE) {
        oracle = IFlowReferenceOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setOraclePolicy(uint256 maxStalenessSeconds, uint256 minLiquidityUsd8, uint256 maxDeviationBps)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        oraclePolicy = OraclePolicy({maxStalenessSeconds: maxStalenessSeconds, minLiquidityUsd8: minLiquidityUsd8, maxDeviationBps: maxDeviationBps});
        emit OraclePolicyUpdated(maxStalenessSeconds, minLiquidityUsd8, maxDeviationBps);
    }

    function setBudgets(uint256 weeklyUsdBudget8_, uint256 maxFlowPerEpoch_) external onlyRole(GOVERNOR_ROLE) {
        weeklyUsdBudget8 = weeklyUsdBudget8_;
        maxFlowPerEpoch = maxFlowPerEpoch_;
        emit BudgetConfigured(weeklyUsdBudget8_, maxFlowPerEpoch_);
    }

    function setVault(address vault_) external onlyRole(GOVERNOR_ROLE) {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = IFlowStakingVaultV2View(vault_);
    }

    function setEmergencyMode(bool enabled) external onlyRole(GOVERNOR_ROLE) {
        emergencyMode = enabled;
        emit EmergencyModeSet(enabled);
    }

    // --------------------------------------------------- budget accounting

    modifier onlyVault() {
        if (msg.sender != address(vault)) revert NotVault();
        _;
    }

    function _consumeGenesis(uint256 amount) internal {
        uint256 g = genesisYear1Used + amount;
        uint256 s = standardYear1Used;
        if (g > GENESIS_YEAR1_CAP || g + s > TOTAL_YEAR1_CAP) revert Year1CapExceeded();
        genesisYear1Used = g;
        emit GenesisBudgetConsumed(amount, g);
    }

    function _releaseGenesis(uint256 amount) internal {
        uint256 g = genesisYear1Used;
        g = amount > g ? 0 : g - amount;
        genesisYear1Used = g;
        emit GenesisBudgetReleased(amount, g);
    }

    function _consumeStandard(uint256 amount) internal {
        uint256 s = standardYear1Used + amount;
        uint256 g = genesisYear1Used;
        if (s > STANDARD_YEAR1_CAP || g + s > TOTAL_YEAR1_CAP) revert Year1CapExceeded();
        standardYear1Used = s;
        emit StandardBudgetConsumed(amount, s);
    }

    function _releaseStandard(uint256 amount) internal {
        uint256 s = standardYear1Used;
        s = amount > s ? 0 : s - amount;
        standardYear1Used = s;
        emit StandardBudgetReleased(amount, s);
    }

    /// Vault reserves a Genesis obligation; returns false (reprice path)
    /// instead of reverting when Year-1 genesis capacity is exhausted.
    function tryConsumeGenesisBudget(uint256 amount) external onlyVault returns (bool) {
        if (genesisYear1Used + amount > GENESIS_YEAR1_CAP) return false;
        if (genesisYear1Used + standardYear1Used + amount > TOTAL_YEAR1_CAP) return false;
        _consumeGenesis(amount);
        return true;
    }

    function releaseGenesisBudget(uint256 amount) external onlyVault {
        _releaseGenesis(amount);
    }

    function tryConsumeStandardBudget(uint256 amount) external onlyVault returns (bool) {
        if (standardYear1Used + amount > STANDARD_YEAR1_CAP) return false;
        if (genesisYear1Used + standardYear1Used + amount > TOTAL_YEAR1_CAP) return false;
        _consumeStandard(amount);
        return true;
    }

    function releaseStandardBudget(uint256 amount) external onlyVault {
        _releaseStandard(amount);
    }

    // ------------------------------------------------------- epoch engine

    /// Honest controller status for UI/AI: the dynamic path is BLOCKED unless
    /// a healthy production reference oracle is configured and reporting.
    function referenceHealthy() public view returns (bool ok, uint8 reasonCode) {
        if (address(oracle) == address(0)) return (false, 1); // not configured
        (uint256 price, uint256 updatedAt, uint256 liquidity, uint256 deviation) = oracle.latestReference();
        if (price == 0) return (false, 2);
        if (block.timestamp - updatedAt > oraclePolicy.maxStalenessSeconds) return (false, 3); // stale
        if (liquidity < oraclePolicy.minLiquidityUsd8) return (false, 4);
        if (deviation > oraclePolicy.maxDeviationBps) return (false, 5);
        return (true, 0);
    }

    /// FLOW budget for the next epoch, clamped by maxFlowPerEpoch and the
    /// remaining Year-1 standard capacity. Reverts when the reference is
    /// unhealthy — fail-closed, never invent a price.
    function quoteEpochBudget() public view returns (uint256 flowBudget) {
        (bool ok, uint8 code) = referenceHealthy();
        if (!ok) {
            if (code == 1) revert OracleNotConfigured();
            if (code == 3) revert OracleStale();
            if (code == 4) revert OracleInsufficientLiquidity();
            if (code == 5) revert OracleDeviationTooHigh();
            revert OracleNotConfigured();
        }
        (uint256 price, , , ) = oracle.latestReference();
        flowBudget = (weeklyUsdBudget8 * 1e18) / price; // 8dp USD * 1e18 / 8dp USD-per-FLOW
        if (flowBudget > maxFlowPerEpoch && maxFlowPerEpoch != 0) flowBudget = maxFlowPerEpoch;
        uint256 standardRemaining = STANDARD_YEAR1_CAP - standardYear1Used;
        uint256 totalRemaining = TOTAL_YEAR1_CAP - genesisYear1Used - standardYear1Used;
        uint256 cap = standardRemaining < totalRemaining ? standardRemaining : totalRemaining;
        if (flowBudget > cap) flowBudget = cap;
    }

    /**
     * Publish the weekly variable epoch. `flowPerSecond` splits the budget
     * across products. Reverts when a previous epoch is unsettled, when the
     * oracle reference is unhealthy, when the budget exceeds maxFlowPerEpoch
     * or Year-1 capacity, when any implied product rate breaches the hard
     * cap, or when the blended rate moves >10% week-over-week (unless the
     * governor explicitly enabled emergency mode).
     */
    function publishEpoch(uint8[] calldata productIds, uint256[] calldata flowPerSecond)
        external
        onlyRole(PUBLISHER_ROLE)
        returns (uint256 budget)
    {
        if (productIds.length == 0 || productIds.length != flowPerSecond.length || productIds.length > PRODUCT_COUNT) revert InvalidProduct();
        if (block.timestamp < epochEnd) revert EpochActive();

        budget = quoteEpochBudget(); // fail-closed on unhealthy reference
        uint256 offered = 0;
        uint256 blended = 0;
        uint256 totalStakedAll = 0;
        for (uint256 i; i < productIds.length; ++i) {
            uint8 pid = productIds[i];
            if (pid >= PRODUCT_COUNT) revert InvalidProduct();
            Product memory p = products[pid];
            uint256 staked = vault.totalStakedByProduct(pid);
            offered += flowPerSecond[i];
            if (staked > 0 && flowPerSecond[i] > 0) {
                uint256 impliedBps = (flowPerSecond[i] * YEAR * BPS) / staked;
                // Worst-case band: reserved genesis + floor + variable <= hard cap.
                if (p.genesisAprBps + p.floorBps + impliedBps > uint256(p.hardCapBps) + uint256(p.genesisAprBps)) {
                    // genesis replaces standard band; the enforceable rule is
                    // floor + variable <= hardCap.
                    if (p.floorBps + impliedBps > p.hardCapBps) revert RateGuardBreached();
                }
                blended += impliedBps * staked;
                totalStakedAll += staked;
            }
        }
        if (offered == 0) revert ZeroAmount();
        if (offered * EPOCH > budget) revert EpochBudgetExceedsMaxFlow();

        uint256 blendedBps = totalStakedAll > 0 ? blended / totalStakedAll : 0;
        if (!emergencyMode && prevImpliedVarBps != 0 && blendedBps != 0) {
            uint256 prev = prevImpliedVarBps;
            uint256 hi = prev + prev / 10;
            uint256 lo = prev - prev / 10;
            if (blendedBps > hi || blendedBps < lo) revert RateGuardBreached();
        }

        _consumeStandard(offered * EPOCH);
        uint256 unused = vault.settleVariableEpoch(productIds, flowPerSecond, EPOCH);
        if (unused > 0) _releaseStandard(unused);

        epochEnd = block.timestamp + EPOCH;
        epochCommitted = offered * EPOCH - unused;
        if (blendedBps != 0) prevImpliedVarBps = blendedBps;
        emit EpochPublished(epochEnd / EPOCH, offered * EPOCH, blendedBps, epochEnd);
        budget = offered * EPOCH;
    }

    /// Close an ended epoch: any unaccrued commitment returns to free reward
    /// inventory and to Year-1 standard capacity (rounding / zero-staker time).
    function settleEpoch() external returns (uint256 unused) {
        if (block.timestamp < epochEnd) revert EpochActive();
        if (epochCommitted == 0) revert NoActiveEpoch();
        uint8[] memory none_ = new uint8[](0);
        uint256[] memory zero = new uint256[](0);
        unused = vault.settleVariableEpoch(none_, zero, 0);
        if (unused > 0) _releaseStandard(unused);
        epochCommitted = 0;
        emit EpochSettled(epochEnd / EPOCH, unused);
    }
}
