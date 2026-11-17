// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @title FlowBridge BNB Swap Adapter V1 — V1.6 LOCAL CANDIDATE ONLY (not deployed, not audited, not registered)
/// @notice Two fixed routes only: native BNB -> USDT and USDT -> native BNB through one immutable
///         PancakeSwap V3 SwapRouter pool fee tier. Non-upgradeable, no owner, no admin, no sweep,
///         no arbitrary calldata, recipient is always msg.sender. The platform fee is taken from the
///         output and the user's minimum is enforced NET of that fee. Native wrapping is done by this
///         adapter through WBNB.deposit/withdraw, never through router-held BNB (the router's public
///         refundETH/unwrapWETH9/sweepToken would let anyone take router residue).
interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}
interface IWBNB is IERC20Min {
    function deposit() external payable;
    function withdraw(uint256) external;
}
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// V1.6 = V1.5 logic unchanged, recompiled with solc 0.8.38 / evmVersion cancun (see MANIFEST). V1.5 changes vs frozen V1.4: (1) USDT->BNB fee paid in WBNB instead of native call to FEE_RECIPIENT;
///   (2) unsolicited balances are explicitly ignored via per-call deltas and permanently unrecoverable (no sweep by design).
contract FlowBridgeBnbSwapAdapterV1_6 {
    uint256 public constant CHAIN_ID = 56;
    uint256 public constant MAX_DEADLINE_WINDOW = 120; // seconds; review TTL is 60 s, plus wallet latency
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BNB_IN = 1 ether;      // candidate safety ceiling
    uint256 public constant MAX_USDT_IN = 1_000 ether; // candidate safety ceiling (USDT has 18 decimals on BSC)

    address public immutable WBNB;
    address public immutable USDT;
    address public immutable ROUTER;
    uint24 public immutable POOL_FEE;
    address public immutable FEE_RECIPIENT;
    uint16 public immutable FEE_BPS;

    uint256 private locked = 1;

    error WrongChain(); error BadConfig(); error Reentrancy(); error Expired(); error DeadlineTooFar();
    error BadAmount(); error InputMismatch(); error InsufficientOutput(); error TransferFailed();
    error UnexpectedNative(); error ResidualBalance(); error AllowanceNotCleared();

    event Swapped(address indexed user, bool bnbToUsdt, uint256 amountIn, uint256 grossOut, uint256 fee, uint256 netOut);

    modifier guarded(uint256 deadline) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (locked != 1) revert Reentrancy();
        if (deadline < block.timestamp) revert Expired();
        if (deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert DeadlineTooFar();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address wbnb, address usdt, address router, uint24 poolFee, address feeRecipient, uint16 feeBps) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (wbnb.code.length == 0 || usdt.code.length == 0 || router.code.length == 0) revert BadConfig();
        if (wbnb == usdt || feeRecipient == address(0) || feeRecipient.code.length != 0) revert BadConfig();
        if (poolFee != 500 && poolFee != 2500) revert BadConfig();
        if (feeBps != 5 && feeBps != 10) revert BadConfig(); // owner PROPOSAL values only
        WBNB = wbnb; USDT = usdt; ROUTER = router; POOL_FEE = poolFee; FEE_RECIPIENT = feeRecipient; FEE_BPS = feeBps;
    }

    /// Only WBNB.withdraw may send native BNB here.
    receive() external payable { if (msg.sender != WBNB) revert UnexpectedNative(); }
    fallback() external payable { revert UnexpectedNative(); }

    function swapExactBnbForUsdt(uint256 minNetOut, uint256 deadline) external payable guarded(deadline) returns (uint256 netOut) {
        uint256 amountIn = msg.value;
        if (amountIn == 0 || amountIn > MAX_BNB_IN || minNetOut == 0) revert BadAmount();
        uint256 nativeBefore = address(this).balance - amountIn;
        uint256 wbnbBefore = IWBNB(WBNB).balanceOf(address(this));
        uint256 usdtBefore = IERC20Min(USDT).balanceOf(address(this));

        IWBNB(WBNB).deposit{value: amountIn}();
        if (IWBNB(WBNB).balanceOf(address(this)) - wbnbBefore != amountIn) revert InputMismatch();
        uint256 gross = _swap(WBNB, USDT, amountIn);
        uint256 got = IERC20Min(USDT).balanceOf(address(this)) - usdtBefore;
        if (got != gross) revert InputMismatch();
        netOut = _settle(USDT, gross, minNetOut);
        _assertNoResidual(nativeBefore, wbnbBefore, usdtBefore);
        emit Swapped(msg.sender, true, amountIn, gross, gross - netOut, netOut);
    }

    function swapExactUsdtForBnb(uint256 amountIn, uint256 minNetOut, uint256 deadline) external guarded(deadline) returns (uint256 netOut) {
        if (amountIn == 0 || amountIn > MAX_USDT_IN || minNetOut == 0) revert BadAmount();
        uint256 nativeBefore = address(this).balance;
        uint256 wbnbBefore = IWBNB(WBNB).balanceOf(address(this));
        uint256 usdtBefore = IERC20Min(USDT).balanceOf(address(this));

        _safeTransferFrom(USDT, msg.sender, address(this), amountIn);
        if (IERC20Min(USDT).balanceOf(address(this)) - usdtBefore != amountIn) revert InputMismatch(); // fee-on-transfer rejected
        uint256 gross = _swap(USDT, WBNB, amountIn);
        if (IWBNB(WBNB).balanceOf(address(this)) - wbnbBefore != gross) revert InputMismatch();
        uint256 fee = gross * FEE_BPS / BPS;
        netOut = gross - fee;
        if (netOut < minNetOut) revert InsufficientOutput();
        // V1.5: fee is paid in WBNB (plain ERC20 transfer, recipient code never executes), so a fee recipient
        // that later gains code (EIP-7702) cannot revert or gas-grief user swaps. Only netOut is unwrapped.
        if (fee != 0) _safeTransfer(WBNB, FEE_RECIPIENT, fee);
        IWBNB(WBNB).withdraw(netOut);
        if (address(this).balance - nativeBefore != netOut) revert InputMismatch();
        _sendNative(msg.sender, netOut);
        _assertNoResidual(nativeBefore, wbnbBefore, usdtBefore);
        emit Swapped(msg.sender, false, amountIn, gross, fee, netOut);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn) private returns (uint256 gross) {
        _safeApprove(tokenIn, ROUTER, amountIn); // exact amount, never infinite
        gross = IPancakeV3SwapRouter(ROUTER).exactInputSingle(IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, fee: POOL_FEE, recipient: address(this),
            deadline: block.timestamp, amountIn: amountIn, amountOutMinimum: 1, sqrtPriceLimitX96: 0
        }));
        if (IERC20Min(tokenIn).allowance(address(this), ROUTER) != 0) {
            _safeApprove(tokenIn, ROUTER, 0);
            revert AllowanceNotCleared(); // router must consume exactly amountIn
        }
    }

    function _settle(address token, uint256 gross, uint256 minNetOut) private returns (uint256 netOut) {
        uint256 fee = gross * FEE_BPS / BPS;
        netOut = gross - fee;
        if (netOut < minNetOut) revert InsufficientOutput();
        _safeTransfer(token, msg.sender, netOut);
        if (fee != 0) _safeTransfer(token, FEE_RECIPIENT, fee);
    }

    function _assertNoResidual(uint256 n, uint256 w, uint256 u) private view {
        if (address(this).balance != n || IWBNB(WBNB).balanceOf(address(this)) != w || IERC20Min(USDT).balanceOf(address(this)) != u) revert ResidualBalance();
    }

    function _sendNative(address to, uint256 v) private { (bool ok,) = to.call{value: v}(""); if (!ok) revert TransferFailed(); }
    function _call(address t, bytes memory d) private {
        (bool ok, bytes memory r) = t.call(d);
        if (!ok || (r.length != 0 && !abi.decode(r, (bool)))) revert TransferFailed();
    }
    function _safeTransfer(address t, address to, uint256 v) private { _call(t, abi.encodeWithSelector(IERC20Min.transfer.selector, to, v)); }
    function _safeTransferFrom(address t, address f, address to, uint256 v) private { _call(t, abi.encodeWithSelector(IERC20Min.transferFrom.selector, f, to, v)); }
    function _safeApprove(address t, address s, uint256 v) private { _call(t, abi.encodeWithSelector(IERC20Min.approve.selector, s, v)); }
}
