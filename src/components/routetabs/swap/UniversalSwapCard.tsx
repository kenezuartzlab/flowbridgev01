import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/contracts";
import { FLOW_BRIDGE_ROUTER_V4_ABI } from "@/lib/flowbridge/routerV4Abi";
import { resolveFlowBridgeExecutionForNetwork } from "@/lib/flowbridge/executionRegistry";
import { requireSafeSwapDecision } from "@/lib/flowbridge/swapMethodPolicy";

import {
  getCuratedTokens,
  NATIVE_TOKEN_ADDRESS,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { getBestRoute, quoteLeg, type QuoteResult, type SwapStep } from "@/lib/swap/quoter";
import { readFlowUsdtReference } from "@/lib/swap/poolReference";
import { evaluateProtection } from "@/lib/swap/routeGuard";
import { SmartRoutePanel, NoRoutePanel, DexSelector } from "./SmartRoutePanel";
import { useFlowRouteGuard } from "@/lib/swap/useFlowRouteGuard";
import {
  isBlockingMode,
  isPreparationStale,
  preparationFingerprint,
  routeSignature,
  type RouteHop,
} from "@/lib/swap/routeGuard";
import type { SwapHydrationPlan } from "@/lib/ai/handoffHydration";
import {
  clearSwapDraft,
  readSwapDraft,
  setSwapDraft,
  useDexPreference,
  type SwapDraftScope,
} from "@/lib/trade/tradeSession";

import {
  captureVerifiedSwapAttribution,
  scheduleVerifiedSwapHandoff,
} from "@/lib/swap/verifiedSwapAttribution";
import type { SignedAttribution } from "@/lib/activity/activityHandoff";

import { maxSwappableFromBalance, routerFeeOnTop } from "@/lib/swap/platformFee";
import { estimateFlowPointsForUsd, isRewardEligibleUsd } from "@/lib/rewards";
import { useAppConfig, feeBpsLabel } from "@/lib/config/appConfig";
import { formatBalance4 } from "@/lib/format";

import { TokenPickerModal } from "./TokenPickerModal";
import { SlippagePopover } from "./SlippagePopover";
import { WarningPanel } from "@/components/routetabs/WarningPanel";
import { toFriendlyError, isNativeGasLow, lowGasMessage, lowGasSteps } from "@/lib/friendlyError";
import { LowGasSettingsModal } from "@/modals/LowGasSettingsModal";
import { atomicV4Target, encodeV3Path } from "@/lib/swap/atomicV4";
import { planExecution } from "@/lib/swap/executionCapability";
import { createSwapReviewSnapshot, reviewChanged, type SwapReviewSnapshot } from "@/lib/swap/reviewSnapshot";
import { readRouterV4Health, routerHealthWarning, type RouterV4Health } from "@/lib/swap/routerV4Health";
import { atomicFailureMessage, createRoutedSwapActivity, recordRoutedSwapTx } from "@/lib/swap/swapLifecycle";
import { sanitizeFailureReason, trackTradeOperationalEvent, trackLiquidityGap, type TradeOperationalEvent, type TradeOperationalEventName } from "@/lib/swap/operationalTelemetry";
import { trackProductEvent } from "@/lib/ops/productEvents";

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
  /**
   * V15.3F — one-shot prefill from a Flow AI prepared plan. Hints only: the card
   * still re-resolves registry, balance, allowance, live fee and quote, and only
   * the user's wallet can sign. Applied at most once per plan key so a manual
   * edit afterwards always wins.
   */
  hydration?: SwapHydrationPlan | null;
  onHydrationApplied?: (plan: SwapHydrationPlan) => void;
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
  hydration = null,
  onHydrationApplied,
}: UniversalSwapCardProps) {

  const { address } = useAccount();
  const publicClient = usePublicClient();
  // Ops telemetry: tag every trade event with public pair symbols only.
  const trackTrade = (e: TradeOperationalEvent) => trackTradeOperationalEvent({ tokenIn: tokenIn.symbol, tokenOut: tokenOut.symbol, ...e });
  const submittedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (address) trackProductEvent("wallet_connected", "trade", { once: true, network: balanceChainId });
  }, [address, balanceChainId]);
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  // Router used for the token-in ERC20 allowance check (the first step's router).
  // Recomputed after a quote arrives.

  const appConfig = useAppConfig(); // admin-published tokens, slippage + platform fee
  // Admin-published platform fee (bps) — mirrors FlowBridgeRouter's globalFeeBps and
  // drives the disclosed fee plus MAX/percentage head-room. Execution still reads the
  // exact fee from the contract before each swap.
  const platformFeeBps = appConfig.fees.platformFeeBps;
  /**
   * V15.3K §4 — ONE fee truth on this surface. The published config is only a
   * head-room hint; the disclosed fee row reads FlowBridgeRouter's mutable
   * `getFeeConfig()` live, so Trade can never show "0.1%" while the router
   * charges 0 bps (or vice versa).
   */
  const [liveFeeBps, setLiveFeeBps] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!publicClient) return;
    (async () => {
      try {
        const cfg = (await publicClient.readContract({
          address: contracts.flowBridgeRouterV3 as `0x${string}`,
          abi: FLOW_BRIDGE_ROUTER_V3_ABI,
          functionName: "getFeeConfig",
        })) as readonly [bigint, bigint, string];
        if (!cancelled) setLiveFeeBps(Number(cfg[0]));
      } catch {
        if (!cancelled) setLiveFeeBps(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, contracts.flowBridgeRouterV3]);
  const disclosedFeeBps = liveFeeBps ?? platformFeeBps;
  const platformFeeLabel =
    liveFeeBps !== null
      ? `${feeBpsLabel(liveFeeBps)} · live`
      : `${feeBpsLabel(platformFeeBps)} · rechecked before signing`;
  const curated = useMemo(() => getCuratedTokens(isMainnet), [isMainnet, appConfig]);
  /**
   * V15.3G §2 — the in-progress swap form is app-session state. It was local to
   * this component, so navigating away and back erased the pair and typed amount.
   * The draft is restored from `tradeSession` (scoped to the network being
   * rendered) and is a HINT only: quote, fee, allowance, balance and simulation
   * are all re-resolved below, and only the user's wallet can sign.
   */
  const draftScope: SwapDraftScope = isMainnet ? "MAINNET" : "TESTNET";
  const restoredDraft = useMemo(() => readSwapDraft(draftScope), [draftScope]);
  const pickToken = (symbol: string | undefined, fallback: Token) =>
    (symbol ? curated.find((t) => t.symbol === symbol) : undefined) ?? fallback;
  const [tokenIn, setTokenIn] = useState<Token>(() =>
    pickToken(restoredDraft?.tokenInSymbol, curated[0]),
  );
  const [tokenOut, setTokenOut] = useState<Token>(() =>
    pickToken(restoredDraft?.tokenOutSymbol, curated[2]),
  );
  const [amountIn, setAmountIn] = useState(restoredDraft?.amount ?? "");
  const [slippage, setSlippage] = useState(appConfig.fees.defaultSlippagePct);

  const [pickerOpen, setPickerOpen] = useState<"in" | "out" | null>(null);

  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [dexPref, setDexPref] = useDexPreference();
  // Quote freshness: executable quotes expire and are re-read every 20s.
  const [quoteTick, setQuoteTick] = useState(0);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<SwapReviewSnapshot | null>(null);
  const [routerHealth, setRouterHealth] = useState<RouterV4Health | null>(null);
  const [routerHealthFailed, setRouterHealthFailed] = useState(false);

  // Reset curated tokens when the NETWORK actually changes (not on remount —
  // remount must restore the session draft instead of clobbering it).
  const scopeRef = useRef<SwapDraftScope>(draftScope);
  useEffect(() => {
    if (scopeRef.current === draftScope) return;
    scopeRef.current = draftScope;
    setTokenIn(curated[0]);
    setTokenOut(curated[2]);
    setAmountIn("");
    clearSwapDraft();
    setQuote(null);
    setLastTx(null);
  }, [draftScope, curated]);

  // Persist the draft so SPA navigation cannot erase it.
  useEffect(() => {
    setSwapDraft({
      chainScope: draftScope,
      tokenInSymbol: tokenIn.symbol,
      tokenOutSymbol: tokenOut.symbol,
      amount: amountIn,
    });
  }, [draftScope, tokenIn.symbol, tokenOut.symbol, amountIn]);


  /**
   * V15.3F — apply a Flow AI prepared plan to the form exactly once per plan key.
   * Only symbols present in THIS network's curated registry are accepted; a
   * partially resolvable plan is ignored rather than half-filled. Nothing about
   * authorization changes: quote, fee, allowance and simulation are re-run below.
   */
  const appliedHydrationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydration || appliedHydrationRef.current === hydration.key) return;
    const nextIn = curated.find((t) => t.symbol === hydration.tokenInSymbol);
    const nextOut = curated.find((t) => t.symbol === hydration.tokenOutSymbol);
    if (!nextIn || !nextOut || nextIn.symbol === nextOut.symbol) return;
    appliedHydrationRef.current = hydration.key;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setAmountIn(hydration.amount);
    setQuote(null);
    setQuoteError(null);
    onHydrationApplied?.(hydration);
  }, [hydration, curated, onHydrationApplied]);


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

  const inBalanceUnavailable = tokenIn.isNative ? nativeBalance.isError : tokenInBalanceRead.isError;
  const outBalanceUnavailable = tokenOut.isNative ? nativeOutBalance.isError : tokenOutBalanceRead.isError;
  const inBalanceDisplay = inBalanceUnavailable ? "Unavailable" : formatUnits(inBalanceRaw, tokenIn.decimals);
  const outBalanceDisplay = outBalanceUnavailable ? "Unavailable" : formatUnits(outBalanceRaw, tokenOut.decimals);

  // Swap execution target + approval spender come from the canonical FlowBridge
  // execution registry (V4 on BOT Testnet, v3 on BOT Mainnet until V4 ships).
  const flowTarget = useMemo(() => resolveFlowBridgeExecutionForNetwork(isMainnet), [isMainnet]);
  const flowAbi = flowTarget.routerVersion === "v4"
    ? FLOW_BRIDGE_ROUTER_V4_ABI
    : FLOW_BRIDGE_ROUTER_V3_ABI;
  const flowRouter: Address = flowTarget.router;
  const firstStepRouter: Address = flowRouter;


  // Always-on native BOT balance for the low-gas warning banner (independent
  // of whichever token the user is spending).
  const nativeGasBalance = useBalance({ address, chainId: balanceChainId, query: balanceQuery });
  const nativeGasLow = !!address && isNativeGasLow(nativeGasBalance.data?.value, 18, "BOT");
  const [gasSettingsOpen, setGasSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isMainnet || !publicClient) return;
    const check = async () => {
      try {
        const health = await readRouterV4Health(publicClient as any);
        if (!cancelled) { setRouterHealth(health); setRouterHealthFailed(false); }
      } catch {
        if (!cancelled) { setRouterHealth(null); setRouterHealthFailed(true); }
      }
    };
    void check();
    const timer = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isMainnet, publicClient]);
  const healthWarning = isMainnet ? routerHealthWarning(routerHealth, routerHealthFailed) : null;



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
      const startedAt = performance.now();
      trackTrade({ eventName: "quote_requested", network: balanceChainId, routeType: "unknown", dex: dexPref, transactionCount: 0 });
      try {
        const parsed = parseUnits(amountIn, tokenIn.decimals);
        const result = await getBestRoute(tokenIn, tokenOut, parsed, isMainnet, dexPref);
        if (cancelled) return;
        if (!result) {
          setQuote(null);
          setQuoteError("No liquidity route yet");
          trackTrade({ eventName: "route_unavailable", network: balanceChainId, routeType: "unknown", dex: dexPref, transactionCount: 0, durationMs: performance.now() - startedAt });
          trackLiquidityGap({ network: balanceChainId, tokenIn: tokenIn.symbol, tokenOut: tokenOut.symbol, dexPreference: dexPref, dexesChecked: dexPref === "auto" ? ["bdex-v3", "bdex-v2", "caswap"] : [dexPref], directPoolFound: false, multihopFound: false, missingConnection: null });
        } else {
          setQuote(result);
          setQuoteError(null);
          const plan = planExecution(result.steps, balanceChainId);
          trackTrade({ eventName: "quote_success", network: balanceChainId, routeType: result.steps.length === 1 ? "single" : plan.execution === "ATOMIC_V4" ? "atomic_v4" : "staged", dex: [...new Set(result.steps.map((s) => s.dex))].join("+"), transactionCount: plan.execution === "ATOMIC_V4" ? 1 : result.steps.length, durationMs: performance.now() - startedAt });
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError("Liquidity information is temporarily unavailable");
          trackTrade({ eventName: "rpc_failure", network: balanceChainId, routeType: "unknown", dex: dexPref, transactionCount: 0, durationMs: performance.now() - startedAt, failureReason: e?.message });
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [amountIn, tokenIn, tokenOut, isMainnet, dexPref, quoteTick, balanceChainId]);

  useEffect(() => {
    if (!amountIn || busy) return;
    const t = setInterval(() => setQuoteTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [amountIn, busy]);

  // ── Writes ────────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const v3Fees = quote?.steps.flatMap((step) => step.v3Fee == null ? [] : [step.v3Fee]) ?? [];
  const tradingFeeLabel = v3Fees.length > 0
    ? v3Fees.map((fee) => `${(fee / 10_000).toFixed(fee % 10_000 === 0 ? 0 : 2)}%`).join(" + ")
    : "Router quoted";
  const livePriceImpactBps = quote?.steps.reduce((sum, step) => sum + (step.priceImpactBps ?? 0), 0) ?? 0;
  const priceImpactLabel = `${(livePriceImpactBps / 100).toFixed(2)}%`;

  // ── V30.2B P4A.2 — FLOW/USDT route circuit breaker ───────────────────────
  // Applies to the canonical FLOW/USDT route only. Read-only protection on
  // FlowBridge transaction preparation; it never touches the BDEX pool.
  const guardAmountIn = (() => {
    try {
      return amountIn && parseFloat(amountIn) > 0 ? parseUnits(amountIn, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  })();
  // Every hop of the quoted route: a better canonical multi-hop route (e.g.
  // FLOW → BOT → USDT) is allowed. The guard validates canonical hops and the
  // effective execution price, never the identity of the first hop.
  const guardHops: RouteHop[] = useMemo(
    () =>
      (quote?.steps ?? []).map((step) => ({
        routerId: step.routerId ?? null,
        router: step.router ?? null,
        path: step.path ?? [],
        v3Fee: step.v3Fee ?? null,
      })),
    [quote],
  );
  const guard = useFlowRouteGuard({
    isMainnet,
    tokenIn,
    tokenOut,
    amountIn: guardAmountIn,
    amountOut: quote?.amountOut ?? null,
    hops: guardHops,
    quotedImpactBps: quote ? livePriceImpactBps : null,
    chainOk: isNetworkCorrect,
  });
  // Never widen slippage: the mode cap and the absolute 5% ceiling both apply.
  const effectiveSlippage = guard.slippageCapPct != null
    ? Math.min(slippage, guard.slippageCapPct)
    : slippage;
  const guardBlocked = guard.guarded && !!guard.decision && !guard.decision.allowed && guardAmountIn > 0n;
  const guardFingerprintRef = useRef<string | null>(null);
  guardFingerprintRef.current = guard.fingerprint;

  const minOutFor = (expected: bigint) =>
    (expected * BigInt(Math.floor((100 - effectiveSlippage) * 1000))) / 100000n;

  const buildReviewSnapshot = async (candidate: QuoteResult, inputAmount: bigint) => {
    if (!address || !publicClient) throw new Error("Wallet or provider unavailable");
    const execution = planExecution(candidate.steps, balanceChainId);
    const atomic = isMainnet ? atomicV4Target(candidate.steps, 677) : null;
    let approvalCount = 0;
    const fees: string[] = [];
    if (atomic) {
      const [fee] = (await publicClient.readContract({ address: atomic.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "computeRouterFee", args: [BigInt(atomic.routerId), inputAmount, address] })) as readonly [bigint, bigint];
      fees.push(fee.toString());
      if (!candidate.steps[0].inIsNative) {
        const allowance = (await publicClient.readContract({ address: candidate.steps[0].path[0], abi: ERC20_ABI, functionName: "allowance", args: [address, atomic.router] })) as bigint;
        if (allowance < inputAmount + fee) approvalCount++;
      }
    } else {
      for (let i = 0; i < candidate.steps.length; i++) {
        const step = candidate.steps[i];
        const stepAmount = i === 0 ? inputAmount : candidate.steps[i - 1].expectedOut;
        const [fee] = (await publicClient.readContract({ address: flowRouter, abi: flowAbi, functionName: "computeRouterFee", args: [BigInt(step.routerId), stepAmount, address] })) as readonly [bigint, bigint];
        fees.push(fee.toString());
        if (!step.inIsNative) {
          const allowance = (await publicClient.readContract({ address: step.path[0], abi: ERC20_ABI, functionName: "allowance", args: [address, flowRouter] })) as bigint;
          if (allowance < stepAmount + fee) approvalCount++;
        }
      }
    }
    const transactionCount = (execution.execution === "ATOMIC_V4" ? 1 : candidate.steps.length) + approvalCount;
    return createSwapReviewSnapshot({ chainId: balanceChainId, tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: inputAmount, quote: candidate, minimumOut: minOutFor(candidate.amountOut), protocolFee: fees.join("|"), approvalCount, transactionCount });
  };

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
    minOutFloor?: bigint,
    onApprovalTx?: (hash: `0x${string}`, phase: "confirming" | "confirmed" | "failed") => void,
  ): Promise<`0x${string}`> => {
    if (!address) throw new Error("No wallet");
    const perLegMin = minOutFor(step.expectedOut);
    const minOut = minOutFloor != null && minOutFloor > perLegMin ? minOutFloor : perLegMin;
    const to = address as `0x${string}`;

    // Read the on-chain protocol fee for this swap so we approve/send the exact amount.
    let fee = 0n;
    let feeKnown = false;
    try {
      const res = (await publicClient!.readContract({
        address: flowRouter,
        abi: flowAbi,
        functionName: "computeRouterFee",
        args: [BigInt(step.routerId), amountInRaw, address as `0x${string}`],
      })) as readonly [bigint, bigint];
      fee = res[0] ?? 0n;
      feeKnown = true;
    } catch {
      // Fee read failed. On the canonical V4 path this is fatal (see below):
      // we never downgrade to a legacy call, because that drops the fee bound.
      fee = 0n;
    }
    const totalIn = amountInRaw + fee;
    // V4 hardened entry points bound the fee the router may charge. If the fee
    // view is unavailable on a V4 target we fail closed here — BEFORE any
    // approval or swap write — instead of falling back to a legacy call.
    const useSafe = requireSafeSwapDecision({ target: flowTarget, feeKnown });



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
          `Not enough ${step.symbolPath[0]} to cover this swap plus the ${platformFeeLabel} platform fee (${feeDisp} ${step.symbolPath[0]}). Tap MAX again or lower the amount slightly, then retry.`,
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
          onApprovalTx?.(approveTx, "confirming");
          const rcpt = await publicClient!.waitForTransactionReceipt({ hash: approveTx });
          onApprovalTx?.(approveTx, rcpt.status === "success" ? "confirmed" : "failed");
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
    const simulateAndEstimate = async (params: Record<string, unknown>) => {
      try {
        await publicClient!.simulateContract(params as Parameters<NonNullable<typeof publicClient>["simulateContract"]>[0]);
        trackTrade({ eventName: "simulation_success", network: balanceChainId, routeType: quote && quote.steps.length > 1 ? "staged" : "single", dex: step.dex, transactionCount: quote?.steps.length ?? 1 });
      } catch (error) {
        trackTrade({ eventName: "simulation_failure", network: balanceChainId, routeType: quote && quote.steps.length > 1 ? "staged" : "single", dex: step.dex, transactionCount: quote?.steps.length ?? 1, failureReason: error instanceof Error ? error.message : undefined });
        throw new Error("Transaction simulation failed. Nothing was submitted.");
      }
      try {
        const est = await publicClient!.estimateContractGas(params as Parameters<NonNullable<typeof publicClient>["estimateContractGas"]>[0]);
        return withBuffer(est);
      } catch {
        return FALLBACK_GAS;
      }
    };

    // ── Dispatch to the correct FlowBridgeRouter entry point ──────────────
    // V4 (`*Safe`) adds an explicit maxProtocolFee bound. The legacy calls are
    // reachable ONLY on an explicitly legacy (v3-legacy) execution target — never
    // as a runtime fallback for a resolved V4 route.
    if (step.inIsNative) {
      const base = (useSafe
        ? {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V4_ABI,
            functionName: "swapNativeToTokenSafe",
            args: [routerIdBig, amountInRaw, step.path[step.path.length - 1], feePool, minOut, step.path, to, deadline, fee],
            value: totalIn,
            account: address,
          }
        : {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V3_ABI,
            functionName: "swapNativeToToken",
            args: [routerIdBig, step.path[step.path.length - 1], feePool, minOut, step.path, to, deadline],
            value: totalIn,
            account: address,
          }) as any;
      const gas = await simulateAndEstimate(base);
      return await writeContractAsync({ ...base, gas });
    }

    if (step.outIsNative) {
      const base = (useSafe
        ? {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V4_ABI,
            functionName: "swapTokenToNativeSafe",
            args: [routerIdBig, step.path[0], feePool, amountInRaw, minOut, step.path, to, deadline, fee],
            account: address,
          }
        : {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V3_ABI,
            functionName: "swapTokenToNative",
            args: [routerIdBig, step.path[0], feePool, amountInRaw, minOut, step.path, to, deadline],
            account: address,
          }) as any;
      const gas = await simulateAndEstimate(base);
      return await writeContractAsync({ ...base, gas });
    }

    // ERC20 → ERC20
    if (isV3) {
      const base = (useSafe
        ? {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V4_ABI,
            functionName: "swapV3SingleSafe",
            args: [routerIdBig, step.path[0], step.path[step.path.length - 1], feePool, amountInRaw, minOut, to, deadline, fee],
            account: address,
          }
        : {
            address: flowRouter,
            abi: FLOW_BRIDGE_ROUTER_V3_ABI,
            functionName: "swapV3Single",
            args: [routerIdBig, step.path[0], step.path[step.path.length - 1], feePool, amountInRaw, minOut, to, deadline],
            account: address,
          }) as any;
      const gas = await simulateAndEstimate(base);
      return await writeContractAsync({ ...base, gas });
    }
    const base = (useSafe
      ? {
          address: flowRouter,
          abi: FLOW_BRIDGE_ROUTER_V4_ABI,
          functionName: "swapV2Safe",
          args: [routerIdBig, amountInRaw, minOut, step.path, to, deadline, fee],
          account: address,
        }
      : {
          address: flowRouter,
          abi: FLOW_BRIDGE_ROUTER_V3_ABI,
          functionName: "swapV2",
          args: [routerIdBig, amountInRaw, minOut, step.path, to, deadline],
          account: address,
        }) as any;
    const gas = await simulateAndEstimate(base);
    return await writeContractAsync({ ...base, gas });


  };



  const handleSwap = async () => {
    if (!address || !quote || !publicClient) return;
    setBusy(true);
    setTxError(null);
    setLastTx(null);
    submittedAtRef.current = null;
    {
      const p = planExecution(quote.steps, balanceChainId);
      trackTrade({ eventName: "signature_requested", network: balanceChainId, routeType: p.execution === "ATOMIC_V4" ? "atomic_v4" : quote.steps.length > 1 ? "staged" : "single", dex: [...new Set(quote.steps.map((s) => s.dex))].join("+"), transactionCount: p.execution === "ATOMIC_V4" ? 1 : quote.steps.length });
    }
    // Pre-flight: block if the wallet clearly can't afford network gas.
    let atomicAttempted = false;
    let routedActivity: ReturnType<typeof createRoutedSwapActivity> | null = null;
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
      const latestQuote = await getBestRoute(tokenIn, tokenOut, initialAmount, isMainnet, dexPref);
      if (!latestQuote) throw new Error("No live route available. Refresh and try again.");
      const freshPlan = planExecution(latestQuote.steps, balanceChainId);
      const freshAtomic = isMainnet ? atomicV4Target(latestQuote.steps, 677) : null;
      if (freshAtomic && (!routerHealth || !routerHealth.ok)) throw new Error(healthWarning ?? "Router V4 health check is still running. Review again shortly.");
      const freshSnapshot = await buildReviewSnapshot(latestQuote, initialAmount);
      if (!reviewSnapshot || reviewChanged(reviewSnapshot, freshSnapshot)) {
        setQuote(latestQuote);
        setReviewSnapshot(freshSnapshot);
        setConfirmOpen(true);
        trackTrade({ eventName: "review_invalidated", network: balanceChainId, routeType: freshPlan.execution === "ATOMIC_V4" ? "atomic_v4" : latestQuote.steps.length > 1 ? "staged" : "single", dex: [...new Set(latestQuote.steps.map((s) => s.dex))].join("+"), transactionCount: freshPlan.execution === "ATOMIC_V4" ? 1 : latestQuote.steps.length });
        throw new Error("Route changed — please review again");
      }
      setQuote(latestQuote);
      // V30.2B P4A.2 — revalidate the guarded FLOW/USDT route immediately before
      // signing. A changed route, pool, chain, amount or protection mode voids
      // the prepared transaction instead of silently signing something else.
      if (guard.guarded) {
        const pool = guard.reference?.pool;
        const mode = guard.policy?.mode ?? "reference_unavailable";
        const freshRoute = routeSignature(
          latestQuote.steps.map((step) => ({
            routerId: step.routerId ?? null,
            router: step.router ?? null,
            path: step.path ?? [],
            v3Fee: step.v3Fee ?? null,
          })),
        );
        if (!pool || latestQuote.steps.length === 0) {
          throw new Error("Price protection could not be revalidated. Refresh and try again.");
        }
        const revalidated = preparationFingerprint({
          chainId: 677,
          pool,
          route: freshRoute,
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: initialAmount,
          mode,
        });
        if (isBlockingMode(mode)) {
          throw new Error(guard.decision?.reason ?? "Price protection is blocking this swap right now.");
        }
        if (!guardFingerprintRef.current || isPreparationStale(guardFingerprintRef.current, revalidated)) {
          throw new Error("Route or protection mode changed. Review the new quote and try again.");
        }
      }
      let lastTx: `0x${string}` | null = null;
      let nextAmount = initialAmount;
      let activeQuote = latestQuote;
      let finalExpectedOut = latestQuote.amountOut;
      let finalToAmountDisplay = formatUnits(finalExpectedOut, tokenOut.decimals);

      // ============================================================
      // V8.2 (attribution): sign + persist a FRESH EIP-712
      // FlowBridgeActivityIntent for the ONE approved verified-swap path
      // (single-step, ERC-20 token-in), immediately before the swap write.
      // The implementation lives in a STATICALLY imported module so the
      // production client always retains the capture + verify-swap handoff.
      // Attribution evidence only: authorizes no calldata, moves no funds,
      // grants zero XP/PTS/FLOW and never writes the Activity Registry.
      // ============================================================
      let swapAttribution: SignedAttribution | null = null;

      const captureSwapAttribution = async () => {
        swapAttribution = await captureVerifiedSwapAttribution(
          {
            signTypedData: async (payload) => {
              const eth = (window as any).ethereum;
              if (!eth?.request) throw new Error("No typed-data signer available");
              const json = JSON.stringify(
                {
                  domain: payload.domain,
                  types: {
                    EIP712Domain: [
                      { name: "name", type: "string" },
                      { name: "version", type: "string" },
                      { name: "chainId", type: "uint256" },
                    ],
                    ...payload.types,
                  },
                  primaryType: payload.primaryType,
                  message: payload.message,
                },
                (_k, v) => (typeof v === "bigint" ? v.toString() : v),
              );
              return await eth.request({
                method: "eth_signTypedData_v4",
                params: [address, json],
              });
            },
          },
          {
            chainId: publicClient.chain?.id,
            steps: latestQuote.steps,
            amountIn: initialAmount,
            user: address as string,
          },
        );
      };

      // Fire-and-forget handoff of signed evidence only. A failed handoff never
      // resends or reverses the swap transaction.
      const handoffSwapAttribution = (sourceTxHash: `0x${string}`) => {
        const evidence = swapAttribution;
        if (!evidence) return;
        swapAttribution = null;
        scheduleVerifiedSwapHandoff(evidence, sourceTxHash);

      };

      await captureSwapAttribution();


      // The whole route must honour the "Min received" shown before confirming.
      const routeMinOut = minOutFor(latestQuote.amountOut);
      // Amount actually received from the previous leg (balance delta), so each
      // next leg swaps everything that arrived — no stray intermediate balance.
      let receivedFromPrev: bigint | null = null;
      const readOutBalance = async (s: SwapStep): Promise<bigint> =>
        s.outIsNative
          ? await publicClient.getBalance({ address: address as `0x${string}` })
          : ((await publicClient.readContract({
              address: s.path[s.path.length - 1],
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`],
            })) as bigint);

      // ATOMIC — V4: native BOT <-> BDEX V3 multi-pool in ONE Router V4 transaction.
      const atomic = isMainnet ? atomicV4Target(activeQuote.steps, 677) : null;
      if (atomic && activeQuote.steps.length > 1) {
        atomicAttempted = true;
        const me = address as `0x${string}`;
        routedActivity = createRoutedSwapActivity({ id: `routed-swap-${Date.now()}`, chainId: 677, wallet: me, pair: `${tokenIn.symbol}/${tokenOut.symbol}`, dex: "BDEX V3", amount: `${amountIn} ${tokenIn.symbol}` });
        const encodedPath = encodeV3Path(activeQuote.steps);
        const [fee] = (await publicClient.readContract({
          address: atomic.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "computeRouterFee",
          args: [BigInt(atomic.routerId), initialAmount, me],
        })) as readonly [bigint, bigint];
        const nativeIn = atomic.fn === "swapNativeToTokenV3MultiSafe";
        const tokenInAddr = activeQuote.steps[0].path[0];
        const tokenOutAddr = activeQuote.steps[activeQuote.steps.length - 1].path.slice(-1)[0];
        if (!nativeIn) {
          const allowance = (await publicClient.readContract({
            address: tokenInAddr, abi: ERC20_ABI, functionName: "allowance", args: [me, atomic.router],
          })) as bigint;
          if (allowance < initialAmount + fee) {
            setBusyMsg(`Approving exactly ${amountIn} ${tokenIn.symbol}…`);
            const ap = await writeContractAsync({
              address: tokenInAddr, abi: ERC20_ABI, functionName: "approve", args: [atomic.router, initialAmount + fee],
            });
            recordRoutedSwapTx(routedActivity, { hash: ap, label: `Approve ${tokenIn.symbol}`, phase: "confirming" });
            const ar = await publicClient.waitForTransactionReceipt({ hash: ap });
            recordRoutedSwapTx(routedActivity, { hash: ap, label: `Approve ${tokenIn.symbol}`, phase: ar.status === "success" ? "confirmed" : "failed" });
            if (ar.status !== "success") throw new Error(`Approval reverted (${shortHash(ap)})`);
          }
        }
        const args = [
          BigInt(atomic.routerId), nativeIn ? tokenOutAddr : tokenInAddr, encodedPath,
          initialAmount, routeMinOut, me, deadline, fee,
        ] as const;
        const req = {
          address: atomic.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: atomic.fn,
          args, account: me, ...(nativeIn ? { value: initialAmount + fee } : {}),
        } as const;
        // Fresh simulation right before the signature; reverts surface here.
        try {
          await publicClient.simulateContract(req as any);
          trackTrade({ eventName: "simulation_success", network: 677, routeType: "atomic_v4", dex: "bdex-v3", transactionCount: 1 });
        } catch (error) {
          trackTrade({ eventName: "simulation_failure", network: 677, routeType: "atomic_v4", dex: "bdex-v3", transactionCount: 1, failureReason: error instanceof Error ? error.message : undefined });
          throw error;
        }
        setBusyMsg(`ATOMIC — V4: 1 swap transaction…`);
        const tx = await writeContractAsync(req as any);
        recordRoutedSwapTx(routedActivity, { hash: tx, label: "Atomic Router V4 swap", phase: "confirming" });
        submittedAtRef.current = performance.now();
        trackTrade({ eventName: "tx_submitted", network: 677, routeType: "atomic_v4", dex: "bdex-v3", transactionCount: 1 });
        const rc = await publicClient.waitForTransactionReceipt({ hash: tx });
        recordRoutedSwapTx(routedActivity, { hash: tx, label: "Atomic Router V4 swap", phase: rc.status === "success" ? "confirmed" : "failed" });
        if (rc.status !== "success") throw new Error("Transaction reverted on-chain");
        trackTrade({ eventName: "tx_confirmed", network: 677, routeType: "atomic_v4", dex: "bdex-v3", transactionCount: 1, flowbridgeFeeBps: 1, gasUsed: Number(rc.gasUsed), durationMs: submittedAtRef.current == null ? undefined : performance.now() - submittedAtRef.current });
        handoffSwapAttribution(tx);
        lastTx = tx;
      }

      const ranAtomic = lastTx != null;
      if (!ranAtomic) routedActivity = createRoutedSwapActivity({ id: `routed-swap-${Date.now()}`, chainId: balanceChainId, wallet: address, pair: `${tokenIn.symbol}/${tokenOut.symbol}`, dex: [...new Set(activeQuote.steps.map((s) => s.dex))].join(" + "), amount: `${amountIn} ${tokenIn.symbol}` });
      for (let i = 0; !ranAtomic && i < activeQuote.steps.length; i++) {
        let step = activeQuote.steps[i];
        if (i > 0 && step.tokens) {
          // Smart Route Engine leg: re-quote against the exact amount received
          // from the previous leg; never reuse the optimistic search quote.
          nextAmount = receivedFromPrev ?? minOutFor(activeQuote.steps[i - 1].expectedOut);
          const [legIn, legOut] = step.tokens;
          const refreshedLeg = await quoteLeg(legIn, legOut, nextAmount, isMainnet, dexPref);
          if (!refreshedLeg) throw new Error("Route changed after the previous step. Refresh and try again.");
          step = refreshedLeg;
          activeQuote = { ...activeQuote, steps: activeQuote.steps.map((s0, j) => (j === i ? refreshedLeg : s0)) };
          if (i === activeQuote.steps.length - 1) {
            finalExpectedOut = refreshedLeg.expectedOut;
            finalToAmountDisplay = formatUnits(finalExpectedOut, tokenOut.decimals);
          }
        } else if (i > 0 && step.inIsNative) {
          nextAmount = receivedFromPrev ?? minOutFor(activeQuote.steps[i - 1].expectedOut);

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

        // FLOW/USDT legs inside a multi-hop route keep the P4A.2 circuit breaker.
        if (!guard.guarded && isMainnet && step.tokens) {
          const c677 = getContracts(true);
          const legAddrs = step.tokens.map((t) => (t.isNative ? "native" : t.address.toLowerCase()));
          const isFlowUsdtLeg =
            legAddrs.includes(c677.flowToken.toLowerCase()) && legAddrs.includes(c677.usdtBot.toLowerCase());
          if (isFlowUsdtLeg) {
            const ref = await readFlowUsdtReference(true).catch(() => null);
            const pol = evaluateProtection({
              deviationBps: ref?.deviationBps ?? null,
              referenceState: ref?.referenceState ?? "failed",
            });
            if (!ref || isBlockingMode(pol.mode)) {
              throw new Error(pol.reason || "FLOW price protection is blocking this route right now.");
            }
            if (effectiveSlippage * 100 > pol.slippageCapBps) {
              throw new Error(`Routes through FLOW/USDT allow at most ${pol.slippageCapBps / 100}% slippage right now. Lower slippage and try again.`);
            }
            if ((step.priceImpactBps ?? 0) > pol.maxPriceImpactBps) {
              throw new Error("FLOW/USDT price impact is above the protection limit. Lower the amount and try again.");
            }
          }
        }
        const isLastLeg = i === activeQuote.steps.length - 1;
        if (isLastLeg && activeQuote.steps.length > 1 && step.expectedOut < routeMinOut) {
          throw new Error(
            `Price moved: this route would now return less than the minimum shown (${formatUnits(routeMinOut, tokenOut.decimals)} ${tokenOut.symbol}). Your ${step.symbolPath[0]} from the earlier step is in your wallet — refresh and try again.`,
          );
        }
        const outBefore = isLastLeg ? null : await readOutBalance(step).catch(() => null);
        const tx = await executeStep(
          step,
          nextAmount,
          deadline,
          finalToAmountDisplay,
          isLastLeg && activeQuote.steps.length > 1 ? routeMinOut : undefined,
          (hash, phase) => routedActivity && recordRoutedSwapTx(routedActivity, { hash, label: `Approve ${step.symbolPath[0]}`, phase }),
        );
        lastTx = tx;
        if (routedActivity) recordRoutedSwapTx(routedActivity, { hash: tx, label: `Step ${i + 1}: ${stepLabel}`, phase: "confirming" });
        if (i === 0) {
          submittedAtRef.current = performance.now();
          trackTrade({ eventName: "tx_submitted", network: balanceChainId, routeType: activeQuote.steps.length > 1 ? "staged" : "single", dex: [...new Set(activeQuote.steps.map((s) => s.dex))].join("+"), transactionCount: activeQuote.steps.length });
        }
        const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
        if (routedActivity) recordRoutedSwapTx(routedActivity, { hash: tx, label: `Step ${i + 1}: ${stepLabel}`, phase: rcpt.status === "success" ? "confirmed" : "failed" });
        if (rcpt.status === "success" && outBefore != null) {
          const outAfter = await readOutBalance(step).catch(() => null);
          if (outAfter != null) {
            // Native output: add back this tx's gas so it isn't mistaken for less received.
            const gas = step.outIsNative ? rcpt.gasUsed * (rcpt.effectiveGasPrice ?? 0n) : 0n;
            const delta = outAfter + gas - outBefore;
            receivedFromPrev = delta > 0n ? delta : null;
          } else receivedFromPrev = null;
        } else receivedFromPrev = null;
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
          trackTrade({ eventName: "tx_reverted", network: balanceChainId, routeType: activeQuote.steps.length > 1 ? "staged" : "single", dex: step.dex, transactionCount: activeQuote.steps.length, failureReason: "transaction reverted" });
          return;
        }
        if (isLastLeg) trackTrade({ eventName: "tx_confirmed", network: balanceChainId, routeType: activeQuote.steps.length > 1 ? "staged" : "single", dex: [...new Set(activeQuote.steps.map((s) => s.dex))].join("+"), transactionCount: activeQuote.steps.length, gasUsed: Number(rcpt.gasUsed), durationMs: submittedAtRef.current == null ? undefined : performance.now() - submittedAtRef.current });
        handoffSwapAttribution(tx);
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
      const raw = e instanceof Error ? e.message : String(e ?? "");
      const msg = atomicAttempted ? `${atomicFailureMessage()} ${parseTxError(e)}` : parseTxError(e);
      setTxError(msg);
      toast.error(msg, { id: swapToastId });
      onSwapPhaseChange?.({ phase: "error", message: msg });
      const reason = sanitizeFailureReason(raw);
      const eventName: TradeOperationalEventName = atomicAttempted && reason === "transaction_reverted" ? "tx_reverted" : reason === "user_rejected" ? "wallet_rejected" : reason === "minimum_output_failure" ? "minimum_output_failure" : reason === "allowance_failure" ? "allowance_failure" : reason === "insufficient_balance" ? "insufficient_balance" : reason === "rpc_failure" ? "rpc_failure" : "quote_stale";
      trackTrade({ eventName, network: balanceChainId, routeType: atomicAttempted ? "atomic_v4" : quote.steps.length > 1 ? "staged" : "single", dex: [...new Set(quote.steps.map((s) => s.dex))].join("+"), transactionCount: atomicAttempted ? 1 : quote.steps.length, failureReason: raw });
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
      return maxSwappableFromBalance(spendable, platformFeeBps);
    }
    return maxSwappableFromBalance(inBalanceRaw, platformFeeBps);
  })();
  const maxSpendableDisplay = formatUnits(maxSpendableRaw, tokenIn.decimals);

  const [clamped, setClamped] = useState(false);

  // Free typing: any amount is allowed so users can quote/simulate. The swap
  // button is what blocks submission when the amount exceeds the spendable max
  // (balance − platform fee − gas reserve).
  const onAmountInChange = (v: string) => {
    setClamped(false);
    setAmountIn(v);
  };

  const onMax = () => {
    if (!inBalanceRaw) return;
    setClamped(false);
    setAmountIn(maxSpendableDisplay);
  };

  // Quick percentage chips (25/50/75) — always derived from the spendable max
  // so the fee/gas head-room is respected.
  const onPercent = (pct: number) => {
    if (maxSpendableRaw <= 0n) return;
    setClamped(false);
    if (pct >= 1) return setAmountIn(maxSpendableDisplay);
    const part = (maxSpendableRaw * BigInt(Math.round(pct * 10000))) / 10000n;
    setAmountIn(formatUnits(part, tokenIn.decimals));
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
  const totalDebit = parsedAmount + routerFeeOnTop(parsedAmount, platformFeeBps);
  const needsApproval = !tokenIn.isNative && parsedAmount > 0n && allowanceRaw < totalDebit;
  // Not submittable when the amount + 0.1% fee (+ native gas reserve) exceeds balance.
  const insufficient =
    totalDebit > inBalanceRaw || (maxSpendableRaw > 0n && parsedAmount > maxSpendableRaw);

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
    buttonLabel = "No liquidity route yet";
    buttonDisabled = true;
  } else if (guardBlocked) {
    buttonLabel =
      guard.policy?.mode === "reference_unavailable"
        ? "Price protection retrying…"
        : guard.policy?.mode === "paused_risk"
          ? "Swap paused — price protection"
          : "Trade restricted";
    buttonDisabled = true;
  } else if (needsApproval) {
    // V15.3K §6 — two wallet confirmations, stated up front.
    buttonLabel = busy ? busyMsg : `Approve then Swap · 2 wallet confirmations`;
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
    ? (Number(formatUnits(quote.amountOut, tokenOut.decimals)) * (100 - effectiveSlippage)) / 100
    : 0;

  const handleSubmit = async () => {
    if (!isConnected) return onConnect();
    if (!isNetworkCorrect) return onSwitchNetwork();
    if (!quote || !amountIn || parsedAmount === 0n) return;
    if (guardBlocked) return;
    if (!publicClient || !address) return;
    const plan = planExecution(quote.steps, balanceChainId);
    if (plan.execution === "ATOMIC_V4" && healthWarning) { setTxError(healthWarning); return; }
    try {
      setReviewSnapshot(await buildReviewSnapshot(quote, parsedAmount));
      setConfirmOpen(true);
      trackTrade({ eventName: "review_opened", network: balanceChainId, routeType: plan.execution === "ATOMIC_V4" ? "atomic_v4" : quote.steps.length > 1 ? "staged" : "single", dex: [...new Set(quote.steps.map((s) => s.dex))].join("+"), transactionCount: plan.execution === "ATOMIC_V4" ? 1 : quote.steps.length });
    } catch (e) {
      setTxError("Liquidity information is temporarily unavailable. Retry when the connection recovers.");
      trackTrade({ eventName: "rpc_failure", network: balanceChainId, routeType: plan.execution === "ATOMIC_V4" ? "atomic_v4" : quote.steps.length > 1 ? "staged" : "single", dex: [...new Set(quote.steps.map((s) => s.dex))].join("+"), transactionCount: plan.execution === "ATOMIC_V4" ? 1 : quote.steps.length, failureReason: e instanceof Error ? e.message : undefined });
    }
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
          <span className="text-lg font-black text-foreground uppercase tracking-widest font-mono">
            Swap
          </span>
        </div>
        <SlippagePopover value={slippage} onChange={setSlippage} />
      </div>

      {/* Card */}
      <div className="bg-card border border-hairline-strong rounded-[20px] shadow-[var(--fb-shadow-md)] p-3 sm:p-3.5 relative space-y-2">
        <TokenSide
          label="Sell"
          token={tokenIn}
          amount={amountIn}
          onAmountChange={onAmountInChange}
          balanceDisplay={inBalanceDisplay}
          onPickToken={() => setPickerOpen("in")}
          onMax={onMax}
          onPercent={onPercent}


          usdValue={usdValueFor(tokenIn, amountIn)}
          maxHint={
            maxSpendableRaw > 0n
              ? `Max swappable ${formatBalance4(maxSpendableDisplay)} ${tokenIn.symbol} — the ${feeBpsLabel(disclosedFeeBps)} platform fee${tokenIn.isNative ? " and gas reserve are" : " is"} taken on top of your amount.`
              : undefined
          }
          clampedNotice={
            insufficient && parsedAmount > 0n
              ? `Preview only — above your spendable balance. Max swappable is ${formatBalance4(maxSpendableDisplay)} ${tokenIn.symbol} (fee${tokenIn.isNative ? " + gas" : ""} taken on top). Tap MAX to fill it.`
              : clamped
                ? `Amount capped to your spendable balance (${formatBalance4(maxSpendableDisplay)} ${tokenIn.symbol}).`
                : undefined
          }

        />

        <div className="flex justify-center -my-5 relative z-20">
          <button
            type="button"
            onClick={onToggle}
            className="bg-card border border-hairline-strong text-muted hover:text-primary hover:border-primary/35 p-1.5 rounded-lg shadow-lg hover:rotate-180 transition-all duration-300 active:scale-90 cursor-pointer"
            title="Switch direction"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
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

      <DexSelector value={dexPref} onChange={setDexPref} disabled={busy} />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={buttonDisabled}
        className={cn(
          "w-full py-4 rounded-2xl text-sm font-black tracking-widest uppercase transition-all flex justify-center items-center gap-2 cursor-pointer font-sans",
          buttonDisabled
            ? "bg-background-elev text-muted-soft border border-hairline cursor-not-allowed shadow-none"
            : "bg-primary hover:bg-primary-strong text-primary-foreground fb-glow hover:scale-[1.01] active:scale-[0.99]",
        )}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <span>{buttonLabel}</span>
      </button>

      {/* V30.2B P4A.2 — why this FLOW/USDT trade is restricted */}
      {guardBlocked && guard.decision && (
        <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl px-3 py-2.5 text-[12px] font-mono text-amber-300 space-y-1">
          <div className="font-black uppercase tracking-widest text-[11px]">
            {guard.policy?.mode === "reference_unavailable"
              ? "Price protection retrying"
              : guard.policy?.mode === "paused_risk"
                ? "Swap preparation paused"
                : "Trade restricted"}
          </div>
          <div>{guard.decision.reason}</div>
          {guard.decision.retryable ? (
            <div className="text-amber-300/70">
              This clears by itself as soon as the live price check succeeds — no reload needed.
            </div>
          ) : null}
          {guard.decision.maxSafeAmountIn && guard.decision.maxSafeAmountIn > 0n ? (
            <div>
              Maximum safe amount right now:{" "}
              {formatBalance4(formatUnits(guard.decision.maxSafeAmountIn, tokenIn.decimals))} {tokenIn.symbol}. Enter it
              yourself — FlowBridge never changes your amount or splits a trade for you.
            </div>
          ) : null}
          <div className="text-amber-300/70">
            This limit applies to FlowBridge only. The pool itself is untouched.
          </div>
        </div>
      )}

      {/* Details — collapsed by default, summary row always visible */}
      {quote && !quoteError && (
        <div className="bg-card border border-hairline rounded-xl text-[12px] font-mono text-muted overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-foreground/[0.03] transition-colors"
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
              <div className="px-3 pb-3 space-y-1.5 border-t border-hairline pt-2.5">
                <Row label="Min received" value={`${minReceived.toFixed(6)} ${tokenOut.symbol}`} />
                <Row label="Slippage" value={`${effectiveSlippage}%`} />
                <Row label="Route" value={quote.symbolPath.join(" → ")} />
                <SmartRoutePanel quote={quote} tokenOut={tokenOut} chainId={isMainnet ? 677 : 968} dexPref={dexPref} />
                <Row label="Trading fee" value={tradingFeeLabel} />
                <Row label="Price impact" value={priceImpactLabel} />
                <Row label="Quote basis" value="Executable (on-chain)" />
                {guard.guarded && guard.policy ? (
                  <>
                    <Row
                      label="Protection mode"
                      value={`${guard.policy.mode.toUpperCase()} · max ${(guard.policy.maxPriceImpactBps / 100).toFixed(2)}% impact`}
                    />
                    <Row
                      label="Price reference"
                      value={
                        guard.reference?.referenceState === "ready"
                          ? `30-min average · ${((guard.reference.deviationBps ?? 0) / 100).toFixed(2)}% off`
                          : guard.reference?.referenceState === "warmup"
                            ? "Warming up (live quote checks only)"
                            : "Temporarily unavailable — retrying"
                      }
                    />
                    {guard.effectiveDeviationBps !== null ? (
                      <Row
                        label="Effective vs reference"
                        value={`${(guard.effectiveDeviationBps / 100).toFixed(2)}%`}
                      />
                    ) : null}
                  </>
                ) : null}
                <Row label="Platform fee" value={platformFeeLabel} />
                {disclosedFeeBps === 0 ? (
                  <Row label="Fee status" value="Router fee currently 0 bps" />
                ) : null}
                
                <Row
                  label="FLOW Points estimate"
                  value={
                    !rewardsActive
                      ? "Link email + wallet"
                      : swapUsd == null
                        ? "Price loading"
                        : rewardEligible
                          ? `+${estimatedFlowPoints.toLocaleString()} PTS (provisional)`
                          : `0 PTS · min ${formatUsd(rewardRules.minUsd)}`
                  }
                />
                <p className="pt-1 text-[10px] leading-relaxed text-muted/60 normal-case">
                  Amounts come straight from the routers you'll trade against, including any
                  token transfer tax (e.g. CA's temporary sell tax). Market/chart prices exclude
                  those taxes, so a chart price can look higher than your actual output.
                </p>
                <p className="pt-1 text-[10px] leading-relaxed text-muted/60 normal-case">
                  {rewardsActive
                    ? rewardEligible
                      ? `${formatUsd(swapUsd)} verified swap value qualifies for FLOW Points after the transaction confirms. PTS are off-chain and finalised daily.`
                      : `FLOW Points start at ${formatUsd(rewardRules.minUsd)} verified swap value. Smaller swaps can complete, but earn 0 PTS.`
                    : "FLOW Points require a verified email and the connected wallet bound to that account."}
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

      {healthWarning && quote && planExecution(quote.steps, balanceChainId).execution === "ATOMIC_V4" && (
        <WarningPanel type="warning" title="Atomic route unavailable" message={healthWarning} />
      )}

      {quoteError && amountIn && parseFloat(amountIn) > 0 && !quoting && (
        quoteError === "No liquidity route yet" ? (
          <NoRoutePanel
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            isMainnet={isMainnet}
            dexPref={dexPref}
            onTryAuto={() => setDexPref("auto")}
          />
        ) : (
          <WarningPanel type="warning" message={quoteError} />
        )
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
        <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 flex items-center justify-between gap-2 text-[12px] font-mono">
          <div className="flex flex-col gap-0.5">
            <span className="text-primary font-black uppercase tracking-widest">Swap Confirmed</span>
            <span className="text-muted">Receipt status: success</span>
          </div>
          <a
            href={`${txUrlPrefix}${lastTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary rounded-lg font-bold"
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
        onClose={() => { setConfirmOpen(false); setReviewSnapshot(null); }}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSwap();
        }}
        fromAmount={amountIn || "0"}
        fromSymbol={tokenIn.symbol}
        toAmount={amountOutDisplay || "0"}
        toSymbol={tokenOut.symbol}
        priceRate={`1 ${tokenIn.symbol} ≈ ${rate ? rate.toFixed(6) : "0"} ${tokenOut.symbol}`}
        slippageTolerance={`${effectiveSlippage}%`}
        minimumReceived={minReceived ? minReceived.toFixed(6) : undefined}
        tradingFee={tradingFeeLabel}
        priceImpact={priceImpactLabel}
        platformFee={platformFeeLabel}
        executionLabel={quote ? planExecution(quote.steps, balanceChainId).label : undefined}
        transactionCount={reviewSnapshot?.transactionCount}
        approvalCount={reviewSnapshot?.approvalCount}
        dexCount={quote ? new Set(quote.steps.map((s) => s.dex)).size : undefined}
        routeSteps={quote?.steps.map((s, i) => `${i + 1}. ${s.symbolPath[0]} → ${s.symbolPath[s.symbolPath.length - 1]} · ${s.dex}`)}
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
  onPercent?: (pct: number) => void;
  readOnly?: boolean;
  quoting?: boolean;
  usdValue?: string;
  maxHint?: string;
  clampedNotice?: string;
}

function TokenSide({
  label,
  token,
  amount,
  onAmountChange,
  balanceDisplay,
  onPickToken,
  onMax,
  onPercent,
  readOnly,
  quoting,
  usdValue,
  maxHint,
  clampedNotice,
}: TokenSideProps) {
  // Truncated to 4 decimals (never rounded up) so the shown balance is always
  // spendable — e.g. 0.04717811 renders as 0.0471.
  const shortBalance = formatBalance4(balanceDisplay);
  // Percentage chips only appear while the amount field is active (they fade
  // away on blur), mirroring the compact reference UI.
  const [focused, setFocused] = useState(false);
  const showPercents = !readOnly && !!onPercent && focused;



  return (
    <div className="bg-background border border-hairline px-3 py-2.5 rounded-xl space-y-1.5 font-sans shadow-inner">
      <div className="flex justify-between items-center text-[11px] font-black text-muted uppercase tracking-wider font-mono">
        <span>{label}</span>
        <div className="flex items-center gap-1.5 font-bold min-w-0">
          <span className="text-muted normal-case font-mono font-bold truncate">
            Balance: {shortBalance}
          </span>
          {!readOnly && onMax && (
            <button
              type="button"
              onClick={onMax}
              className="bg-primary/10 hover:bg-primary/20 active:scale-95 text-primary border border-primary/25 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest uppercase cursor-pointer shrink-0"
            >
              Max
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <div className="text-3xl sm:text-4xl font-black text-foreground leading-none h-[40px] flex items-center overflow-x-auto whitespace-nowrap scrollbar-none font-mono">
              {quoting ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
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
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onChange={(e) => onAmountChange?.(e.target.value)}
              className="bg-transparent text-foreground text-3xl sm:text-4xl font-black w-full min-w-0 focus:outline-none placeholder:text-muted-soft/50 leading-none h-[40px] font-mono"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onPickToken}
          className="bg-card hover:bg-background-elev pl-1 pr-2 py-1 rounded-full flex items-center gap-1.5 shrink-0 border border-hairline-strong hover:border-primary/40 font-mono cursor-pointer transition-colors max-w-[46%]"
        >
          <TokenIcon symbol={token.symbol} size={20} />
          <span className="font-black text-[13px] text-foreground tracking-wide uppercase truncate">
            {token.symbol}
          </span>
          <ChevronDown className="w-3 h-3 text-muted shrink-0" />
        </button>
      </div>

      {showPercents && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPercent?.(p)}
              className="flex-1 py-1 rounded-lg bg-card border border-hairline-strong text-[10px] font-black tracking-widest uppercase text-muted hover:text-primary hover:border-primary/30 active:scale-95 transition font-mono cursor-pointer"
            >
              {p === 1 ? "Max" : `${p * 100}%`}
            </button>
          ))}
        </div>
      )}




      <div className="text-muted font-medium flex items-center justify-between gap-2 text-[12px] font-mono leading-none">
        <span className="truncate">
          {token.isNative
            ? "Native BOT"
            : `${token.address.slice(0, 6)}…${token.address.slice(-4)}`}
        </span>
        {usdValue && <span className="text-muted shrink-0">≈ {usdValue}</span>}
      </div>

      {!readOnly && clampedNotice && (
        <p className="text-[11px] font-mono leading-snug text-[#FFC46B]">{clampedNotice}</p>
      )}
    </div>
  );

}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="uppercase tracking-wider">{label}</span>
      <span className="text-foreground font-bold">{value}</span>
    </div>
  );
}

// re-export to satisfy import linters when unused above
export const __NATIVE = NATIVE_TOKEN_ADDRESS;
