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

        {/* Limit price + spot */}
        <div className="bg-[#010C1B] border border-white/10 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-[#C5C1B9]">
              Limit price
            </span>
            <span className="text-[10px] text-[#C5C1B9]">
              {spotPrice && amountIn && parseFloat(amountIn) > 0
                ? `Spot: 1 ${tokenIn.symbol} ≈ ${(parseFloat(spotPrice) / parseFloat(amountIn)).toFixed(6)} ${tokenOut.symbol}`
                : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
              className="flex-1 bg-transparent text-white text-lg font-black focus:outline-none"
            />
            <span className="text-[11px] text-[#C5C1B9]">
              {tokenOut.symbol} per 1 {tokenIn.symbol}
            </span>
          </div>
          {spotPrice && amountIn && parseFloat(amountIn) > 0 && (
            <button
              type="button"
              onClick={() =>
                setLimitPrice(
                  (parseFloat(spotPrice) / parseFloat(amountIn)).toFixed(
                    Math.min(tokenOut.decimals, 8),
                  ),
                )
              }
              className="text-[9px] text-[#32FF8B] uppercase tracking-widest font-bold cursor-pointer hover:underline"
            >
              Use spot
            </button>
          )}
        </div>

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
