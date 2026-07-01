import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { toast } from "sonner";
import { TokenIcon } from "@/components/TokenIcon";
import { cn } from "@/lib/utils";
import {
  ERC20_ABI,
  FLOW_LIMIT_ORDER_EXECUTOR_ABI,
  WBOT_ABI,
  getContracts,
} from "@/lib/contracts";
import {
  getCuratedTokens,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { getBestRoute } from "@/lib/swap/quoter";
import { TokenPickerModal } from "@/components/routetabs/swap/TokenPickerModal";
import { WarningPanel } from "@/components/routetabs/WarningPanel";
import { resolveLimitRoute, isCrossRouterPair } from "@/lib/limitOrders/routing";
import { runPreflight, type PreflightResult } from "@/lib/limitOrders/preflight";
import { decodePlacedOrderId, executorAddress } from "@/lib/limitOrders/executor";
import { ActiveOrdersList } from "./ActiveOrdersList";
import { PriceTrendChart } from "@/components/routetabs/PriceTrendChart";

interface LimitOrderCardProps {
  isMainnet: boolean;
  isConnected: boolean;
  onConnect: () => void;
  isNetworkCorrect: boolean;
  onSwitchNetwork: () => void;
  txUrlPrefix: string;
  /** Resolve a USD price for a token symbol. */
  getUsdPrice?: (symbol: string) => number | null | undefined;
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  if (v === 0) return "$0.00";
  if (v < 0.01) return `$${v.toFixed(6)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  if (v < 1000) return `$${v.toFixed(2)}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const EXPIRY_PRESETS: { label: string; seconds: number }[] = [
  { label: "1 h", seconds: 3600 },
  { label: "24 h", seconds: 86_400 },
  { label: "7 d", seconds: 7 * 86_400 },
  { label: "30 d", seconds: 30 * 86_400 },
  { label: "Never", seconds: 0 },
];

const DEFAULT_KEEPER_BOUNTY_BOT = "0.001";

export function LimitOrderCard({
  isMainnet,
  isConnected,
  onConnect,
  isNetworkCorrect,
  onSwitchNetwork,
  txUrlPrefix,
  getUsdPrice,
}: LimitOrderCardProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  const executor = useMemo(() => executorAddress(isMainnet), [isMainnet]);
  const curated = useMemo(() => getCuratedTokens(isMainnet), [isMainnet]);

  // Default pair: BOT → USDT
  const [tokenIn, setTokenIn] = useState<Token>(curated[0]);
  const [tokenOut, setTokenOut] = useState<Token>(curated[2]);
  const [amountIn, setAmountIn] = useState("");
  const [limitPrice, setLimitPrice] = useState(""); // in tokenOut per 1 tokenIn
  const [expirySec, setExpirySec] = useState<number>(86_400);
  const [keeperBounty, setKeeperBounty] = useState(DEFAULT_KEEPER_BOUNTY_BOT);
  const [pickerOpen, setPickerOpen] = useState<"in" | "out" | null>(null);

  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [spotPrice, setSpotPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setTokenIn(curated[0]);
    setTokenOut(curated[2]);
  }, [curated]);

  const route = useMemo(
    () => resolveLimitRoute(tokenIn, tokenOut, isMainnet),
    [tokenIn, tokenOut, isMainnet],
  );
  const isCrossRouter = useMemo(
    () => isCrossRouterPair(tokenIn, tokenOut, isMainnet),
    [tokenIn, tokenOut, isMainnet],
  );

  // ── Live spot quote (for displaying current mid-price) ────────────────
  useEffect(() => {
    let cancelled = false;
    setSpotPrice(null);
    if (!amountIn || parseFloat(amountIn) <= 0) return;
    const handle = setTimeout(async () => {
      try {
        const parsed = parseUnits(amountIn, tokenIn.decimals);
        const q = await getBestRoute(tokenIn, tokenOut, parsed, isMainnet);
        if (!cancelled && q) {
          setSpotPrice(formatUnits(q.amountOut, tokenOut.decimals));
        }
      } catch {
        /* ignore */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [amountIn, tokenIn, tokenOut, isMainnet]);

  // ── Derived amounts ───────────────────────────────────────────────────
  const amountInRaw = useMemo(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) return 0n;
    try {
      return parseUnits(amountIn, tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [amountIn, tokenIn.decimals]);

  const minAmountOutRaw = useMemo(() => {
    if (!amountIn || !limitPrice || parseFloat(amountIn) <= 0 || parseFloat(limitPrice) <= 0) {
      return 0n;
    }
    try {
      const product = parseFloat(amountIn) * parseFloat(limitPrice);
      // Format with tokenOut decimals precision
      const str = product.toFixed(Math.min(tokenOut.decimals, 12));
      return parseUnits(str, tokenOut.decimals);
    } catch {
      return 0n;
    }
  }, [amountIn, limitPrice, tokenOut.decimals]);

  const expiryUnix = useMemo(() => {
    if (expirySec === 0) return 0n;
    return BigInt(Math.floor(Date.now() / 1000) + expirySec);
  }, [expirySec]);

  const keeperBountyWei = useMemo(() => {
    try {
      return parseUnits(keeperBounty || "0", 18);
    } catch {
      return 0n;
    }
  }, [keeperBounty]);

  // ── Run preflight whenever inputs change ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!address || !publicClient || !route || !executor || amountInRaw === 0n) {
      setPreflight(null);
      return;
    }
    setPreflightBusy(true);
    (async () => {
      try {
        const r = await runPreflight({
          publicClient,
          isMainnet,
          user: address as Address,
          route,
          tokenIn,
          tokenOut,
          amountInRaw,
          minAmountOutRaw,
          expiryUnix,
          keeperBountyWei,
        });
        if (!cancelled) setPreflight(r);
      } catch {
        if (!cancelled) setPreflight(null);
      } finally {
        if (!cancelled) setPreflightBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    address, publicClient, isMainnet, route, executor,
    amountInRaw, minAmountOutRaw, expiryUnix, keeperBountyWei,
    tokenIn, tokenOut, refreshTick,
  ]);

  const { writeContractAsync } = useWriteContract();

  const handleFlip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setLimitPrice("");
    setPreflight(null);
    setSpotPrice(null);
  };

  const handleWrap = async () => {
    if (!route?.needsWrap || !publicClient || !address) return;
    const need = (preflight?.wrapAmount ?? 0n) - 0n; // preflight.wrapAmount already accounts for balance
    const wrapAmount = preflight?.wrapAmount ?? 0n;
    if (wrapAmount === 0n) return;
    setBusy(true);
    setBusyMsg(`Wrapping BOT → ${route.needsWrap.label}…`);
    const toastId = toast.loading(`Wrapping BOT → ${route.needsWrap.label}…`);
    try {
      const tx = await writeContractAsync({
        address: route.needsWrap.wbot,
        abi: WBOT_ABI,
        functionName: "deposit",
        value: wrapAmount,
      });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (rcpt.status !== "success") {
        toast.error("Wrap reverted", { id: toastId });
      } else {
        toast.success(`Wrapped ${route.needsWrap.label}`, { id: toastId });
        setRefreshTick((n) => n + 1);
      }
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Wrap failed", { id: toastId });
    } finally {
      setBusy(false);
      setBusyMsg("");
      void need;
    }
  };

  const handleApprove = async () => {
    if (!route || !executor || !publicClient) return;
    setBusy(true);
    setBusyMsg(`Approving ${tokenSymbolFor(route.onchainTokenIn, contracts)}…`);
    const toastId = toast.loading("Approving…");
    try {
      const tx = await writeContractAsync({
        address: route.onchainTokenIn,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [executor, amountInRaw],
      });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (rcpt.status !== "success") {
        toast.error("Approval reverted", { id: toastId });
      } else {
        toast.success("Approved", { id: toastId });
        setRefreshTick((n) => n + 1);
      }
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Approval failed", { id: toastId });
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  };

  const handlePlace = async () => {
    if (!route || !executor || !publicClient || !address || !preflight?.ok) return;
    setBusy(true);
    setBusyMsg("Placing limit order…");
    const toastId = toast.loading("Placing limit order…");
    try {
      const tx = await writeContractAsync({
        address: executor,
        abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
        functionName: "placeOrder",
        args: [
          route.onchainTokenIn,
          route.onchainTokenOut,
          amountInRaw,
          minAmountOutRaw,
          expiryUnix,
          BigInt(route.routerId),
          route.feePoolV3,
          address as Address,
        ],
        value: keeperBountyWei,
      });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (rcpt.status !== "success") {
        toast.error("Placement reverted", { id: toastId });
        return;
      }
      const orderId = decodePlacedOrderId(rcpt, executor);
      toast.success(orderId != null ? `Order #${orderId} placed` : "Order placed", {
        id: toastId,
        action: {
          label: "View",
          onClick: () => window.open(`${txUrlPrefix}${tx}`, "_blank"),
        },
      });
      setAmountIn("");
      setLimitPrice("");
      setPreflight(null);
      setRefreshTick((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Placement failed", { id: toastId });
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  };

  // ── Rendered actions ──────────────────────────────────────────────────
  const canAct = isConnected && isNetworkCorrect && !!route && !!executor;
  const errorIssues = preflight?.issues.filter((i) => i.severity === "error") ?? [];
  const warnIssues = preflight?.issues.filter((i) => i.severity === "warning") ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#0D1C2A] border border-white/10 rounded-[24px] p-4 space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-black uppercase tracking-widest text-[13px]">Limit Order</h3>
          {route ? (
            <span className="text-[9px] text-[#32FF8B] font-bold uppercase tracking-widest">
              {route.humanLabel}
            </span>
          ) : isCrossRouter ? (
            <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">
              Unsupported pair
            </span>
          ) : null}
        </div>

        {/* You pay */}
        <TokenAmountRow
          label="You pay"
          token={tokenIn}
          amount={amountIn}
          onAmountChange={setAmountIn}
          onPickToken={() => setPickerOpen("in")}
          editable
        />

        <div className="flex justify-center">
          <button
            onClick={handleFlip}
            className="p-2 rounded-xl bg-[#010C1B] border border-white/10 hover:border-[#32FF8B]/40 cursor-pointer transition-colors"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-[#32FF8B]" />
          </button>
        </div>

        {/* You receive (at limit) */}
        <TokenAmountRow
          label="You receive (at limit)"
          token={tokenOut}
          amount={
            minAmountOutRaw > 0n
              ? Number(formatUnits(minAmountOutRaw, tokenOut.decimals)).toFixed(
                  Math.min(tokenOut.decimals, 6),
                )
              : ""
          }
          onAmountChange={() => {}}
          onPickToken={() => setPickerOpen("out")}
          editable={false}
        />

        {/* Limit price editor (USD-friendly with quick presets) */}
        <LimitPriceEditor
          tokenIn={tokenIn}
          tokenOut={tokenOut}
          amountIn={amountIn}
          spotOut={spotPrice}
          limitPrice={limitPrice}
          onLimitPriceChange={setLimitPrice}
          getUsdPrice={getUsdPrice}
        />


        {/* Order preview */}
        {route && amountIn && parseFloat(amountIn) > 0 && (
          <OrderPreviewPanel
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            amountIn={amountIn}
            spotOut={spotPrice}
            limitOut={
              minAmountOutRaw > 0n
                ? formatUnits(minAmountOutRaw, tokenOut.decimals)
                : null
            }
            routeLabel={route.humanLabel}
            getUsdPrice={getUsdPrice}
          />
        )}


        {/* Expiry */}
        <div className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">Expires in</span>
          <div className="flex gap-1.5 flex-wrap">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setExpirySec(p.seconds)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors",
                  expirySec === p.seconds
                    ? "bg-[#32FF8B]/15 text-[#32FF8B] border border-[#32FF8B]/40"
                    : "bg-white/5 text-[#C5C1B9] border border-white/10 hover:border-white/25",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Keeper tip */}
        <details className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 group">
          <summary className="text-[10px] uppercase tracking-widest text-[#C5C1B9] cursor-pointer flex justify-between items-center">
            Keeper tip (advanced)
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={keeperBounty}
                onChange={(e) => setKeeperBounty(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.001"
                className="flex-1 bg-transparent text-white text-sm font-mono focus:outline-none"
              />
              <span className="text-[11px] text-[#C5C1B9]">BOT (native)</span>
            </div>
            <p className="text-[9px] text-[#C5C1B9] leading-snug">
              Bounty paid to whichever keeper executes your order. Higher = faster fill.
            </p>
          </div>
        </details>

        {/* Preflight status */}
        {isCrossRouter && (
          <WarningPanel
            type="warning"
            title="CA ↔ USDT not placeable"
            message="Limit orders bind to a single DEX. CA/USDT needs two DEXes (CaSwap V2 + BDex V3). Use instant Swap instead."
          />
        )}

        {preflightBusy && (
          <div className="text-[10px] text-[#C5C1B9] flex items-center gap-1.5 uppercase tracking-widest">
            <Loader2 className="w-3 h-3 animate-spin" /> Running on-chain checks…
          </div>
        )}

        {preflight && errorIssues.length > 0 && (
          <div className="space-y-1.5">
            {errorIssues.map((i, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg px-2.5 py-2"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{i.message}</span>
              </div>
            ))}
          </div>
        )}

        {preflight && warnIssues.length > 0 && (
          <div className="space-y-1.5">
            {warnIssues.map((i, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-2"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{i.message}</span>
              </div>
            ))}
          </div>
        )}

        {preflight && preflight.ok && (
          <div className="flex items-center gap-2 text-[11px] text-[#32FF8B] bg-[#32FF8B]/5 border border-[#32FF8B]/20 rounded-lg px-2.5 py-2">
            <CheckCircle2 className="w-3 h-3" />
            <span>
              Ready — placement fee {formatUnits(preflight.placementFee, tokenIn.decimals)}{" "}
              {tokenIn.symbol} ({Number(preflight.effectiveBps) / 100}%)
            </span>
          </div>
        )}

        {/* Actions */}
        {!isConnected ? (
          <ActionButton onClick={onConnect}>Connect wallet</ActionButton>
        ) : !isNetworkCorrect ? (
          <ActionButton onClick={onSwitchNetwork}>Switch to BOT Chain</ActionButton>
        ) : !executor ? (
          <ActionButton disabled>Not deployed on this network</ActionButton>
        ) : !route ? (
          <ActionButton disabled>Pair not supported</ActionButton>
        ) : preflight?.wrapAmount && preflight.wrapAmount > 0n ? (
          <ActionButton onClick={handleWrap} disabled={busy}>
            {busy ? busyMsg : `Wrap BOT → ${route.needsWrap?.label ?? "WBOT"}`}
          </ActionButton>
        ) : preflight?.needsApprove ? (
          <ActionButton onClick={handleApprove} disabled={busy || !canAct}>
            {busy ? busyMsg : `Approve ${tokenSymbolFor(route.onchainTokenIn, contracts)}`}
          </ActionButton>
        ) : (
          <ActionButton
            onClick={handlePlace}
            disabled={busy || !preflight?.ok}
          >
            {busy ? busyMsg : "Place limit order"}
          </ActionButton>
        )}
      </div>

      {/* Price trend for the selected pair */}
      <PairPriceChart
        tokenIn={tokenIn}
        tokenOut={tokenOut}
        spotOut={spotPrice}
        amountIn={amountIn}
        getUsdPrice={getUsdPrice}
      />

      <ActiveOrdersList
        isMainnet={isMainnet}
        txUrlPrefix={txUrlPrefix}
        refreshTick={refreshTick}
      />


      <TokenPickerModal
        isOpen={pickerOpen !== null}
        onClose={() => setPickerOpen(null)}
        onSelect={(t) => {
          if (pickerOpen === "in") setTokenIn(t);
          else if (pickerOpen === "out") setTokenOut(t);
          setPickerOpen(null);
          setAmountIn("");
          setLimitPrice("");
          setPreflight(null);
        }}
        isMainnet={isMainnet}
        excludeAddress={pickerOpen === "in" ? tokenOut.address : tokenIn.address}
        title={pickerOpen === "in" ? "Select input token" : "Select output token"}
      />
    </div>
  );
}

function tokenSymbolFor(addr: Address, contracts: ReturnType<typeof getContracts>): string {
  const a = addr.toLowerCase();
  if (a === contracts.wbot.toLowerCase()) return "WBOT";
  if (a === contracts.caWbot.toLowerCase()) return "caWBOT";
  if (a === contracts.usdtBot.toLowerCase()) return "USDT";
  if (a === contracts.caToken.toLowerCase()) return "CA";
  return "TOKEN";
}

function TokenAmountRow({
  label,
  token,
  amount,
  onAmountChange,
  onPickToken,
  editable,
}: {
  label: string;
  token: Token;
  amount: string;
  onAmountChange: (v: string) => void;
  onPickToken: () => void;
  editable: boolean;
}) {
  return (
    <div className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={amount}
          onChange={(e) => editable && onAmountChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          readOnly={!editable}
          className={cn(
            "flex-1 bg-transparent text-white text-xl font-black focus:outline-none",
            !editable && "opacity-70",
          )}
        />
        <button
          type="button"
          onClick={onPickToken}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-2.5 py-1.5 cursor-pointer"
        >
          <TokenIcon symbol={token.symbol} size={20} />
          <span className="text-white text-[12px] font-black tracking-wider">{token.symbol}</span>
          <ChevronDown className="w-3 h-3 text-[#C5C1B9]" />
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest font-mono transition-colors",
        disabled
          ? "bg-white/5 text-[#C5C1B9] cursor-not-allowed border border-white/10"
          : "bg-[#32FF8B] hover:bg-[#32FF8B]/90 text-[#010C1B] cursor-pointer",
      )}
    >
      {children}
    </button>
  );
}

function OrderPreviewPanel({
  tokenIn,
  tokenOut,
  amountIn,
  spotOut,
  limitOut,
  routeLabel,
  getUsdPrice,
}: {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  spotOut: string | null;
  limitOut: string | null;
  routeLabel: string;
  getUsdPrice?: (symbol: string) => number | null | undefined;
}) {
  const inPx = getUsdPrice?.(tokenIn.symbol) ?? null;
  const outPx = getUsdPrice?.(tokenOut.symbol) ?? null;
  const inAmt = parseFloat(amountIn) || 0;
  const spotAmt = spotOut ? parseFloat(spotOut) : null;
  const limitAmt = limitOut ? parseFloat(limitOut) : null;

  const payUsd = inPx != null ? inAmt * inPx : null;
  const spotUsd = outPx != null && spotAmt != null ? spotAmt * outPx : null;
  const limitUsd = outPx != null && limitAmt != null ? limitAmt * outPx : null;

  const deltaBps =
    spotAmt != null && limitAmt != null && spotAmt > 0
      ? ((limitAmt - spotAmt) / spotAmt) * 100
      : null;

  return (
    <div className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 space-y-2 text-[11px] font-mono">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">
          Order preview
        </span>
        <span className="text-[9px] text-[#32FF8B] uppercase tracking-widest font-bold">
          {routeLabel}
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#C5C1B9]">You pay</span>
        <span className="text-white font-black">
          {inAmt.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tokenIn.symbol}
          <span className="text-[#C5C1B9] font-mono ml-1.5">({fmtUsd(payUsd)})</span>
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#C5C1B9]">Expected @ market</span>
        <span className="text-white font-black">
          {spotAmt != null
            ? `${spotAmt.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`
            : "—"}
          <span className="text-[#C5C1B9] font-mono ml-1.5">({fmtUsd(spotUsd)})</span>
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-[#C5C1B9]">Min @ limit</span>
        <span className="text-[#32FF8B] font-black">
          {limitAmt != null
            ? `${limitAmt.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`
            : "—"}
          <span className="text-[#C5C1B9] font-mono ml-1.5">({fmtUsd(limitUsd)})</span>
        </span>
      </div>

      {deltaBps != null && (
        <div className="flex justify-between pt-1 border-t border-white/5">
          <span className="text-[#C5C1B9]">Δ vs spot</span>
          <span
            className={cn(
              "font-black",
              deltaBps >= 0 ? "text-[#32FF8B]" : "text-amber-300",
            )}
          >
            {deltaBps >= 0 ? "+" : ""}
            {deltaBps.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}

function PairPriceChart({
  tokenIn,
  tokenOut,
  spotOut,
  amountIn,
  getUsdPrice,
}: {
  tokenIn: Token;
  tokenOut: Token;
  spotOut: string | null;
  amountIn: string;
  getUsdPrice?: (symbol: string) => number | null | undefined;
}) {
  // Prefer live pair rate (tokenOut per 1 tokenIn) in USD terms of tokenIn.
  const outPx = getUsdPrice?.(tokenOut.symbol) ?? null;
  const inPx = getUsdPrice?.(tokenIn.symbol) ?? null;
  let livePrice: number | null = null;
  const parsedIn = parseFloat(amountIn);
  if (spotOut && parsedIn > 0 && outPx != null) {
    livePrice = (parseFloat(spotOut) / parsedIn) * outPx;
  } else if (inPx != null) {
    livePrice = inPx;
  }
  if (livePrice == null || !isFinite(livePrice) || livePrice <= 0) return null;
  return (
    <div className="bg-[#0D1C2A] border border-white/10 rounded-[24px] p-4 font-mono">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">
          {tokenIn.symbol} / {tokenOut.symbol} · price trend
        </span>
        <span className="text-[10px] text-[#32FF8B] font-black">
          {fmtUsd(livePrice)}
        </span>
      </div>
      <PriceTrendChart currentLivePrice={livePrice} />
    </div>
  );
}

/**
 * User-friendly limit price editor.
 * Users set a target USD price for the "base" (non-stable) asset — e.g. "sell BOT @ $12"
 * or "buy BOT @ $8". Under the hood we still store the rate as tokenOut per 1 tokenIn.
 * Advanced mode lets power users type the raw pair rate.
 */
function LimitPriceEditor({
  tokenIn,
  tokenOut,
  amountIn,
  spotOut,
  limitPrice,
  onLimitPriceChange,
  getUsdPrice,
}: {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  spotOut: string | null;
  limitPrice: string;
  onLimitPriceChange: (v: string) => void;
  getUsdPrice?: (symbol: string) => number | null | undefined;
}) {
  const STABLES = new Set(["USDT", "USDC", "DAI", "USD"]);
  const inPx = getUsdPrice?.(tokenIn.symbol) ?? null;
  const outPx = getUsdPrice?.(tokenOut.symbol) ?? null;

  // Pick the "base" asset: prefer non-stable side, default to tokenIn.
  const baseIsIn = !STABLES.has(tokenIn.symbol) || STABLES.has(tokenOut.symbol);
  const baseToken = baseIsIn ? tokenIn : tokenOut;
  const quoteToken = baseIsIn ? tokenOut : tokenIn;
  const basePx = baseIsIn ? inPx : outPx;
  const quotePx = baseIsIn ? outPx : inPx;

  const isSell = baseIsIn; // paying base for quote = "sell base"
  const actionWord = isSell ? "Sell" : "Buy";

  // Spot rate = tokenOut per 1 tokenIn.
  const parsedAmt = parseFloat(amountIn) || 0;
  const spotRate =
    spotOut && parsedAmt > 0 ? parseFloat(spotOut) / parsedAmt : null;

  // Convert between (rate = tokenOut per tokenIn) and (targetUsd = USD price of base).
  const rateToTargetUsd = (rate: number): number | null => {
    if (!isFinite(rate) || rate <= 0) return null;
    if (baseIsIn) {
      // rate = quote per base ⇒ baseUsd = rate * quoteUsd
      if (quotePx == null) return null;
      return rate * quotePx;
    } else {
      // rate = base per quote ⇒ baseUsd = quoteUsd / rate
      if (quotePx == null) return null;
      return quotePx / rate;
    }
  };
  const targetUsdToRate = (usd: number): number | null => {
    if (!isFinite(usd) || usd <= 0 || quotePx == null) return null;
    return baseIsIn ? usd / quotePx : quotePx / usd;
  };

  const [mode, setMode] = useState<"usd" | "rate">("usd");
  const [usdInput, setUsdInput] = useState("");

  const canUseUsd = quotePx != null;

  // Keep USD input in sync when the rate changes externally (flip, presets, spot).
  useEffect(() => {
    if (mode !== "usd") return;
    const n = parseFloat(limitPrice);
    if (!isFinite(n) || n <= 0) {
      setUsdInput("");
      return;
    }
    const usd = rateToTargetUsd(n);
    if (usd == null) return;
    setUsdInput(usd.toFixed(usd < 1 ? 6 : usd < 100 ? 4 : 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitPrice, baseIsIn, quotePx]);

  const handleUsdChange = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, "");
    setUsdInput(clean);
    const n = parseFloat(clean);
    const rate = isFinite(n) ? targetUsdToRate(n) : null;
    if (rate != null) {
      onLimitPriceChange(rate.toFixed(Math.min(tokenOut.decimals, 10)));
    } else if (clean === "") {
      onLimitPriceChange("");
    }
  };

  const applyPresetPct = (pct: number) => {
    if (spotRate == null) return;
    // For a SELL, positive pct = higher target price = better for user (rate ↑).
    // For a BUY, positive pct = higher target price = worse (they want lower). We invert.
    const bias = isSell ? 1 + pct / 100 : 1 - pct / 100;
    const newRate = spotRate * bias;
    onLimitPriceChange(newRate.toFixed(Math.min(tokenOut.decimals, 10)));
  };

  const spotUsd = spotRate != null ? rateToTargetUsd(spotRate) : basePx;

  return (
    <div className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">
          {actionWord} {baseToken.symbol} @ target price
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode("usd")}
            disabled={!canUseUsd}
            className={cn(
              "px-2 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-black transition-colors",
              mode === "usd"
                ? "bg-[#32FF8B]/15 text-[#32FF8B] border border-[#32FF8B]/40"
                : "bg-white/5 text-[#C5C1B9] border border-white/10 hover:border-white/25 cursor-pointer",
              !canUseUsd && "opacity-40 cursor-not-allowed",
            )}
          >
            USD
          </button>
          <button
            type="button"
            onClick={() => setMode("rate")}
            className={cn(
              "px-2 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-black transition-colors cursor-pointer",
              mode === "rate"
                ? "bg-[#32FF8B]/15 text-[#32FF8B] border border-[#32FF8B]/40"
                : "bg-white/5 text-[#C5C1B9] border border-white/10 hover:border-white/25",
            )}
          >
            Rate
          </button>
        </div>
      </div>

      {mode === "usd" && canUseUsd ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-lg font-black">$</span>
            <input
              value={usdInput}
              onChange={(e) => handleUsdChange(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="flex-1 bg-transparent text-white text-lg font-black focus:outline-none min-w-0"
            />
            <span className="text-[11px] text-[#C5C1B9] whitespace-nowrap">
              per {baseToken.symbol}
            </span>
          </div>
          <p className="text-[9px] text-[#C5C1B9] leading-snug">
            {isSell
              ? `Order fills when 1 ${baseToken.symbol} trades at or above your price.`
              : `Order fills when 1 ${baseToken.symbol} trades at or below your price.`}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={limitPrice}
            onChange={(e) =>
              onLimitPriceChange(e.target.value.replace(/[^0-9.]/g, ""))
            }
            placeholder="0.0"
            inputMode="decimal"
            className="flex-1 bg-transparent text-white text-lg font-black focus:outline-none min-w-0"
          />
          <span className="text-[11px] text-[#C5C1B9] whitespace-nowrap">
            {tokenOut.symbol} / {tokenIn.symbol}
          </span>
        </div>
      )}

      {/* Quick presets */}
      {spotRate != null && (
        <div className="flex gap-1 flex-wrap">
          {[-10, -5, 0, 5, 10].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPresetPct(p)}
              className={cn(
                "px-2 py-0.5 rounded-md text-[9px] uppercase tracking-widest font-black cursor-pointer transition-colors",
                p === 0
                  ? "bg-white/10 text-white border border-white/20 hover:border-white/40"
                  : (isSell ? p > 0 : p < 0)
                  ? "bg-[#32FF8B]/5 text-[#32FF8B] border border-[#32FF8B]/25 hover:border-[#32FF8B]/50"
                  : "bg-amber-500/5 text-amber-300 border border-amber-500/25 hover:border-amber-500/50",
              )}
            >
              {p === 0 ? "Spot" : `${p > 0 ? "+" : ""}${p}%`}
            </button>
          ))}
        </div>
      )}

      {/* Spot reference + preview of what user gets */}
      <div className="flex items-center justify-between text-[10px] text-[#C5C1B9] pt-1 border-t border-white/5">
        <span>
          Spot: {spotUsd != null ? fmtUsd(spotUsd) : "—"}
          {spotRate != null && (
            <span className="text-white/40 ml-1">
              ({spotRate.toFixed(6)} {tokenOut.symbol}/{tokenIn.symbol})
            </span>
          )}
        </span>
        {parsedAmt > 0 && parseFloat(limitPrice) > 0 && (
          <span className="text-white font-black">
            → {(parsedAmt * parseFloat(limitPrice)).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}{" "}
            {tokenOut.symbol}
          </span>
        )}
      </div>
    </div>
  );
}

