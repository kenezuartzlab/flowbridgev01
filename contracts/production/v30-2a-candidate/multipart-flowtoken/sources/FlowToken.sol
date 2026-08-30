// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * FlowToken — fixed-supply FLOW ERC-20 for FlowBridge.
 *
 * V12 build gate rules:
 *  - Supply is minted EXACTLY ONCE in the constructor to the approved treasury.
 *  - There is no mint path after deployment (no owner, no minter role).
 *  - No transfer tax, blacklist, rebasing, reflection, anti-sell logic, hooks,
 *    or upgradeable proxy. Plain ERC-20 (+ ERC20Permit for gasless approvals).
 *  - Name / symbol / supply / treasury are DEPLOYMENT CONFIG inputs; this
 *    source hardcodes no economic values.
 *
 * The same source is intended for BOT Testnet (968) and, after explicit
 * approval, BOT Mainnet (677).
 */
contract FlowToken is ERC20, ERC20Permit {
    error TreasuryZeroAddress();
    error SupplyZero();

    constructor(
        string memory name_,
        string memory symbol_,
        address treasury_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        if (treasury_ == address(0)) revert TreasuryZeroAddress();
        if (totalSupply_ == 0) revert SupplyZero();
        _mint(treasury_, totalSupply_);
    }

    /// @dev Standard 18 decimals. Explicit for auditability.
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
