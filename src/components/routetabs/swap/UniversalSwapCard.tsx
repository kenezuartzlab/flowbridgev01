import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, Loader2, CheckCircle2 } from "lucide-react";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { TokenIcon } from "@/components/TokenIcon";
import { cn } from "@/lib/utils";
import { ERC20_ABI, UNISWAP_V2_ROUTER_ABI, getContracts } from "@/lib/contracts";
import {
  getCuratedTokens,
  NATIVE_TOKEN_ADDRESS,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { getBestRoute, type QuoteResult } from "@/lib/swap/quoter";
import { TokenPickerModal } from "./TokenPickerModal";
import { SlippagePopover } from "./SlippagePopover";
import { WarningPanel } from "@/components/routetabs/WarningPanel";

interface UniversalSwapCardProps {
  isMainnet: boolean;
  isConnected: boolean;
  onConnect: () => void;
  isNetworkCorrect: boolean;
  onSwitchNetwork: () => void;
  onSwapSuccess?: (info: {
    fromSymbol: string;
    toSymbol: string;
    txHash: `0x${string}`;
  }) => void;
  txUrlPrefix: string;
}

export function UniversalSwapCard({
  isMainnet,
  isConnected,
  onConnect,
  isNetworkCorrect,
  onSwitchNetwork,
  onSwapSuccess,
  txUrlPrefix,
}: UniversalSwapCardProps) {
  const { address } = useAccount();
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  const router = contracts.bdexRouter.toLowerCase() as Address;

  const curated = useMemo(() => getCuratedTokens(isMainnet), [isMainnet]);
  const [tokenIn, setTokenIn] = useState<Token>(curated[0]); // BOT
  const [tokenOut, setTokenOut] = useState<Token>(curated[2]); // USDT
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [pickerOpen, setPickerOpen] = useState<"in" | "out" | null>(null);

  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  // Reset curated tokens if mainnet toggles
  useEffect(() => {
    setTokenIn(curated[0]);
    setTokenOut(curated[2]);
    setQuote(null);
    setLastTx(null);
  }, [isMainnet, curated]);

  // ── Balances ──────────────────────────────────────────────────────────────
  const nativeBalance = useBalance({
    address,
    query: { enabled: !!address && tokenIn.isNative },
  });

  const tokenInBalanceRead = useReadContract({
    address: tokenIn.isNative ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !tokenIn.isNative },
  });

  const nativeOutBalance = useBalance({
    address,
    query: { enabled: !!address && tokenOut.isNative },
  });
  const tokenOutBalanceRead = useReadContract({
    address: tokenOut.isNative ? undefined : (tokenOut.address as Address),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !tokenOut.isNative },
  });

  const inBalanceRaw: bigint = tokenIn.isNative
    ? (nativeBalance.data?.value ?? 0n)
    : ((tokenInBalanceRead.data as bigint | undefined) ?? 0n);
  const outBalanceRaw: bigint = tokenOut.isNative
    ? (nativeOutBalance.data?.value ?? 0n)
    : ((tokenOutBalanceRead.data as bigint | undefined) ?? 0n);

  const inBalanceDisplay = formatUnits(inBalanceRaw, tokenIn.decimals);
  const outBalanceDisplay = formatUnits(outBalanceRaw, tokenOut.decimals);

  // ── Allowance ─────────────────────────────────────────────────────────────
  const allowanceRead = useReadContract({
    address: tokenIn.isNative ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, router] : undefined,
    query: { enabled: !!address && !tokenIn.isNative },
  });
  const allowanceRaw = (allowanceRead.data as bigint | undefined) ?? 0n;

  // ── Quote (debounced) ─────────────────────────────────────────────────────
  useEffect(() => {
    setLastTx(null);
    setTxError(null);
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    const handle = setTimeout(async () => {
      try {
        const parsed = parseUnits(amountIn, tokenIn.decimals);
        const result = await getBestRoute(tokenIn, tokenOut, parsed, isMainnet);
        if (cancelled) return;
        if (!result) {
          setQuote(null);
          setQuoteError("No Bohr route found for this pair.");
        } else {
          setQuote(result);
          setQuoteError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(e?.message ?? "Quote failed");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [amountIn, tokenIn, tokenOut, isMainnet]);

  // ── Writes ────────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();

  const handleSwap = async () => {
    if (!address || !quote) return;
    setBusy(true);
    setTxError(null);
    setLastTx(null);
    try {
      const amountInRaw = parseUnits(amountIn, tokenIn.decimals);
      const minOut =
        (quote.amountOut * BigInt(Math.floor((100 - slippage) * 1000))) / 100000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);

      // 1. Approve if needed (token-in only)
      if (!tokenIn.isNative && allowanceRaw < amountInRaw) {
        setBusyMsg(`Approving ${tokenIn.symbol}…`);
        await writeContractAsync({
          address: tokenIn.address as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [router, amountInRaw],
        });
        await allowanceRead.refetch?.();
      }

      // 2. Swap
      setBusyMsg("Submitting swap…");
      let tx: `0x${string}`;
      if (tokenIn.isNative) {
        tx = await writeContractAsync({
          address: router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [minOut, quote.path, address, deadline],
          value: amountInRaw,
        });
      } else if (tokenOut.isNative) {
        tx = await writeContractAsync({
          address: router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [amountInRaw, minOut, quote.path, address, deadline],
        });
      } else {
        tx = await writeContractAsync({
          address: router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [amountInRaw, minOut, quote.path, address, deadline],
        });
      }
      setLastTx(tx);
      onSwapSuccess?.({ fromSymbol: tokenIn.symbol, toSymbol: tokenOut.symbol, txHash: tx });
    } catch (e: any) {
      setTxError(e?.shortMessage ?? e?.message ?? "Swap failed");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  };

  const onToggle = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setQuote(null);
  };

  const onMax = () => {
    if (!inBalanceRaw) return;
    // leave a tiny native gas buffer
    if (tokenIn.isNative) {
      const buf = parseUnits("0.001", tokenIn.decimals);
      const usable = inBalanceRaw > buf ? inBalanceRaw - buf : 0n;
      setAmountIn(formatUnits(usable, tokenIn.decimals));
    } else {
      setAmountIn(inBalanceDisplay);
    }
  };

  // ── Button label ──────────────────────────────────────────────────────────
  const parsedAmount = (() => {
    try {
      return amountIn ? parseUnits(amountIn, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  })();
  const needsApproval = !tokenIn.isNative && parsedAmount > 0n && allowanceRaw < parsedAmount;
  const insufficient = parsedAmount > inBalanceRaw;

  let buttonLabel = "Swap";
  let buttonDisabled = false;
  if (!isConnected) {
    buttonLabel = "Connect Wallet";
  } else if (!isNetworkCorrect) {
    buttonLabel = "Switch to BOT Chain";
  } else if (!amountIn || parsedAmount === 0n) {
    buttonLabel = "Enter an amount";
    buttonDisabled = true;
  } else if (insufficient) {
    buttonLabel = `Insufficient ${tokenIn.symbol}`;
    buttonDisabled = true;
  } else if (quoting) {
    buttonLabel = "Fetching route…";
    buttonDisabled = true;
  } else if (!quote) {
    buttonLabel = "No route";
    buttonDisabled = true;
  } else if (needsApproval) {
    buttonLabel = busy ? busyMsg : `Approve ${tokenIn.symbol} & Swap`;
  } else {
    buttonLabel = busy ? busyMsg : "Swap";
  }
  if (busy) buttonDisabled = true;

  const amountOutDisplay = quote ? formatUnits(quote.amountOut, tokenOut.decimals) : "";
  const rate =
    quote && parseFloat(amountIn) > 0
      ? parseFloat(amountOutDisplay) / parseFloat(amountIn)
      : 0;
  const minReceived = quote
    ? (Number(formatUnits(quote.amountOut, tokenOut.decimals)) * (100 - slippage)) / 100
    : 0;

  const handleSubmit = () => {
    if (!isConnected) return onConnect();
    if (!isNetworkCorrect) return onSwitchNetwork();
    void handleSwap();
  };

  return (
    <div className="flex flex-col flex-1 relative z-10 w-full space-y-4 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-xs font-black text-white uppercase tracking-widest font-mono">
            Swap
          </span>
          <span className="text-[10px] text-[#C5C1B9] font-mono">
            Bohr on-chain router · multi-hop
          </span>
        </div>
        <SlippagePopover value={slippage} onChange={setSlippage} />
      </div>

      {/* Card */}
      <div className="bg-[#0D1C2A]/70 border border-white/20 rounded-[20px] shadow-2xl p-4.5 relative space-y-2.5">
        <TokenSide
          label="Sell"
          token={tokenIn}
          amount={amountIn}
          onAmountChange={setAmountIn}
          balanceDisplay={inBalanceDisplay}
          onPickToken={() => setPickerOpen("in")}
          onMax={onMax}
        />

        <div className="flex justify-center -my-6.5 relative z-20">
          <button
            type="button"
            onClick={onToggle}
            className="bg-[#0D1C2A] border border-white/25 text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/35 p-2 rounded-xl shadow-lg hover:rotate-180 transition-all duration-300 active:scale-90 cursor-pointer"
            title="Switch direction"
          >
            <ArrowDownUp className="w-4 h-4" />
          </button>
        </div>

        <TokenSide
          label="Buy"
          token={tokenOut}
          amount={amountOutDisplay}
          balanceDisplay={outBalanceDisplay}
          onPickToken={() => setPickerOpen("out")}
          readOnly
          quoting={quoting}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={buttonDisabled}
        className={cn(
          "w-full py-4 rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex justify-center items-center gap-2 cursor-pointer font-sans",
          buttonDisabled
            ? "bg-white/5 text-[#C5C1B9]/45 border border-white/10 cursor-not-allowed shadow-none"
            : "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] shadow-[0_0_16px_rgba(50,255,139,0.25)] hover:shadow-[0_0_24px_rgba(50,255,139,0.45)] hover:scale-[1.01] active:scale-[0.99]",
        )}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <span>{buttonLabel}</span>
      </button>

      {/* Details */}
      {quote && !quoteError && (
        <div className="bg-[#010C1B]/60 border border-white/10 rounded-xl p-3 space-y-1.5 text-[10px] font-mono text-[#C5C1B9]">
          <Row label="Rate" value={`1 ${tokenIn.symbol} ≈ ${rate.toFixed(6)} ${tokenOut.symbol}`} />
          <Row label="Min received" value={`${minReceived.toFixed(6)} ${tokenOut.symbol}`} />
          <Row label="Slippage" value={`${slippage}%`} />
          <Row label="Route" value={quote.symbolPath.join(" → ")} />
        </div>
      )}

      {quoteError && amountIn && parseFloat(amountIn) > 0 && !quoting && (
        <WarningPanel type="warning" message={quoteError} />
      )}

      {txError && <WarningPanel type="error" message={txError} />}

      {lastTx && (
        <div className="flex items-center gap-2 bg-[#32FF8B]/10 border border-[#32FF8B]/30 rounded-xl p-3 text-[11px] font-mono">
          <CheckCircle2 className="w-4 h-4 text-[#32FF8B] shrink-0" />
          <span className="text-white">Swap submitted.</span>
          <a
            href={`${txUrlPrefix}${lastTx}`}
            target="_blank"
            rel="noreferrer"
            className="text-[#32FF8B] hover:underline font-black tracking-wider ml-auto"
          >
            View tx ↗
          </a>
        </div>
      )}

      <TokenPickerModal
        isOpen={pickerOpen === "in"}
        onClose={() => setPickerOpen(null)}
        onSelect={(t) => {
          if (t.address.toLowerCase() === tokenOut.address.toLowerCase()) {
            setTokenOut(tokenIn);
          }
          setTokenIn(t);
          setPickerOpen(null);
          setAmountIn("");
        }}
        isMainnet={isMainnet}
        excludeAddress={tokenOut.address}
        title="Select a token to sell"
      />
      <TokenPickerModal
        isOpen={pickerOpen === "out"}
        onClose={() => setPickerOpen(null)}
        onSelect={(t) => {
          if (t.address.toLowerCase() === tokenIn.address.toLowerCase()) {
            setTokenIn(tokenOut);
          }
          setTokenOut(t);
          setPickerOpen(null);
        }}
        isMainnet={isMainnet}
        excludeAddress={tokenIn.address}
        title="Select a token to buy"
      />
    </div>
  );
}

interface TokenSideProps {
  label: string;
  token: Token;
  amount: string;
  onAmountChange?: (v: string) => void;
  balanceDisplay: string;
  onPickToken: () => void;
  onMax?: () => void;
  readOnly?: boolean;
  quoting?: boolean;
}

function TokenSide({
  label,
  token,
  amount,
  onAmountChange,
  balanceDisplay,
  onPickToken,
  onMax,
  readOnly,
  quoting,
}: TokenSideProps) {
  const shortBalance = (() => {
    const n = parseFloat(balanceDisplay);
    if (!isFinite(n)) return "0";
    if (n === 0) return "0";
    if (n < 0.0001) return n.toExponential(2);
    return n.toFixed(n < 1 ? 6 : 4);
  })();

  return (
    <div className="bg-[#010C1B]/75 border border-white/15 p-4 rounded-xl space-y-3 font-sans shadow-inner">
      <div className="flex justify-between items-center text-[10px] font-black text-[#C5C1B9] uppercase tracking-wider font-mono">
        <span>{label}</span>
        <div className="flex items-center gap-1.5 font-bold">
          <span className="text-[#C5C1B9] normal-case font-mono font-bold">
            Balance: {shortBalance}
          </span>
          {!readOnly && onMax && (
            <button
              type="button"
              onClick={onMax}
              className="bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 active:scale-95 text-[#32FF8B] border border-[#32FF8B]/25 px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase cursor-pointer"
            >
              Max
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center gap-3">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="text-2xl font-black text-white leading-none h-[36px] flex items-center overflow-x-auto whitespace-nowrap scrollbar-none font-mono">
              {quoting ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#C5C1B9]" />
              ) : amount ? (
                parseFloat(amount).toFixed(8)
              ) : (
                "0.00000000"
              )}
            </div>
          ) : (
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange?.(e.target.value)}
              className="bg-transparent text-white text-2xl font-black w-full focus:outline-none placeholder:text-[#C5C1B9]/40 leading-none h-[36px] font-mono"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onPickToken}
          className="bg-[#0D1C2A]/90 hover:bg-[#0D1C2A] px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 border border-white/15 hover:border-[#32FF8B]/40 shadow-sm font-mono cursor-pointer transition-colors"
        >
          <TokenIcon symbol={token.symbol} size={22} />
          <span className="font-black text-xs text-white tracking-widest uppercase">
            {token.symbol}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>

      <div className="text-[#C5C1B9] font-medium flex items-center text-[10px] font-mono leading-none">
        <span>
          {token.isNative
            ? "Native BOT"
            : `${token.address.slice(0, 6)}…${token.address.slice(-4)}`}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="uppercase tracking-wider">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}

// re-export to satisfy import linters when unused above
export const __NATIVE = NATIVE_TOKEN_ADDRESS;
