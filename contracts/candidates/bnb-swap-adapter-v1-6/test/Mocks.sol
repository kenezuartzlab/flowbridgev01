// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
// TEST-ONLY mocks. They are NOT the mainnet tokens/router; mainnet behaviour is proven separately (read-only eth_call evidence).
contract MockWBNB {
    mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance;
    function deposit() public payable { balanceOf[msg.sender]+=msg.value; }
    function withdraw(uint w) public { require(balanceOf[msg.sender]>=w); balanceOf[msg.sender]-=w; payable(msg.sender).transfer(w); }
    function approve(address g,uint w) public returns(bool){allowance[msg.sender][g]=w;return true;}
    function transfer(address d,uint w) public returns(bool){return transferFrom(msg.sender,d,w);}
    function transferFrom(address s,address d,uint w) public returns(bool){require(balanceOf[s]>=w); if(s!=msg.sender&&allowance[s][msg.sender]!=type(uint).max){require(allowance[s][msg.sender]>=w);allowance[s][msg.sender]-=w;} balanceOf[s]-=w;balanceOf[d]+=w;return true;}
}
contract MockUSDT {
    mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance;
    uint public feeOnTransfer; bool public returnFalse; mapping(address=>bool) public blocked;
    function mint(address a,uint n) external {balanceOf[a]+=n;}
    function setFee(uint f) external {feeOnTransfer=f;} function setReturnFalse(bool v) external {returnFalse=v;} function setBlocked(address a,bool v) external {blocked[a]=v;}
    function approve(address g,uint w) public returns(bool){allowance[msg.sender][g]=w;return true;}
    function transfer(address d,uint w) public returns(bool){return _move(msg.sender,d,w);}
    function transferFrom(address s,address d,uint w) public returns(bool){require(allowance[s][msg.sender]>=w,"allowance");allowance[s][msg.sender]-=w;return _move(s,d,w);}
    function _move(address s,address d,uint w) internal returns(bool){ if(returnFalse) return false; require(!blocked[s]&&!blocked[d],"blocked"); require(balanceOf[s]>=w,"bal"); balanceOf[s]-=w; balanceOf[d]+=w-feeOnTransfer; return true; }
}
interface IAdapter { function swapExactBnbForUsdt(uint,uint) external payable returns(uint); function swapExactUsdtForBnb(uint,uint,uint) external returns(uint); }
contract MockRouter {
    struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint deadline; uint amountIn; uint amountOutMinimum; uint160 sqrtPriceLimitX96; }
    // rate: output per 1e18 input
    mapping(address=>uint) public rate; uint public mode; address public elsewhere; bytes public lastReentryError;
    function setRate(address tokenIn,uint r) external {rate[tokenIn]=r;} function setMode(uint m,address e) external {mode=m;elsewhere=e;}
    receive() external payable {}
    function exactInputSingle(P calldata p) external payable returns (uint out) {
        require(p.sqrtPriceLimitX96==0 && p.deadline>=block.timestamp && p.recipient==msg.sender, "params");
        uint pull = mode==2 ? p.amountIn-1 : (mode==3 ? p.amountIn+1 : p.amountIn);
        require(MockUSDT(p.tokenIn).transferFrom(msg.sender,address(this),pull),"pull");
        out = p.amountIn*rate[p.tokenIn]/1e18;
        if (mode==1) return out;                                   // claims output but pays nothing
        if (mode==4) { IAdapter(msg.sender).swapExactBnbForUsdt{value:0}(1,block.timestamp); }
        if (mode==9) { try IAdapter(msg.sender).swapExactBnbForUsdt{value:0}(1,block.timestamp) {} catch (bytes memory e) { lastReentryError=e; } } // V1.6: swallow, record selector
        if (mode==5) { (bool ok,)=msg.sender.call{value:1}(""); require(ok,"native rejected"); }
        if (mode==6) { MockUSDT(p.tokenOut).transfer(elsewhere,out); return out; }
        if (mode==7) { MockUSDT(p.tokenOut).transfer(msg.sender,out); return out+1; }
        if (mode==8) { MockUSDT(p.tokenOut).transfer(msg.sender,out+1); return out; } // overpays: residual
        require(out>=p.amountOutMinimum,"min");
        MockUSDT(p.tokenOut).transfer(msg.sender,out);
    }
}
contract RejectingUser {
    function go(address a,uint dl) external payable { IAdapter(a).swapExactBnbForUsdt{value:msg.value}(1,dl); }
    function sell(address a,address usdt,uint amt,uint dl) external { MockUSDT(usdt).approve(a,amt); IAdapter(a).swapExactUsdtForBnb(amt,1,dl); }
}
// V1.6 TEST-ONLY: user contract that re-enters the adapter from its native receive hook (during payout).
contract ReentrantUser {
    address public a; bytes public lastError; uint public hits;
    function sell(address ad,address usdt,uint amt,uint dl) external { a=ad; MockUSDT(usdt).approve(ad,amt); IAdapter(ad).swapExactUsdtForBnb(amt,1,dl); }
    receive() external payable { hits++; try IAdapter(a).swapExactBnbForUsdt{value:0}(1,block.timestamp) {} catch (bytes memory e) { lastError=e; } }
}
