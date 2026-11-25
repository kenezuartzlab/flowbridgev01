// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
// TEST-ONLY. Port of BOT V4 "RouterIgnoringMin" adversary: pulls exact input, ignores amountOutMinimum, pays half.
interface IT { function transferFrom(address,address,uint) external returns(bool); function transfer(address,uint) external returns(bool); }
contract IgnoreMinRouter {
    struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint deadline; uint amountIn; uint amountOutMinimum; uint160 sqrtPriceLimitX96; }
    mapping(address=>uint) public rate; uint public lastMinimum;
    function setRate(address t,uint r) external {rate[t]=r;}
    function exactInputSingle(P calldata p) external payable returns(uint out) {
        lastMinimum=p.amountOutMinimum;
        require(IT(p.tokenIn).transferFrom(msg.sender,address(this),p.amountIn));
        out=p.amountIn*rate[p.tokenIn]/1e18/2; // ignores the floor on purpose
        require(IT(p.tokenOut).transfer(msg.sender,out));
    }
}
