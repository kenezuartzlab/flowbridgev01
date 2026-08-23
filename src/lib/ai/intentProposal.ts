/**
 * V15.2 — deterministic proposal extraction.
 *
 * Turns a user sentence into a CANDIDATE ActionIntent shape. Nothing here is
 * authoritative: token addresses and decimals come from the canonical registry
 * (never from the model or the sentence), and the proposal must still pass
 * structural validation, the policy engine and simulation server-side.
 */
import {
  BOT_TESTNET_CHAIN_ID,
  contractsForChain,
  type ActionIntentType,
} from "./actionIntent";

export interface IntentProposal {
  type: ActionIntentType;
  chainId: number;
  parameters: Record<string, unknown>;
  /** Symbols/values recognised, for the review card's provenance line. */
  recognized: readonly string[];
}

const SYMBOLS: Record<string, { key: "usdtBot" | "caToken" | "wbot"; decimals: number }> = {
  USDT: { key: "usdtBot", decimals: 6 },
  CA: { key: "caToken", decimals: 18 },
  WBOT: { key: "wbot", decimals: 18 },
  BOT: { key: "wbot", decimals: 18 },
};

const AMOUNT_RE = /(\d+(?:\.\d{1,18})?)/;

function tokenOf(symbol: string, chainId: number) {
  const entry = SYMBOLS[symbol.toUpperCase()];
  if (!entry) return null;
  const c = contractsForChain(chainId);
  return { address: c[entry.key].toLowerCase(), decimals: entry.decimals, symbol: symbol.toUpperCase() };
}

/**
 * Extracts at most one proposal. Returns null whenever the sentence is not
 * specific enough — an ambiguous request never becomes a plan.
 */
export function proposeIntent(input: {
  question: string;
  wallet: string | null;
  chainId?: number;
  organizationId?: string | null;
  claimableFlow?: number | null;
}): IntentProposal | null {
  const chainId = input.chainId ?? BOT_TESTNET_CHAIN_ID;
  const q = input.question.toLowerCase();
  const wallet = input.wallet;

  // STAKE
  if (/\bstake\b/.test(q) && !/unstake/.test(q)) {
    const m = q.match(new RegExp(`${AMOUNT_RE.source}\\s*flow`)) ?? q.match(AMOUNT_RE);
    if (!m || !wallet) return null;
    return {
      type: "STAKE_FLOW",
      chainId,
      parameters: { amountFlow: m[1], recipient: wallet },
      recognized: [`${m[1]} FLOW`, "FlowStakingVault"],
    };
  }

  if (/\b(unstake|withdraw)\b/.test(q) && wallet) {
    return { type: "UNSTAKE_FLOW", chainId, parameters: { recipient: wallet }, recognized: ["staked principal"] };
  }

  if (/\bclaim\b/.test(q) && /(staking|reward rate|vault)/.test(q) && wallet) {
    return { type: "CLAIM_STAKING", chainId, parameters: { recipient: wallet }, recognized: ["earned staking rewards"] };
  }

  if (/\bclaim\b/.test(q) && wallet) {
    // V16.1 — an unknown claimable balance is not zero: no plan is proposed.
    if (input.claimableFlow == null || !Number.isFinite(input.claimableFlow)) return null;
    return {
      type: "CLAIM_FLOW",
      chainId,
      parameters: {
        claimableFlow: String(input.claimableFlow),
        recipient: wallet,
      },
      recognized: ["claimable FLOW", "FlowRewardsDistributor"],
    };
  }


  // BRIDGE — "bridge 5 usdt to bnb"
  if (/\bbridge\b/.test(q) && wallet) {
    const m = q.match(new RegExp(`${AMOUNT_RE.source}\\s*(usdt)`));
    if (!m) return null;
    const token = tokenOf("USDT", chainId)!;
    const destination = /\bbnb|bsc\b/.test(q) ? (chainId === BOT_TESTNET_CHAIN_ID ? 97 : 56) : null;
    if (!destination) return null;
    return {
      type: "BRIDGE",
      chainId,
      parameters: {
        token: token.address,
        amountIn: m[1],
        decimals: token.decimals,
        destinationChainId: destination,
        recipient: wallet,
      },
      recognized: [`${m[1]} USDT`, `destination chain ${destination}`],
    };
  }

  // SWAP — "swap 10 usdt for ca" / "swap 10 usdt to ca"
  if (/\b(swap|trade|exchange)\b/.test(q) && wallet) {
    const m = q.match(
      new RegExp(`${AMOUNT_RE.source}\\s*([a-z]{2,6})\\s*(?:for|to|into|->|→)\\s*([a-z]{2,6})`),
    );
    if (!m) return null;
    const tokenIn = tokenOf(m[2], chainId);
    const tokenOut = tokenOf(m[3], chainId);
    if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return null;
    return {
      type: "SWAP",
      chainId,
      parameters: {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        decimalsIn: tokenIn.decimals,
        decimalsOut: tokenOut.decimals,
        amountIn: m[1],
        slippageBps: 50,
        recipient: wallet,
      },
      recognized: [`${m[1]} ${tokenIn.symbol}`, `→ ${tokenOut.symbol}`, "slippage 0.5%"],
    };
  }

  // PARTNER CAMPAIGN DRAFT
  if (/\bcampaign\b/.test(q) && /\b(draft|create|new)\b/.test(q) && input.organizationId) {
    const pts = q.match(/(\d{1,6})\s*(?:pts|points)/);
    const tasks = q.match(/(\d{1,2})\s*task/);
    if (!pts) return null;
    return {
      type: "PARTNER_CAMPAIGN_DRAFT",
      chainId,
      parameters: {
        title: "Flow AI prepared campaign draft",
        slug: `flow-ai-draft-${Date.now().toString(36)}`,
        rewardType: "CAMPAIGN_PTS",
        rewardAmount: Number(pts[1]),
        taskCount: tasks ? Number(tasks[1]) : 1,
      },
      recognized: [`${pts[1]} Campaign PTS`, `${tasks?.[1] ?? 1} task(s)`],
    };
  }

  return null;
}
