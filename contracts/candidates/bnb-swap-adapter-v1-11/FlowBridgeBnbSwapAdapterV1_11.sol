// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @title V1.11 LOCAL AUDIT CANDIDATE ONLY — NOT DEPLOYED / NOT AUDITED
/// @notice Fixed BNB56 pair/router, two fee tiers, caller-bound recent quote snapshot,
/// immutable emergency guardian, net-minimum settlement. No sweep, arbitrary calls or mutable fees.
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

contract FlowBridgeBnbSwapAdapterV1_11 {
    uint256 public constant CHAIN_ID = 56;
    uint256 public constant MAX_DEADLINE_WINDOW = 120; // ceiling only; independent snapshot age <=30s
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BNB_IN = 1 ether;      // candidate safety ceiling
    uint256 public constant MAX_USDT_IN = 1_000 ether; // candidate safety ceiling (USDT has 18 decimals on BSC)

    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address public constant ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    uint256 public constant MAX_QUOTE_AGE = 30;
    uint256 public constant MAX_BLOCK_LAG = 100;
    address public immutable GUARDIAN;
    bool public paused;

    struct QuoteSnapshot {
        address user; uint256 chainId; address tokenIn; address tokenOut; address router;
        uint24 poolFee; uint256 amountIn; uint256 minNetOut; uint256 deadline;
        uint256 quotedAt; uint256 quoteBlock; bytes32 quoteBlockHash;
    }
    address public immutable FEE_RECIPIENT;
    uint16 public immutable FEE_BPS;

    uint256 private locked = 1;

    error WrongChain(); error BadConfig(); error Reentrancy(); error Expired(); error DeadlineTooFar();
    error BadAmount(); error InputMismatch(); error InsufficientOutput(); error TransferFailed();
    error UnexpectedNative(); error ResidualBalance(); error AllowanceNotCleared();

    event Swapped(address indexed user, bool bnbToUsdt, uint256 amountIn, uint256 grossOut, uint256 fee, uint256 netOut);

    error Paused(); error UnauthorizedGuardian(); error BadSnapshot();
    event PauseChanged(bool paused);

    modifier guarded(QuoteSnapshot calldata q) {
        uint256 deadline = q.deadline;
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (locked != 1) revert Reentrancy();
        if (paused) revert Paused();
        if (q.user != msg.sender || q.chainId != CHAIN_ID || q.router != ROUTER) revert BadSnapshot();
        if (q.poolFee != 500 && q.poolFee != 2500) revert BadSnapshot();
        if (q.quotedAt > block.timestamp || block.timestamp - q.quotedAt > MAX_QUOTE_AGE) revert BadSnapshot();
        if (q.quoteBlock >= block.number || block.number - q.quoteBlock > MAX_BLOCK_LAG || q.quoteBlockHash == bytes32(0) || blockhash(q.quoteBlock) != q.quoteBlockHash) revert BadSnapshot();
        if (deadline < block.timestamp) revert Expired();
        if (deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert DeadlineTooFar();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address guardian, address feeRecipient, uint16 feeBps) {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (WBNB.code.length == 0 || USDT.code.length == 0 || ROUTER.code.length == 0) revert BadConfig();
        if (guardian == address(0) || feeRecipient == address(0) || feeRecipient == address(this)) revert BadConfig();
        if (feeBps != 0 && feeBps != 5 && feeBps != 10) revert BadConfig(); // PROPOSAL fixtures, not approved fees
        GUARDIAN = guardian; FEE_RECIPIENT = feeRecipient; FEE_BPS = feeBps;
    }

    function setPaused(bool value) external {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (locked != 1) revert Reentrancy();
        if (msg.sender != GUARDIAN) revert UnauthorizedGuardian();
        paused = value;
        emit PauseChanged(value);
    }

    /// Only WBNB.withdraw may send native BNB here.
    receive() external payable { if (msg.sender != WBNB) revert UnexpectedNative(); }
    fallback() external payable { revert UnexpectedNative(); }

    function swapExactBnbForUsdt(QuoteSnapshot calldata q) external payable guarded(q) returns (uint256 netOut) {
        uint256 amountIn = msg.value;
        uint256 minNetOut = q.minNetOut;
        if (q.tokenIn != WBNB || q.tokenOut != USDT || q.amountIn != amountIn) revert BadSnapshot();
        if (amountIn == 0 || amountIn > MAX_BNB_IN || minNetOut == 0) revert BadAmount();
        uint256 nativeBefore = address(this).balance - amountIn;
        uint256 wbnbBefore = IWBNB(WBNB).balanceOf(address(this));
        uint256 usdtBefore = IERC20Min(USDT).balanceOf(address(this));

        IWBNB(WBNB).deposit{value: amountIn}();
        if (IWBNB(WBNB).balanceOf(address(this)) - wbnbBefore != amountIn) revert InputMismatch();
        uint256 gross = _swap(WBNB, USDT, amountIn, q.poolFee);
        uint256 got = IERC20Min(USDT).balanceOf(address(this)) - usdtBefore;
        if (got != gross) revert InputMismatch();
        netOut = _settle(USDT, gross, minNetOut);
        _assertNoResidual(nativeBefore, wbnbBefore, usdtBefore);
        emit Swapped(msg.sender, true, amountIn, gross, gross - netOut, netOut);
    }

    function swapExactUsdtForBnb(QuoteSnapshot calldata q) external guarded(q) returns (uint256 netOut) {
        uint256 amountIn = q.amountIn;
        uint256 minNetOut = q.minNetOut;
        if (q.tokenIn != USDT || q.tokenOut != WBNB) revert BadSnapshot();
        if (amountIn == 0 || amountIn > MAX_USDT_IN || minNetOut == 0) revert BadAmount();
        uint256 nativeBefore = address(this).balance;
        uint256 wbnbBefore = IWBNB(WBNB).balanceOf(address(this));
        uint256 usdtBefore = IERC20Min(USDT).balanceOf(address(this));

        _safeTransferFrom(USDT, msg.sender, address(this), amountIn);
        if (IERC20Min(USDT).balanceOf(address(this)) - usdtBefore != amountIn) revert InputMismatch(); // fee-on-transfer rejected
        uint256 gross = _swap(USDT, WBNB, amountIn, q.poolFee);
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

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint24 poolFee) private returns (uint256 gross) {
        _safeApprove(tokenIn, ROUTER, amountIn); // exact amount, never infinite
        gross = IPancakeV3SwapRouter(ROUTER).exactInputSingle(IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, fee: poolFee, recipient: address(this),
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
