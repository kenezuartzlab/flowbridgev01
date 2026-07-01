import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { toast } from "sonner";
import { TokenIcon } from "@/components/TokenIcon";
import { cn } from "@/lib/utils";
import {
  ERC20_ABI,
  FLOW_BRIDGE_ROUTER_V3_ABI,
  getContracts,
} from "@/lib/contracts";
import {
  getCuratedTokens,
  NATIVE_TOKEN_ADDRESS,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { getBestRoute, type QuoteResult, type SwapStep } from "@/lib/swap/quoter";
import { TokenPickerModal } from "./TokenPickerModal";
import { SlippagePopover } from "./SlippagePopover";
import { WarningPanel } from "@/components/routetabs/WarningPanel";


function parseTxError(e: any): string {
  const raw =
    e?.shortMessage ||
    e?.details ||
    e?.cause?.shortMessage ||
    e?.cause?.message ||
    e?.message ||
    "Transaction failed";
  const s = String(raw);
  if (/user rejected|user denied|rejected the request/i.test(s)) return "Transaction rejected in wallet";
  if (/insufficient funds/i.test(s)) return "Insufficient funds for gas";
  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(s)) return "Price moved — increase slippage and retry";
  if (/EXPIRED/i.test(s)) return "Transaction deadline expired — retry";
  if (/TRANSFER_FROM_FAILED|TRANSFER_FAILED/i.test(s)) return "Token transfer failed (allowance or balance)";
  // Trim noisy viem prefixes
  return s.replace(/^Error:\s*/, "").slice(0, 200);
}

function shortHash(h: string) {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export interface SwapSummary {
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toSymbol: string;
}

export type SwapPhase =
  | ({ phase: "approving"; symbol: string } & Partial<SwapSummary>)
  | ({ phase: "swapping"; from: string; to: string } & Partial<SwapSummary>)
  | { phase: "success"; from: string; to: string; txHash: `0x${string}` }
  | { phase: "error"; message: string }
  | { phase: "idle" };

interface UniversalSwapCardProps {
  isMainnet: boolean;
  isConnected: boolean;
  onConnect: () => void;
  isNetworkCorrect: boolean;
  onSwitchNetwork: () => void;
  onSwapSuccess?: (info: {
    fromSymbol: string;
    toSymbol: string;
    fromAmount: string;
    toAmount: string;
    txHash: `0x${string}`;
  }) => void;
  /** Notifies parent so it can show shared waiting/receipt modals. */
  onSwapPhaseChange?: (e: SwapPhase) => void;
  /** Resolve a USD price for a token symbol (BOT/WBOT/USDT/CA…). Return null/undefined if unknown. */
  getUsdPrice?: (symbol: string) => number | null | undefined;
  txUrlPrefix: string;
}

export function UniversalSwapCard({
  isMainnet,
  isConnected,
  onConnect,
  isNetworkCorrect,
  onSwitchNetwork,
  onSwapSuccess,
  onSwapPhaseChange,
  getUsdPrice,
  txUrlPrefix,
}: UniversalSwapCardProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  // Router used for the token-in ERC20 allowance check (the first step's router).
  // Recomputed after a quote arrives.

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

  // All swaps route through FlowBridgeRouter v3, so ERC20 approvals target it.
  const flowRouter: Address = contracts.flowBridgeRouterV3.toLowerCase() as Address;
  const firstStepRouter: Address = flowRouter;


  // ── Allowance ─────────────────────────────────────────────────────────────
  const allowanceRead = useReadContract({
    address: tokenIn.isNative ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, firstStepRouter] : undefined,
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
          setQuoteError("No on-chain route found (no Bohr or CaryPact liquidity).");
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

  const minOutFor = (expected: bigint) =>
    (expected * BigInt(Math.floor((100 - slippage) * 1000))) / 100000n;

  // Execute a single SwapStep through FlowBridgeRouter v3.
  // `amountInRaw` is the net swap amount (in token-in units). The router charges a
  // configurable protocol fee ON TOP of this — for ERC20 in we approve `swapAmount + fee`,
  // for native in we send `msg.value = swapAmount + fee`. Current mainnet globalFeeBps = 0
  // so `fee` will typically be 0, but the wiring supports non-zero.
  const executeStep = async (
    step: SwapStep,
    amountInRaw: bigint,
    deadline: bigint,
  ): Promise<`0x${string}`> => {
    if (!address) throw new Error("No wallet");
    const minOut = minOutFor(step.expectedOut);
    const to = address as `0x${string}`;

    // Read the on-chain protocol fee for this swap so we approve/send the exact amount.
    let fee = 0n;
    try {
      const res = (await publicClient!.readContract({
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "computeRouterFee",
        args: [BigInt(step.routerId), amountInRaw, address as `0x${string}`],
      })) as readonly [bigint, bigint];
      fee = res[0] ?? 0n;
    } catch {
      // If the fee view reverts for any reason, fall back to 0 — the router will
      // still enforce fee logic on-chain and revert if the caller under-pays.
      fee = 0n;
    }
    const totalIn = amountInRaw + fee;

    // ── ERC20 approval: allowance target is FlowBridgeRouter v3, not the DEX router ──
    if (!step.inIsNative) {
      const tokenAddr = step.path[0];
      const currentAllowance = (await publicClient!.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, flowRouter],
      })) as bigint;
      if (currentAllowance < totalIn) {
        setBusyMsg(`Approving ${step.symbolPath[0]}…`);
        onSwapPhaseChange?.({
          phase: "approving",
          symbol: step.symbolPath[0],
          fromAmount: amountIn,
          fromSymbol: tokenIn.symbol,
          toAmount: quote ? formatUnits(quote.amountOut, tokenOut.decimals) : "",
          toSymbol: tokenOut.symbol,
        });
        const toastId = toast.loading(`Approving ${step.symbolPath[0]}…`);
        try {
          const approveTx = await writeContractAsync({
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [flowRouter, totalIn],
          });
          const rcpt = await publicClient!.waitForTransactionReceipt({ hash: approveTx });
          if (rcpt.status !== "success") {
            toast.error(`Approval reverted`, { id: toastId, description: shortHash(approveTx) });
            throw new Error("Approval transaction reverted on-chain");
          }
          toast.success(`${step.symbolPath[0]} approved`, {
            id: toastId,
            description: shortHash(approveTx),
            action: {
              label: "View",
              onClick: () => window.open(`${txUrlPrefix}${approveTx}`, "_blank"),
            },
          });
        } catch (err) {
          toast.error(parseTxError(err), { id: toastId });
          throw err;
        }
      }
    }

    const inSym = step.symbolPath[0];
    const outSym = step.symbolPath[step.symbolPath.length - 1];
    setBusyMsg(`Swapping ${inSym} → ${outSym}…`);
    onSwapPhaseChange?.({
      phase: "swapping",
      from: inSym,
      to: outSym,
      fromAmount: amountIn,
      fromSymbol: tokenIn.symbol,
      toAmount: quote ? formatUnits(quote.amountOut, tokenOut.decimals) : "",
      toSymbol: tokenOut.symbol,
    });

    const routerIdBig = BigInt(step.routerId);
    const isV3 = step.dex === "bdex-v3";
    const feePool = isV3 ? (step.v3Fee ?? 3000) : 0;

    // ── Dispatch to the correct FlowBridgeRouter entry point ──────────────
    if (step.inIsNative) {
      // native → token (V2 or V3 auto-handled by the router based on routerId)
      // msg.value = swapAmount + fee; router splits fee off and swaps the remainder.
      return await writeContractAsync({
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapNativeToToken",
        args: [routerIdBig, step.path[step.path.length - 1], feePool, minOut, step.path, to, deadline],
        value: totalIn,
      });
    }

    if (step.outIsNative) {
      // token → native (V2 or V3; V3 auto-unwraps WBOT)
      return await writeContractAsync({
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapTokenToNative",
        args: [routerIdBig, step.path[0], feePool, amountInRaw, minOut, step.path, to, deadline],
      });
    }

    // ERC20 → ERC20
    if (isV3) {
      return await writeContractAsync({
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapV3Single",
        args: [routerIdBig, step.path[0], step.path[step.path.length - 1], feePool, amountInRaw, minOut, to, deadline],
      });
    }
    return await writeContractAsync({
      address: flowRouter,
      abi: FLOW_BRIDGE_ROUTER_V3_ABI,
      functionName: "swapV2",
      args: [routerIdBig, amountInRaw, minOut, step.path, to, deadline],
    });
  };



  const handleSwap = async () => {
    if (!address || !quote || !publicClient) return;
    setBusy(true);
    setTxError(null);
    setLastTx(null);
    const swapToastId = toast.loading(
      `Swapping ${tokenIn.symbol} → ${tokenOut.symbol}…`,
    );
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const initialAmount = parseUnits(amountIn, tokenIn.decimals);
      let lastTx: `0x${string}` | null = null;
      let nextAmount = initialAmount;

      for (let i = 0; i < quote.steps.length; i++) {
        const step = quote.steps[i];
        if (i > 0 && step.inIsNative) {
          nextAmount = minOutFor(quote.steps[i - 1].expectedOut);
        }
        const stepLabel = `${step.symbolPath[0]} → ${step.symbolPath[step.symbolPath.length - 1]}`;
        toast.loading(
          quote.steps.length > 1
            ? `Step ${i + 1}/${quote.steps.length}: ${stepLabel}…`
            : `Swapping ${stepLabel}…`,
          { id: swapToastId },
        );

        const tx = await executeStep(step, nextAmount, deadline);
        lastTx = tx;
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
        if (rcpt.status !== "success") {
          toast.error(`Swap reverted on-chain`, {
            id: swapToastId,
            description: shortHash(tx),
            action: {
              label: "View",
              onClick: () => window.open(`${txUrlPrefix}${tx}`, "_blank"),
            },
          });
          setTxError(`Transaction reverted: ${tx}`);
          onSwapPhaseChange?.({
            phase: "error",
            message: `Transaction reverted on-chain (${shortHash(tx)})`,
          });
          return;
        }
      }

      if (lastTx) {
        setLastTx(lastTx);
        toast.success(
          `Swapped ${tokenIn.symbol} → ${tokenOut.symbol}`,
          {
            id: swapToastId,
            description: shortHash(lastTx),
            action: {
              label: "View",
              onClick: () => window.open(`${txUrlPrefix}${lastTx}`, "_blank"),
            },
          },
        );
        onSwapSuccess?.({
          fromSymbol: tokenIn.symbol,
          toSymbol: tokenOut.symbol,
          fromAmount: amountIn,
          toAmount: quote ? formatUnits(quote.amountOut, tokenOut.decimals) : "",
          txHash: lastTx,
        });
        onSwapPhaseChange?.({
          phase: "success",
          from: tokenIn.symbol,
          to: tokenOut.symbol,
          txHash: lastTx,
        });
      }
      await allowanceRead.refetch?.();
    } catch (e: any) {
      const msg = parseTxError(e);
      setTxError(msg);
      toast.error(msg, { id: swapToastId });
      onSwapPhaseChange?.({ phase: "error", message: msg });
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

  const usdValueFor = (t: Token, amt: string): string | undefined => {
    const n = parseFloat(amt);
    if (!isFinite(n) || n <= 0) return undefined;
    const px = getUsdPrice?.(t.symbol);
    if (px == null || !isFinite(px)) return undefined;
    const v = n * px;
    if (v >= 1) return `$${v.toFixed(4)}`;
    return `$${v.toFixed(6)}`;
  };


  return (
    <div className="flex flex-col flex-1 relative z-10 w-full space-y-4 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-lg font-black text-white uppercase tracking-widest font-mono">
            Swap
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
          usdValue={usdValueFor(tokenIn, amountIn)}
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
          usdValue={usdValueFor(tokenOut, amountOutDisplay)}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={buttonDisabled}
        className={cn(
          "w-full py-4 rounded-2xl text-sm font-black tracking-widest uppercase transition-all flex justify-center items-center gap-2 cursor-pointer font-sans",
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
        <div className="bg-[#010C1B]/60 border border-white/10 rounded-xl p-3 space-y-1.5 text-[12px] font-mono text-[#C5C1B9]">
          <Row label="Rate" value={`1 ${tokenIn.symbol} ≈ ${rate.toFixed(6)} ${tokenOut.symbol}`} />
          <Row label="Min received" value={`${minReceived.toFixed(6)} ${tokenOut.symbol}`} />
          <Row label="Slippage" value={`${slippage}%`} />
          <Row label="Route" value={quote.symbolPath.join(" → ")} />
        </div>
      )}

      {quoteError && amountIn && parseFloat(amountIn) > 0 && !quoting && (
        <WarningPanel type="warning" message={quoteError} />
      )}

      {txError && (
        <WarningPanel
          type="error"
          title="Swap Failed"
          message={txError}
          txHash={lastTx ?? undefined}
          txUrlPrefix={txUrlPrefix}
        />
      )}

      {lastTx && !txError && (
        <div className="bg-[#32FF8B]/10 border border-[#32FF8B]/25 rounded-xl p-3 flex items-center justify-between gap-2 text-[12px] font-mono">
          <div className="flex flex-col gap-0.5">
            <span className="text-[#32FF8B] font-black uppercase tracking-widest">Swap Confirmed</span>
            <span className="text-[#C5C1B9]">Receipt status: success</span>
          </div>
          <a
            href={`${txUrlPrefix}${lastTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 bg-[#32FF8B]/15 hover:bg-[#32FF8B]/25 border border-[#32FF8B]/30 text-[#32FF8B] rounded-lg font-bold"
          >
            {shortHash(lastTx)}
            <ExternalLink className="w-3 h-3" />
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
  usdValue?: string;
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
  usdValue,
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
      <div className="flex justify-between items-center text-[12px] font-black text-[#C5C1B9] uppercase tracking-wider font-mono">
        <span>{label}</span>
        <div className="flex items-center gap-1.5 font-bold">
          <span className="text-[#C5C1B9] normal-case font-mono font-bold">
            Balance: {shortBalance}
          </span>
          {!readOnly && onMax && (
            <button
              type="button"
              onClick={onMax}
              className="bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 active:scale-95 text-[#32FF8B] border border-[#32FF8B]/25 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest uppercase cursor-pointer"
            >
              Max
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center gap-3">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="text-4xl font-black text-white leading-none h-[44px] flex items-center overflow-x-auto whitespace-nowrap scrollbar-none font-mono">
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
              className="bg-transparent text-white text-4xl font-black w-full focus:outline-none placeholder:text-[#C5C1B9]/40 leading-none h-[44px] font-mono"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onPickToken}
          className="bg-[#0D1C2A]/90 hover:bg-[#0D1C2A] px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 border border-white/15 hover:border-[#32FF8B]/40 shadow-sm font-mono cursor-pointer transition-colors"
        >
          <TokenIcon symbol={token.symbol} size={22} />
          <span className="font-black text-sm text-white tracking-widest uppercase">
            {token.symbol}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>

      <div className="text-[#C5C1B9] font-medium flex items-center justify-between gap-2 text-[12px] font-mono leading-none">
        <span className="truncate">
          {token.isNative
            ? "Native BOT"
            : `${token.address.slice(0, 6)}…${token.address.slice(-4)}`}
        </span>
        {usdValue && <span className="text-[#C5C1B9] shrink-0">≈ {usdValue}</span>}
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
