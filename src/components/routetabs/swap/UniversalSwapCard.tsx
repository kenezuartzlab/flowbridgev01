import { useEffect, useMemo, useState } from "react";
import { formatUsd } from "../../../lib/format";
import { ArrowDownUp, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { useAccount, useBalance, usePublicClient, useReadContract, useSignMessage, useWriteContract } from "wagmi";
import { ensureWalletVerified, WalletVerificationRejectedError } from "@/lib/walletVerification";
import { formatUnits, parseUnits, type Address } from "viem";
import { ConfirmSwapModal } from "@/modals/ConfirmSwapModal";
import { toast } from "sonner";
import { TokenIcon } from "@/components/TokenIcon";
import { cn } from "@/lib/utils";
import {
  ERC20_ABI,
  FLOW_BRIDGE_ROUTER_V3_ABI,
  getContracts,
  PLATFORM_FEE_LABEL,
} from "@/lib/contracts";
import {
  getCuratedTokens,
  NATIVE_TOKEN_ADDRESS,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { getBestRoute, type QuoteResult, type SwapStep } from "@/lib/swap/quoter";
import { maxSwappableFromBalance, routerFeeOnTop } from "@/lib/swap/platformFee";
import { estimateFlowPointsForUsd, isRewardEligibleUsd } from "@/lib/rewards";
import { useAppConfig } from "@/lib/config/appConfig";
import { formatBalance4 } from "@/lib/format";

import { TokenPickerModal } from "./TokenPickerModal";
import { SlippagePopover } from "./SlippagePopover";
import { WarningPanel } from "@/components/routetabs/WarningPanel";
import { toFriendlyError, isNativeGasLow, lowGasMessage, lowGasSteps } from "@/lib/friendlyError";
import { LowGasSettingsModal } from "@/modals/LowGasSettingsModal";

const parseTxError = (e: unknown) => toFriendlyError(e, { action: "swap", gasSymbol: "BOT" });

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
  rewardsActive?: boolean;
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
  rewardsActive = false,
  txUrlPrefix,
}: UniversalSwapCardProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  // Router used for the token-in ERC20 allowance check (the first step's router).
  // Recomputed after a quote arrives.

  const appConfig = useAppConfig(); // admin-published tokens + default slippage
  const curated = useMemo(() => getCuratedTokens(isMainnet), [isMainnet, appConfig]);
  const [tokenIn, setTokenIn] = useState<Token>(curated[0]); // BOT
  const [tokenOut, setTokenOut] = useState<Token>(curated[2]); // USDT
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(appConfig.fees.defaultSlippagePct);

  const [pickerOpen, setPickerOpen] = useState<"in" | "out" | null>(null);

  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset curated tokens if mainnet toggles
  useEffect(() => {
    setTokenIn(curated[0]);
    setTokenOut(curated[2]);
    setQuote(null);
    setLastTx(null);
  }, [isMainnet, curated]);

  // ── Balances ──────────────────────────────────────────────────────────────
  // Pin every balance read to BOT Chain. Without an explicit chainId these
  // resolve against whatever chain the wallet happens to be on (e.g. BSC),
  // which returned wrong/zero balances. Poll so post-tx balances stay accurate.
  const balanceChainId = isMainnet ? 677 : 968;
  const balanceQuery = { enabled: !!address, refetchInterval: 12_000 } as const;

  const nativeBalance = useBalance({
    address,
    chainId: balanceChainId,
    query: { ...balanceQuery, enabled: !!address && tokenIn.isNative },
  });

  const tokenInBalanceRead = useReadContract({
    address: tokenIn.isNative ? undefined : (tokenIn.address as Address),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: balanceChainId,
    query: { ...balanceQuery, enabled: !!address && !tokenIn.isNative },
  });

  const nativeOutBalance = useBalance({
    address,
    chainId: balanceChainId,
    query: { ...balanceQuery, enabled: !!address && tokenOut.isNative },
  });
  const tokenOutBalanceRead = useReadContract({
    address: tokenOut.isNative ? undefined : (tokenOut.address as Address),
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: balanceChainId,
    query: { ...balanceQuery, enabled: !!address && !tokenOut.isNative },
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

  // Always-on native BOT balance for the low-gas warning banner (independent
  // of whichever token the user is spending).
  const nativeGasBalance = useBalance({ address, chainId: balanceChainId, query: balanceQuery });
  const nativeGasLow = !!address && isNativeGasLow(nativeGasBalance.data?.value, 18, "BOT");
  const [gasSettingsOpen, setGasSettingsOpen] = useState(false);



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
          setQuoteError("No on-chain route found on any active BOT Chain DEX.");
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
  const { signMessageAsync } = useSignMessage();

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
    finalToAmountDisplay?: string,
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

    // ── Balance guard: the router debits `amount + fee`, so swapping an exact
    // full balance fails on-chain with a cryptic SafeERC20 error. Catch it here
    // with a message the user can act on.
    try {
      const held = step.inIsNative
        ? await publicClient!.getBalance({ address: address as `0x${string}` })
        : ((await publicClient!.readContract({
            address: step.path[0],
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          })) as bigint);
      if (held < totalIn) {
        const feeDisp = formatUnits(fee, step.inIsNative ? 18 : tokenIn.decimals);
        throw new Error(
          `Not enough ${step.symbolPath[0]} to cover this swap plus the ${PLATFORM_FEE_LABEL} platform fee (${feeDisp} ${step.symbolPath[0]}). Tap MAX again or lower the amount slightly, then retry.`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Not enough")) throw err;
      // Balance read failed — continue and let the wallet/router surface any issue.
    }


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
          toAmount: finalToAmountDisplay ?? (quote ? formatUnits(quote.amountOut, tokenOut.decimals) : ""),
          toSymbol: tokenOut.symbol,
        });
        const toastId = toast.loading(`Approving ${step.symbolPath[0]}…`);
        try {
          const approveTx = await writeContractAsync({
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: "approve",
            // Approve exactly the amount this swap needs (swap amount + protocol fee)
            // instead of an unlimited allowance, per recommended wallet safety practice.
            args: [flowRouter, totalIn],
            gas: 80000n,
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
      toAmount: finalToAmountDisplay ?? (quote ? formatUnits(quote.amountOut, tokenOut.decimals) : ""),
      toSymbol: tokenOut.symbol,
    });

    const routerIdBig = BigInt(step.routerId);
    const isV3 = step.dex === "bdex-v3";
    const feePool = isV3 ? (step.v3Fee ?? 3000) : 0;

    // Estimate gas per-call and add a 25% safety buffer, so the wallet reserves
    // only what the swap actually consumes (≈180–220k) instead of the old flat
    // 500k cap. Falls back to 500k only when estimation fails (some in-app
    // wallets like TokenPocket report "gasLimit is too low. given 0" on
    // multi-hop routes and need an explicit cap).
    const FALLBACK_GAS = 500000n;
    const withBuffer = (g: bigint) => (g * 125n) / 100n;
    const estimateOr = async (params: Record<string, unknown>) => {
      try {
        const est = await publicClient!.estimateContractGas(params as Parameters<NonNullable<typeof publicClient>["estimateContractGas"]>[0]);
        return withBuffer(est);
      } catch {
        return FALLBACK_GAS;
      }
    };

    // ── Dispatch to the correct FlowBridgeRouter entry point ──────────────
    if (step.inIsNative) {
      const base = {
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapNativeToToken" as const,
        args: [routerIdBig, step.path[step.path.length - 1], feePool, minOut, step.path, to, deadline] as const,
        value: totalIn,
        account: address,
      };
      const gas = await estimateOr(base);
      return await writeContractAsync({ ...base, gas });
    }

    if (step.outIsNative) {
      const base = {
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapTokenToNative" as const,
        args: [routerIdBig, step.path[0], feePool, amountInRaw, minOut, step.path, to, deadline] as const,
        account: address,
      };
      const gas = await estimateOr(base);
      return await writeContractAsync({ ...base, gas });
    }

    // ERC20 → ERC20
    if (isV3) {
      const base = {
        address: flowRouter,
        abi: FLOW_BRIDGE_ROUTER_V3_ABI,
        functionName: "swapV3Single" as const,
        args: [routerIdBig, step.path[0], step.path[step.path.length - 1], feePool, amountInRaw, minOut, to, deadline] as const,
        account: address,
      };
      const gas = await estimateOr(base);
      return await writeContractAsync({ ...base, gas });
    }
    const base = {
      address: flowRouter,
      abi: FLOW_BRIDGE_ROUTER_V3_ABI,
      functionName: "swapV2" as const,
      args: [routerIdBig, amountInRaw, minOut, step.path, to, deadline] as const,
      account: address,
    };
    const gas = await estimateOr(base);
    return await writeContractAsync({ ...base, gas });

  };



  const handleSwap = async () => {
    if (!address || !quote || !publicClient) return;
    setBusy(true);
    setTxError(null);
    setLastTx(null);
    // Pre-flight: block if the wallet clearly can't afford network gas.
    try {
      const nativeRaw = (await publicClient.getBalance({ address })) ?? 0n;
      if (isNativeGasLow(nativeRaw, 18, "BOT")) {
        const msg = lowGasMessage("BOT");
        setTxError(msg);
        toast.error(msg);
        setBusy(false);
        return;
      }
    } catch { /* non-fatal; wallet will surface gas errors below */ }
    // Prove wallet control before any state-changing call. Blocks watch-only
    // wallets and surfaces a clear message if the user rejects the signature.
    try {
      await ensureWalletVerified(address, signMessageAsync as any);
    } catch (err: any) {
      const msg = err instanceof WalletVerificationRejectedError
        ? err.message
        : toFriendlyError(err, { action: "sign-in" });
      setTxError(msg);
      toast.error(msg);
      setBusy(false);
      return;
    }
    const swapToastId = toast.loading(
      `Swapping ${tokenIn.symbol} → ${tokenOut.symbol}…`,
    );
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const initialAmount = parseUnits(amountIn, tokenIn.decimals);
      const latestQuote = await getBestRoute(tokenIn, tokenOut, initialAmount, isMainnet);
      if (!latestQuote) throw new Error("No live route available. Refresh and try again.");
      setQuote(latestQuote);
      let lastTx: `0x${string}` | null = null;
      let nextAmount = initialAmount;
      let activeQuote = latestQuote;
      let finalExpectedOut = latestQuote.amountOut;
      let finalToAmountDisplay = formatUnits(finalExpectedOut, tokenOut.decimals);

      for (let i = 0; i < activeQuote.steps.length; i++) {
        let step = activeQuote.steps[i];
        if (i > 0 && step.inIsNative) {
          nextAmount = minOutFor(activeQuote.steps[i - 1].expectedOut);

          // Multi-router routes (CA↔USDT) execute as two confirmed transactions.
          // The second leg must be quoted against the actual amount we will send
          // into that leg (the first leg's safe minimum), not the earlier optimistic
          // first-leg quote. Otherwise the second transaction can revert with
          // CASwapRouter: INSUFFICIENT_OUTPUT_AMOUNT / "Too little received".
          const refreshed = await getBestRoute(curated[0], tokenOut, nextAmount, isMainnet);
          const refreshedStep = refreshed?.steps[0];
          if (!refreshed || !refreshedStep || refreshed.steps.length !== 1) {
            throw new Error("Route changed after the first swap. Refresh and try again.");
          }
          step = refreshedStep;
          activeQuote = {
            ...activeQuote,
            amountOut: refreshed.amountOut,
            symbolPath: [
              ...activeQuote.symbolPath.slice(0, Math.max(1, i)),
              ...refreshed.symbolPath,
            ],
            steps: [
              ...activeQuote.steps.slice(0, i),
              refreshedStep,
            ],
          };
          finalExpectedOut = refreshed.amountOut;
          finalToAmountDisplay = formatUnits(finalExpectedOut, tokenOut.decimals);
        }
        const stepLabel = `${step.symbolPath[0]} → ${step.symbolPath[step.symbolPath.length - 1]}`;
        toast.loading(
          activeQuote.steps.length > 1
            ? `Step ${i + 1}/${activeQuote.steps.length}: ${stepLabel}…`
            : `Swapping ${stepLabel}…`,
          { id: swapToastId },
        );

        const tx = await executeStep(step, nextAmount, deadline, finalToAmountDisplay);
        lastTx = tx;
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
        if (rcpt.status !== "success") {
          setLastTx(tx);
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
          toAmount: finalToAmountDisplay,
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

  // Largest amount the user can actually swap: the router pulls `amount + 0.1% fee`,
  // and native BOT also needs gas head-room. Everything above this reverts on-chain.
  const maxSpendableRaw = (() => {
    if (!inBalanceRaw) return 0n;
    if (tokenIn.isNative) {
      const buf = parseUnits("0.001", tokenIn.decimals);
      const spendable = inBalanceRaw > buf ? inBalanceRaw - buf : 0n;
      return maxSwappableFromBalance(spendable);
    }
    return maxSwappableFromBalance(inBalanceRaw);
  })();
  const maxSpendableDisplay = formatUnits(maxSpendableRaw, tokenIn.decimals);

  const [clamped, setClamped] = useState(false);

  // Hard-clamp typed input so a user can never submit more than their wallet
  // can cover (swap amount + platform fee + gas reserve).
  const onAmountInChange = (v: string) => {
    setClamped(false);
    if (v === "" || v === ".") return setAmountIn(v);
    let raw: bigint;
    try {
      raw = parseUnits(v, tokenIn.decimals);
    } catch {
      return setAmountIn(v);
    }
    if (maxSpendableRaw > 0n && raw > maxSpendableRaw) {
      setAmountIn(maxSpendableDisplay);
      setClamped(true);
      return;
    }
    setAmountIn(v);
  };

  const onMax = () => {
    if (!inBalanceRaw) return;
    setClamped(false);
    setAmountIn(maxSpendableDisplay);
  };


  // ── Button label ──────────────────────────────────────────────────────────
  const parsedAmount = (() => {
    try {
      return amountIn ? parseUnits(amountIn, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  })();
  // Total debited by FlowBridgeRouter = swap amount + protocol fee (charged on top).
  const totalDebit = parsedAmount + routerFeeOnTop(parsedAmount);
  const needsApproval = !tokenIn.isNative && parsedAmount > 0n && allowanceRaw < totalDebit;
  const insufficient = totalDebit > inBalanceRaw;

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
    if (!quote || !amountIn || parsedAmount === 0n) return;
    setConfirmOpen(true);
  };

  const usdValueFor = (t: Token, amt: string): string | undefined => {
    const n = parseFloat(amt);
    if (!isFinite(n) || n <= 0) return undefined;
    const px = getUsdPrice?.(t.symbol);
    if (px == null || !isFinite(px)) return undefined;
    return formatUsd(n * px);
  };

  // Collapsible route details (collapsed by default, Uniswap-style summary row).
  const [detailsOpen, setDetailsOpen] = useState(false);

  // USD notional of this swap — the amount that will count toward FLOW swap volume.
  const swapUsd: number | null = (() => {
    const n = parseFloat(amountIn);
    const px = getUsdPrice?.(tokenIn.symbol);
    if (!isFinite(n) || n <= 0 || px == null || !isFinite(px)) return null;
    return n * px;
  })();
  const rewardRules = appConfig.rewards;
  const rewardEligible = isRewardEligibleUsd(swapUsd, rewardRules);
  const estimatedFlowPoints = estimateFlowPointsForUsd(swapUsd, rewardRules);




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

      {/* Details — collapsed by default, summary row always visible */}
      {quote && !quoteError && (
        <div className="bg-[#010C1B]/60 border border-white/10 rounded-xl text-[12px] font-mono text-[#C5C1B9] overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            <span className="truncate text-left">
              1 {tokenIn.symbol} ≈ {rate.toFixed(6)} {tokenOut.symbol}
            </span>
            <ChevronDown
              className={cn("w-3.5 h-3.5 shrink-0 transition-transform duration-200", detailsOpen && "rotate-180")}
            />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
              detailsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2.5">
                <Row label="Min received" value={`${minReceived.toFixed(6)} ${tokenOut.symbol}`} />
                <Row label="Slippage" value={`${slippage}%`} />
                <Row label="Route" value={quote.symbolPath.join(" → ")} />
                <Row label="Trading fee" value="0.30%" />
                <Row label="Platform fee" value={PLATFORM_FEE_LABEL} />
                
                <Row
                  label="FLOW reward status"
                  value={
                    !rewardsActive
                      ? "Link email + wallet"
                      : swapUsd == null
                        ? "Price loading"
                        : rewardEligible
                          ? `+${estimatedFlowPoints.toLocaleString()} FLOW`
                          : `0 FLOW · min ${formatUsd(rewardRules.minUsd)}`
                  }
                />
                <p className="pt-1 text-[10px] leading-relaxed text-[#C5C1B9]/60 normal-case">
                  {rewardsActive
                    ? rewardEligible
                      ? `${formatUsd(swapUsd)} verified swap value qualifies for FLOW rewards after the transaction confirms.`
                      : `FLOW rewards start at ${formatUsd(rewardRules.minUsd)} verified swap value. Smaller swaps can complete, but earn 0 FLOW.`
                    : "FLOW rewards require a verified email and the connected wallet bound to that account."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}


      {nativeGasLow && !txError && (
        <WarningPanel
          type="warning"
          title="Low BOT for Gas"
          message={lowGasMessage("BOT")}
          steps={lowGasSteps("BOT")}
          actionLabel="Adjust threshold"
          onAction={() => setGasSettingsOpen(true)}
        />
      )}
      <LowGasSettingsModal isOpen={gasSettingsOpen} onClose={() => setGasSettingsOpen(false)} />

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
      <ConfirmSwapModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSwap();
        }}
        fromAmount={amountIn || "0"}
        fromSymbol={tokenIn.symbol}
        toAmount={amountOutDisplay || "0"}
        toSymbol={tokenOut.symbol}
        priceRate={`1 ${tokenIn.symbol} ≈ ${rate ? rate.toFixed(6) : "0"} ${tokenOut.symbol}`}
        slippageTolerance={`${slippage}%`}
        minimumReceived={minReceived ? minReceived.toFixed(6) : undefined}
        tradingFee="0.30%"
        platformFee={PLATFORM_FEE_LABEL}
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
  // Truncated to 4 decimals (never rounded up) so the shown balance is always
  // spendable — e.g. 0.04717811 renders as 0.0471.
  const shortBalance = formatBalance4(balanceDisplay);

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
