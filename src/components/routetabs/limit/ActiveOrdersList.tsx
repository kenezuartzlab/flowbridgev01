import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { toast } from "sonner";
import { Loader2, XCircle, CheckCircle2, Clock } from "lucide-react";
import { toFriendlyError } from "@/lib/friendlyError";
import { FLOW_LIMIT_ORDER_EXECUTOR_ABI, getContracts } from "@/lib/contracts";
import {
  executorAddress,
  fetchActiveOrders,
  fetchOrder,
  watchUserOrderEvents,
  type OnchainLimitOrder,
} from "@/lib/limitOrders/executor";
import { cn } from "@/lib/utils";

interface Props {
  isMainnet: boolean;
  txUrlPrefix: string;
  refreshTick: number;
}

type UiOrder = OnchainLimitOrder & { uiStatus: "open" | "filled" | "cancelled" | "expired" };

const STATUS_LABELS: Record<number, string> = {
  0: "OPEN",
  1: "FILLED",
  2: "CANCELLED",
  3: "EXPIRED",
};

export function ActiveOrdersList({ isMainnet, txUrlPrefix, refreshTick }: Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const contracts = useMemo(() => getContracts(isMainnet), [isMainnet]);
  const executor = useMemo(() => executorAddress(isMainnet), [isMainnet]);

  const [orders, setOrders] = useState<Map<string, UiOrder>>(new Map());
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Initial load + refresh
  useEffect(() => {
    let cancelled = false;
    if (!address || !publicClient || !executor) {
      setOrders(new Map());
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const list = await fetchActiveOrders(publicClient, isMainnet, address as Address);
        if (cancelled) return;
        const map = new Map<string, UiOrder>();
        const now = BigInt(Math.floor(Date.now() / 1000));
        for (const o of list) {
          map.set(o.id.toString(), {
            ...o,
            uiStatus:
              o.status === 1
                ? "filled"
                : o.status === 2
                  ? "cancelled"
                  : o.expiry !== 0n && o.expiry < now
                    ? "expired"
                    : "open",
          });
        }
        setOrders(map);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, isMainnet, executor, refreshTick]);

  // Live event subscription
  useEffect(() => {
    if (!address || !publicClient || !executor) return;
    const reconcile = async (id: bigint) => {
      const o = await fetchOrder(publicClient, isMainnet, id);
      if (!o) return;
      // Only track orders created by us
      if (o.creator.toLowerCase() !== (address as string).toLowerCase()) return;
      setOrders((prev) => {
        const next = new Map(prev);
        const now = BigInt(Math.floor(Date.now() / 1000));
        next.set(o.id.toString(), {
          ...o,
          uiStatus:
            o.status === 1
              ? "filled"
              : o.status === 2
                ? "cancelled"
                : o.expiry !== 0n && o.expiry < now
                  ? "expired"
                  : "open",
        });
        return next;
      });
    };
    const unsub = watchUserOrderEvents(publicClient, isMainnet, address as Address, {
      onPlaced: (id) => void reconcile(id),
      onFilled: (id, amountOut) => {
        void reconcile(id);
        toast.success(`Order #${id} filled (${formatUnits(amountOut, 0)} out units)`);
      },
      onCancelled: (id) => {
        void reconcile(id);
      },
    });
    return unsub;
  }, [address, publicClient, isMainnet, executor]);

  const handleCancel = async (id: bigint) => {
    if (!executor || !publicClient) return;
    setCancelling(id.toString());
    const toastId = toast.loading(`Cancelling order #${id}…`);
    try {
      const tx = await writeContractAsync({
        address: executor,
        abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
        functionName: "cancelOrder",
        args: [id],
      });
      const rcpt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (rcpt.status !== "success") {
        toast.error("Cancel reverted", { id: toastId });
      } else {
        toast.success(`Order #${id} cancelled`, {
          id: toastId,
          action: { label: "View", onClick: () => window.open(`${txUrlPrefix}${tx}`, "_blank") },
        });
      }
    } catch (e: any) {
      toast.error(toFriendlyError(e, { action: "cancel order" }), { id: toastId });
    } finally {
      setCancelling(null);
    }
  };

  const list = useMemo(() => Array.from(orders.values()).sort((a, b) => Number(b.id - a.id)), [orders]);

  if (!address) return null;

  return (
    <div className="bg-[#0D1C2A] border border-white/10 rounded-[24px] p-4 space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-black uppercase tracking-widest text-[13px]">
          Your limit orders
        </h3>
        {loading && <Loader2 className="w-3.5 h-3.5 text-[#C5C1B9] animate-spin" />}
      </div>
      {list.length === 0 ? (
        <p className="text-[11px] text-[#C5C1B9] py-2">No active orders.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((o) => {
            const inSym = symbolFor(o.tokenIn, contracts);
            const outSym = symbolFor(o.tokenOut, contracts);
            const inDec = decimalsFor(o.tokenIn, contracts);
            const outDec = decimalsFor(o.tokenOut, contracts);
            return (
              <li
                key={o.id.toString()}
                className="bg-[#010C1B] border border-white/10 rounded-2xl px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={o.uiStatus} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                      #{o.id.toString()} · {inSym} → {outSym}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[9px] font-black uppercase tracking-widest",
                      o.uiStatus === "open" && "text-[#32FF8B]",
                      o.uiStatus === "filled" && "text-blue-400",
                      o.uiStatus === "cancelled" && "text-[#C5C1B9]",
                      o.uiStatus === "expired" && "text-amber-400",
                    )}
                  >
                    {o.uiStatus === "expired" ? "EXPIRED" : STATUS_LABELS[o.status] ?? "?"}
                  </span>
                </div>
                <div className="text-[10px] text-[#C5C1B9] leading-snug">
                  Sell {formatUnits(o.amountIn, inDec)} {inSym} · min out{" "}
                  {formatUnits(o.minAmountOut, outDec)} {outSym}
                  {o.expiry !== 0n && (
                    <>
                      {" · expires "}
                      {new Date(Number(o.expiry) * 1000).toLocaleString()}
                    </>
                  )}
                </div>
                <div className="text-[9px] text-[#C5C1B9]">
                  routerId {o.routerId.toString()} · keeper tip {formatUnits(o.executionFee, 18)} BOT
                </div>
                {o.uiStatus === "open" && (
                  <button
                    type="button"
                    disabled={cancelling === o.id.toString()}
                    onClick={() => handleCancel(o.id)}
                    className="text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-red-200 cursor-pointer disabled:opacity-50"
                  >
                    {cancelling === o.id.toString() ? "Cancelling…" : "Cancel order"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: UiOrder["uiStatus"] }) {
  if (status === "filled") return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "cancelled") return <XCircle className="w-3.5 h-3.5 text-[#C5C1B9]" />;
  if (status === "expired") return <Clock className="w-3.5 h-3.5 text-amber-400" />;
  return <Clock className="w-3.5 h-3.5 text-[#32FF8B]" />;
}

function symbolFor(addr: Address, c: ReturnType<typeof getContracts>): string {
  const a = addr.toLowerCase();
  if (a === c.wbot.toLowerCase()) return "WBOT";
  if (a === c.caWbot.toLowerCase()) return "caWBOT";
  if (a === c.usdtBot.toLowerCase()) return "USDT";
  if (a === c.caToken.toLowerCase()) return "CA";
  return `${addr.slice(0, 6)}…`;
}

function decimalsFor(addr: Address, c: ReturnType<typeof getContracts>): number {
  const a = addr.toLowerCase();
  if (a === c.usdtBot.toLowerCase()) return 6;
  return 18;
}
