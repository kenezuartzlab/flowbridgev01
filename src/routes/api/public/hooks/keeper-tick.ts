// Keeper endpoint: scans open limit orders on FlowLimitOrderExecutor v3
// and executes any that are fillable at current on-chain price.
// Called by pg_cron every minute. Public route, but effectively idempotent:
// - Contract enforces status/expiry/minAmountOut on-chain.
// - We only *simulate* first and skip on revert, so calls are cheap.
//
// Env:
//   KEEPER_PRIVATE_KEY  hex private key (0x-prefixed) with BOT for gas.

import { createFileRoute } from "@tanstack/react-router";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  FLOW_LIMIT_ORDER_EXECUTOR_ABI,
  MAINNET_CONTRACTS,
} from "@/lib/contracts";

const RPC_URL = "https://rpc.botchain.ai";
const CHAIN_ID = 5150;

const chain = {
  id: CHAIN_ID,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

interface Attempt {
  orderId: string;
  action: "skip" | "simulated-revert" | "executed" | "error";
  reason?: string;
  txHash?: string;
}

async function runKeeper() {
  const executor = MAINNET_CONTRACTS.flowLimitOrderExecutor as Address;
  if (!executor) return { ok: false, error: "executor address not set" };

  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) return { ok: false, error: "KEEPER_PRIVATE_KEY not configured" };

  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`,
  );
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(RPC_URL),
  });

  const paused = (await publicClient.readContract({
    address: executor,
    abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
    functionName: "paused",
  })) as boolean;
  if (paused) return { ok: true, paused: true, attempts: [] as Attempt[] };

  const nextId = (await publicClient.readContract({
    address: executor,
    abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
    functionName: "nextOrderId",
  })) as bigint;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const attempts: Attempt[] = [];

  // Order IDs start at 1. Scan every id and skip non-open ones.
  // (Small volume expected; we can add a cursor once counts grow.)
  for (let i = 1n; i < nextId; i++) {
    try {
      const order = (await publicClient.readContract({
        address: executor,
        abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
        functionName: "getOrder",
        args: [i],
      })) as {
        id: bigint;
        creator: Address;
        tokenIn: Address;
        tokenOut: Address;
        amountIn: bigint;
        minAmountOut: bigint;
        executionFee: bigint;
        expiry: bigint;
        status: number;
        routerId: bigint;
        feePoolV3: number;
        recipient: Address;
        placedAt: bigint;
      };

      if (order.status !== 0) continue; // 0 = OPEN
      if (order.expiry !== 0n && order.expiry < now) continue;

      // Build v2Path: for V2 routers use [tokenIn, tokenOut]; for V3 the
      // contract ignores v2Path but requires the arg. Passing the pair is
      // safe in both branches.
      const v2Path: Address[] = [order.tokenIn, order.tokenOut];

      // Simulate first — reverts if amountOut < minAmountOut (limit not met).
      try {
        await publicClient.simulateContract({
          address: executor,
          abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
          functionName: "executeOrder",
          args: [order.id, v2Path],
          account,
        });
      } catch (simErr) {
        const msg = (simErr as Error).message ?? "";
        attempts.push({
          orderId: order.id.toString(),
          action: "simulated-revert",
          reason: msg.slice(0, 160),
        });
        continue;
      }

      const hash = await walletClient.writeContract({
        address: executor,
        abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
        functionName: "executeOrder",
        args: [order.id, v2Path],
      });
      attempts.push({
        orderId: order.id.toString(),
        action: "executed",
        txHash: hash,
      });
    } catch (err) {
      attempts.push({
        orderId: i.toString(),
        action: "error",
        reason: ((err as Error).message ?? "").slice(0, 160),
      });
    }
  }

  return {
    ok: true,
    keeper: account.address,
    scanned: (nextId - 1n).toString(),
    attempts,
  };
}

export const Route = createFileRoute("/api/public/hooks/keeper-tick")({
  server: {
    handlers: {
      GET: async () => {
        const result = await runKeeper();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async () => {
        const result = await runKeeper();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
