// Thin wrappers around FlowLimitOrderExecutor + helpers for event tracking.

import {
  decodeEventLog,
  parseAbiItem,
  type Address,
  type Log,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import {
  FLOW_LIMIT_ORDER_EXECUTOR_ABI,
  getContracts,
} from "@/lib/contracts";

export type OnchainOrderStatus = 0 | 1 | 2 | 3; // OPEN | FILLED | CANCELLED | EXPIRED (best-effort)

export interface OnchainLimitOrder {
  id: bigint;
  creator: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  executionFee: bigint;
  expiry: bigint;
  status: OnchainOrderStatus;
  routerId: bigint;
  feePoolV3: number;
  recipient: Address;
  placedAt: bigint;
}

export function executorAddress(isMainnet: boolean): Address | null {
  const raw = getContracts(isMainnet).flowLimitOrderExecutor;
  if (!raw) return null;
  return raw.toLowerCase() as Address;
}

export async function fetchActiveOrders(
  publicClient: PublicClient,
  isMainnet: boolean,
  user: Address,
): Promise<OnchainLimitOrder[]> {
  const addr = executorAddress(isMainnet);
  if (!addr) return [];
  const ids = (await publicClient.readContract({
    address: addr,
    abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
    functionName: "getActiveUserOrders",
    args: [user],
  })) as readonly bigint[];
  if (ids.length === 0) return [];
  const orders = await Promise.all(
    ids.map((id) =>
      publicClient.readContract({
        address: addr,
        abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
        functionName: "getOrder",
        args: [id],
      }) as Promise<OnchainLimitOrder>,
    ),
  );
  return orders;
}

export async function fetchOrder(
  publicClient: PublicClient,
  isMainnet: boolean,
  id: bigint,
): Promise<OnchainLimitOrder | null> {
  const addr = executorAddress(isMainnet);
  if (!addr) return null;
  try {
    return (await publicClient.readContract({
      address: addr,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      functionName: "getOrder",
      args: [id],
    })) as OnchainLimitOrder;
  } catch {
    return null;
  }
}

/**
 * Extract the definitive orderId from a placeOrder transaction receipt by
 * decoding the OrderPlaced event.
 */
export function decodePlacedOrderId(
  receipt: TransactionReceipt,
  executor: Address,
): bigint | null {
  const evt = parseAbiItem(
    "event OrderPlaced(uint256 indexed orderId, address indexed creator, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 executionFee, uint256 expiry, uint256 routerId, address recipient, uint256 placementFee)",
  );
  for (const log of receipt.logs) {
    if ((log.address as string).toLowerCase() !== executor.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: [evt], data: log.data, topics: log.topics });
      if (decoded.eventName === "OrderPlaced") {
        return (decoded.args as { orderId: bigint }).orderId;
      }
    } catch {
      /* not our event */
    }
  }
  return null;
}

/**
 * Subscribe to a user's OrderPlaced / OrderCancelled / OrderFilled events.
 * Returns an unsubscribe function.
 */
export function watchUserOrderEvents(
  publicClient: PublicClient,
  isMainnet: boolean,
  user: Address,
  handlers: {
    onPlaced?: (orderId: bigint, log: Log) => void;
    onFilled?: (orderId: bigint, amountOut: bigint, log: Log) => void;
    onCancelled?: (orderId: bigint, log: Log) => void;
  },
): () => void {
  const addr = executorAddress(isMainnet);
  if (!addr) return () => {};

  const unsubs: Array<() => void> = [];

  unsubs.push(
    publicClient.watchContractEvent({
      address: addr,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      eventName: "OrderPlaced",
      args: { creator: user },
      onLogs: (logs) => {
        for (const l of logs) {
          const args = (l as unknown as { args: { orderId: bigint } }).args;
          handlers.onPlaced?.(args.orderId, l);
        }
      },
    }),
  );

  // OrderFilled has no creator index — fan-out and filter by tracked ids in the UI.
  unsubs.push(
    publicClient.watchContractEvent({
      address: addr,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      eventName: "OrderFilled",
      onLogs: (logs) => {
        for (const l of logs) {
          const args = (l as unknown as { args: { orderId: bigint; amountOut: bigint } }).args;
          handlers.onFilled?.(args.orderId, args.amountOut, l);
        }
      },
    }),
  );

  unsubs.push(
    publicClient.watchContractEvent({
      address: addr,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      eventName: "OrderCancelled",
      args: { creator: user },
      onLogs: (logs) => {
        for (const l of logs) {
          const args = (l as unknown as { args: { orderId: bigint } }).args;
          handlers.onCancelled?.(args.orderId, l);
        }
      },
    }),
  );

  return () => unsubs.forEach((u) => u());
}
