// Central translator: any thrown value → short, non-technical, actionable message.
// Never surface raw viem/wagmi/RPC strings to the user.

export interface FriendlyErrorContext {
  /** Native gas token symbol on the source chain, e.g. "BOT", "BNB", "ETH". */
  gasSymbol?: string;
  /** Verb for context: "swap", "bridge", "approve", "sign", "transaction". */
  action?: string;
}

function extractRaw(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (typeof e !== "object") return String(e);
  const anyErr = e as any;
  try {
    const parts = [
      anyErr.shortMessage,
      anyErr.details,
      anyErr.reason,
      anyErr?.cause?.shortMessage,
      anyErr?.cause?.reason,
      anyErr?.cause?.message,
      anyErr?.data?.message,
      anyErr.message,
    ].filter((x) => typeof x === "string");
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

export function toFriendlyError(e: unknown, ctx: FriendlyErrorContext = {}): string {
  const gas = ctx.gasSymbol || "BOT";
  const action = ctx.action || "transaction";
  const raw = extractRaw(e);
  const s = String(raw);

  // Safari/viem quirk: `err.walk((e) => 'data' in e)` throws when e isn't an object.
  if (!s || /is not an Object|['"`]data['"`]\s*in\s*e|Cannot use 'in' operator|undefined is not an object/i.test(s)) {
    return `Your wallet couldn't complete the ${action}. Refresh and try again — if it keeps failing, add a little ${gas} for gas.`;
  }

  // User rejections
  if (/user rejected|user denied|rejected the request|request rejected|action_rejected|cancelled by user|user cancel/i.test(s)) {
    return `You cancelled the ${action} in your wallet. You can try again anytime.`;
  }

  // Pending request in wallet
  if (/already pending|request already pending|already processing/i.test(s)) {
    return "Your wallet already has a pending request. Open the wallet, approve or reject it, then try again.";
  }

  // Gas / insufficient native
  if (/insufficient funds|gas required exceeds|exceeds the balance|intrinsic gas|out of gas|gas limit|given 0/i.test(s)) {
    return `Not enough ${gas} to pay network gas fees. Top up a small amount of ${gas} in your wallet and try again.`;
  }

  // Slippage / price moved
  if (/INSUFFICIENT_OUTPUT_AMOUNT|Too little received|slippage|price impact|excessive slippage/i.test(s)) {
    return "The price moved before your transaction was confirmed. Refresh the quote (or raise slippage slightly) and try again.";
  }

  // Expired deadline
  if (/EXPIRED|deadline|timeout|timed out/i.test(s)) {
    return `The ${action} took too long to confirm and expired. Please try again.`;
  }

  // Transfer failed / allowance
  if (/TRANSFER_FROM_FAILED|TRANSFER_FAILED|allowance|ERC20: transfer amount exceeds/i.test(s)) {
    return "The token transfer didn't go through. Check your balance and re-approve the token, then try again.";
  }

  // Nonce / replacement
  if (/nonce|replacement transaction underpriced|already known/i.test(s)) {
    return "A previous transaction is still pending in your wallet. Wait for it to confirm (or speed it up), then try again.";
  }

  // Network / RPC
  if (/network|fetch failed|failed to fetch|ECONNREFUSED|ETIMEDOUT|timeout|rate limit|429|503|502|network request/i.test(s)) {
    return "Network hiccup while reaching the blockchain. Check your connection and try again in a moment.";
  }

  // Chain mismatch
  if (/chain mismatch|wrong network|unsupported chain|chain not configured/i.test(s)) {
    return "Your wallet is on the wrong network. Switch back to the correct chain and try again.";
  }

  // Contract revert (generic)
  if (/execution reverted|reverted|revert exception/i.test(s)) {
    return `The ${action} was rejected on-chain. This usually means the amount or route changed — refresh the quote and try again.`;
  }

  // Watch-only / signer missing
  if (/no signer|read-only|watch[- ]only|missing account|method not supported/i.test(s)) {
    return "This wallet can't sign transactions here. Reconnect a signing wallet (not watch-only) and try again.";
  }

  // Fallback: trimmed, capped, no error prefix
  const clean = s.replace(/^Error:\s*/i, "").split("\n")[0].slice(0, 160);
  return clean || `The ${action} didn't go through. Please try again.`;
}

// ── Low-gas detection ────────────────────────────────────────────────────────

/** Minimum native gas (in ether units) we want a user to hold before signing. */
export const LOW_GAS_MIN_ETHER: Record<string, number> = {
  BOT: 0.0015,
  BNB: 0.0008,
  ETH: 0.0008,
  TRX: 15,
};

export function isNativeGasLow(balanceRaw: bigint | undefined, decimals: number, symbol: string): boolean {
  if (balanceRaw == null) return false;
  const min = LOW_GAS_MIN_ETHER[symbol.toUpperCase()] ?? 0.001;
  const asNum = Number(balanceRaw) / Math.pow(10, decimals);
  return asNum < min;
}

export function lowGasMessage(symbol: string): string {
  const min = LOW_GAS_MIN_ETHER[symbol.toUpperCase()] ?? 0.001;
  return `Low ${symbol.toUpperCase()} for gas — you have less than ${min} ${symbol.toUpperCase()}. Add a small amount to cover network fees before your next transaction.`;
}
