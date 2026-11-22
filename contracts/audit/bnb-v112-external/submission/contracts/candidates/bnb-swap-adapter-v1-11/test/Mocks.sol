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

contract MockRouter {
    struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint deadline; uint amountIn; uint amountOutMinimum; uint160 sqrtPriceLimitX96; }
    mapping(address=>uint) public rate; uint public mode; bytes public reentry; bytes public lastError;
    uint24 public lastTier;
    function setRate(address t,uint r) external {rate[t]=r;}
    function setMode(uint m) external {mode=m;}
    function setReentry(bytes calldata d) external {reentry=d;}
    function exactInputSingle(P calldata p) external payable returns(uint out) {
        require(p.fee==500||p.fee==2500,"tier"); lastTier=p.fee;
        require(p.recipient==msg.sender && p.sqrtPriceLimitX96==0,"params");
        uint pull=mode==2?p.amountIn-1:mode==3?p.amountIn+1:p.amountIn;
        require(MockUSDT(p.tokenIn).transferFrom(msg.sender,address(this),pull));
        out=p.amountIn*rate[p.tokenIn]/1e18;
        if(mode==1)return out;
        if(mode==4){(bool ok,bytes memory err)=msg.sender.call(reentry);require(!ok);lastError=err;}
        require(out>=p.amountOutMinimum);
        require(MockUSDT(p.tokenOut).transfer(msg.sender,mode==5?out+1:out));
    }
}
contract TestRecipient {
    address public adapter; bytes public reentry; bytes public lastError; bool public rejectNative;
    function setup(address a,bytes calldata d,bool r) external {adapter=a;reentry=d;rejectNative=r;}
    function execute(address usdt,bytes calldata d,uint amount) external payable {
        MockUSDT(usdt).approve(adapter,amount); (bool ok,bytes memory err)=adapter.call{value:msg.value}(d);
        if(!ok)assembly { revert(add(err,32),mload(err)) }
    }
    receive() external payable {require(!rejectNative,"reject native");if(reentry.length>0){(bool ok,bytes memory err)=adapter.call(reentry);require(!ok);lastError=err;}}
}
