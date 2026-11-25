// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
// Review-only helpers. Not part of the frozen V1.12 source closure.
contract NativeRefunder {
    function push(address target) external payable returns (bool ok, bytes memory err) { (ok, err) = target.call{value: msg.value}(""); }
}
contract HeavyReceiver {
    uint256 public sink; address public adapter;
    function setAdapter(address a) external { adapter = a; }
    function run(address usdt, bytes calldata d, uint256 amount) external {
        (bool a,) = usdt.call(abi.encodeWithSignature("approve(address,uint256)", adapter, amount)); require(a);
        (bool ok, bytes memory err) = adapter.call(d); if (!ok) assembly { revert(add(err, 32), mload(err)) }
    }
    receive() external payable { for (uint256 i = 0; i < 20; i++) sink += i + 1; } // needs far more than 2300 gas
}
