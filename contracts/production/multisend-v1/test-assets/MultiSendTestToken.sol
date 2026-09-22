// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Minimal, conventional ERC-20 used ONLY as a BOT Testnet rehearsal asset for
 * MultiSend V1. It is deliberately plain: no fee on transfer, no rebasing, no
 * hooks — so a rehearsal proves exact recipient credit and exact fee collection.
 * Never deployed to any mainnet and never referenced by product code.
 */
contract MultiSendTestToken {
    string public name = "FlowBridge MultiSend Test Token";
    string public symbol = "MSTT";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address initialHolder, uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[initialHolder] = initialSupply;
        emit Transfer(address(0), initialHolder, initialSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - value;
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        require(to != address(0), "ZERO_TO");
        uint256 balance = balanceOf[from];
        require(balance >= value, "BALANCE");
        balanceOf[from] = balance - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
