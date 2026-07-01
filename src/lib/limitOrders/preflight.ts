// Pre-flight validation for FlowLimitOrderExecutor.placeOrder.
// Runs entirely against on-chain state: paused, per-user open order cap,
// balance / allowance, expiry sanity, minAmountOut vs live spot.

import { formatUnits, type Address, type PublicClient } from "viem";
import {
  ERC20_ABI,
  FLOW_LIMIT_ORDER_EXECUTOR_ABI,
  getContracts,
} from "@/lib/contracts";
import { getBestRoute } from "@/lib/swap/quoter";
import type { Token } from "@/lib/swap/tokenRegistry";
import type { LimitRoute } from "./routing";

export type PreflightIssue = {
  code:
    | "no-executor"
    | "paused"
    | "amount-zero"
    | "min-out-zero"
    | "expiry-past"
    | "expiry-too-soon"
    | "wrap-needed"
    | "insufficient-balance"
    | "insufficient-allowance"
    | "insufficient-bounty-native"
    | "max-orders-reached"
    | "price-too-far";
  severity: "error" | "warning";
  message: string;
};

export interface PreflightInput {
  publicClient: PublicClient;
  isMainnet: boolean;
  user: Address;
  route: LimitRoute;
  tokenIn: Token;                // UI-selected input token (may be native)
  tokenOut: Token;
  amountInRaw: bigint;           // in tokenIn units (native or ERC20)
  minAmountOutRaw: bigint;
  expiryUnix: bigint;            // 0 = no expiry
  keeperBountyWei: bigint;       // msg.value
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  // Computed sanity values for the UI
  placementFee: bigint;
  effectiveBps: bigint;
  needsApprove: boolean;
  wrapAmount: bigint;            // >0 if user must wrap native BOT into route.needsWrap.wbot
  spotOut: bigint | null;        // best-effort spot quote for the same amountIn
  priceDeviationBps: number | null;
}

const MIN_EXPIRY_LEEWAY = 60n; // seconds

export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const {
    publicClient,
    isMainnet,
    user,
    route,
    tokenIn,
    tokenOut,
    amountInRaw,
    minAmountOutRaw,
    expiryUnix,
    keeperBountyWei,
  } = input;

  const c = getContracts(isMainnet);
  const executor = (c.flowLimitOrderExecutor || "").toLowerCase() as Address;
  const issues: PreflightIssue[] = [];

  if (!executor) {
    issues.push({
      code: "no-executor",
      severity: "error",
      message: "Limit orders are not deployed on this network yet.",
    });
    return blank(issues);
  }

  if (amountInRaw <= 0n) {
    issues.push({ code: "amount-zero", severity: "error", message: "Enter an amount to sell." });
  }
  if (minAmountOutRaw <= 0n) {
    issues.push({ code: "min-out-zero", severity: "error", message: "Set a limit price greater than zero." });
  }

  // Expiry sanity
  if (expiryUnix !== 0n) {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (expiryUnix <= nowSec) {
      issues.push({ code: "expiry-past", severity: "error", message: "Expiry is in the past." });
    } else if (expiryUnix - nowSec < MIN_EXPIRY_LEEWAY) {
      issues.push({
        code: "expiry-too-soon",
        severity: "error",
        message: "Expiry must be at least 60 seconds in the future.",
      });
    }
  }

  // ── On-chain reads ─────────────────────────────────────────────────────
  const [paused, maxOrders, openCount, placement, nativeBal] = await Promise.all([
    publicClient.readContract({
      address: executor,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      functionName: "paused",
    }) as Promise<boolean>,
    publicClient.readContract({
      address: executor,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      functionName: "maxOrdersPerUser",
    }) as Promise<bigint>,
    publicClient.readContract({
      address: executor,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      functionName: "openOrderCount",
      args: [user],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: executor,
      abi: FLOW_LIMIT_ORDER_EXECUTOR_ABI,
      functionName: "computePlacementFee",
      args: [user, amountInRaw > 0n ? amountInRaw : 1n],
    }) as Promise<readonly [bigint, bigint]>,
    publicClient.getBalance({ address: user }),
  ]);

  if (paused) {
    issues.push({ code: "paused", severity: "error", message: "Executor is paused." });
  }
  if (openCount >= maxOrders) {
    issues.push({
      code: "max-orders-reached",
      severity: "error",
      message: `You have ${openCount}/${maxOrders} open orders. Cancel one to place another.`,
    });
  }

  // Balance + allowance for the on-chain tokenIn (the ERC20 the executor pulls).
  // If the UI tokenIn is native BOT, the user must first wrap into route.needsWrap.wbot.
  const wrapAmount = tokenIn.isNative && route.needsWrap ? amountInRaw : 0n;

  const [erc20Balance, allowance] = await Promise.all([
    publicClient.readContract({
      address: route.onchainTokenIn,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [user],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: route.onchainTokenIn,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [user, executor],
    }) as Promise<bigint>,
  ]);

  // For native-in: available = wbot balance + native (after wrap). Must cover amountInRaw.
  if (tokenIn.isNative) {
    const combined = erc20Balance + nativeBal;
    if (combined < amountInRaw + keeperBountyWei) {
      issues.push({
        code: "insufficient-balance",
        severity: "error",
        message: `Not enough BOT (need ${formatUnits(amountInRaw + keeperBountyWei, 18)} incl. keeper tip).`,
      });
    }
    if (erc20Balance < amountInRaw) {
      issues.push({
        code: "wrap-needed",
        severity: "warning",
        message: `Wrap ${formatUnits(amountInRaw - erc20Balance, 18)} BOT → ${route.needsWrap?.label ?? "WBOT"} before placing.`,
      });
    }
  } else {
    if (erc20Balance < amountInRaw) {
      issues.push({
        code: "insufficient-balance",
        severity: "error",
        message: `Insufficient ${tokenIn.symbol} balance.`,
      });
    }
    if (nativeBal < keeperBountyWei) {
      issues.push({
        code: "insufficient-bounty-native",
        severity: "error",
        message: `Not enough native BOT to fund the keeper tip.`,
      });
    }
  }

  const needsApprove = allowance < amountInRaw;

  // ── Live spot quote for deviation warning ─────────────────────────────
  let spotOut: bigint | null = null;
  let priceDeviationBps: number | null = null;
  try {
    if (amountInRaw > 0n) {
      const q = await getBestRoute(tokenIn, tokenOut, amountInRaw, isMainnet);
      if (q && q.amountOut > 0n) {
        spotOut = q.amountOut;
        if (minAmountOutRaw > 0n) {
          const diff =
            minAmountOutRaw > spotOut
              ? Number(((minAmountOutRaw - spotOut) * 10000n) / spotOut)
              : -Number(((spotOut - minAmountOutRaw) * 10000n) / spotOut);
          priceDeviationBps = diff;
          if (diff > 5000) {
            issues.push({
              code: "price-too-far",
              severity: "warning",
              message: "Limit price is more than 50% above current spot — order may never fill.",
            });
          }
        }
      }
    }
  } catch {
    /* spot lookup best-effort */
  }

  const [placementFee, effectiveBps] = placement;

  const hasError = issues.some((i) => i.severity === "error");
  return {
    ok: !hasError,
    issues,
    placementFee,
    effectiveBps,
    needsApprove,
    wrapAmount,
    spotOut,
    priceDeviationBps,
  };
}

function blank(issues: PreflightIssue[]): PreflightResult {
  return {
    ok: false,
    issues,
    placementFee: 0n,
    effectiveBps: 0n,
    needsApprove: false,
    wrapAmount: 0n,
    spotOut: null,
    priceDeviationBps: null,
  };
}
