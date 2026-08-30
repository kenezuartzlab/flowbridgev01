// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * FlowToken - fixed-supply FLOW ERC-20 for FlowBridge.
 *
 * Production rules:
 *  - Supply is minted exactly once in the constructor to the approved treasury.
 *  - No mint path exists after deployment.
 *  - No owner or admin role.
 *  - No ERC20Permit / EIP-712.
 *  - No burn extension.
 *  - No transfer tax, blacklist, rebasing, reflection, anti-sell logic,
 *    transfer hooks, or upgradeable proxy.
 *  - Standard ERC-20 transfers and allowances only.
 *
 * Name, symbol, treasury and supply remain explicit deployment inputs.
 */
contract FlowToken is ERC20 {
    error TreasuryZeroAddress();
    error SupplyZero();

    constructor(
        string memory name_,
        string memory symbol_,
        address treasury_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        if (treasury_ == address(0)) revert TreasuryZeroAddress();
        if (totalSupply_ == 0) revert SupplyZero();

        _mint(treasury_, totalSupply_);
    }

    /// @dev Standard FLOW precision, explicit for auditability.
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}