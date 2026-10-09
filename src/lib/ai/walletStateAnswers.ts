/**
 * V34.2A — deterministic Flow AI wallet-state answers (pure).
 *
 * Bound wallet + account verification come from the server; connected address,
 * chain and wallet family are untrusted browser hints used only to explain.
 * Never guesses a wallet brand, never switches chains, never signs.
 */
import type { RewardProgression } from "@/lib/rewards/rewardProgression";

export type WalletQuestion =
  | "CONNECTED"
  | "WHICH_WALLET"
  | "BOUND"
  | "WHY_BIND"
  | "BIND_GAS"
  | "CANT_TRADE"
  | "NETWORK"
  | "CAN_CLAIM";

const RULES: [WalletQuestion, RegExp][] = [
  ["BIND_GAS", /\b(bind|binding|verify|verification)\b.*\b(gas|fee|cost|free)\b|\b(gas|cost)\b.*\bbind/i],
  ["WHY_BIND", /why (do|should|must) i (need to )?(bind|verify)( my)? wallet|what (does|is) (wallet )?binding|how (do|can|to) i (bind|link|verify)( my)? wallet|wallet bind(ing)?( feature)?|bind(ing)? (my )?wallet|link(ing)? (my )?wallet/i],
  ["BOUND", /is my wallet (bound|verified|linked)|(have i|did i) (bind|bound|link|verif)|wallet (bound|linked)\?/i],
  ["WHICH_WALLET", /which wallet (am i|is) (using|connected)|what wallet am i using/i],
  ["CONNECTED", /am i connected|is my wallet connected|wallet connected\?/i],
  ["CANT_TRADE", /why can'?t i (trade|swap)|why (is|does) (trading|swap) (not work|disabled|fail)/i],
  ["NETWORK", /am i on the (right|correct|wrong) (network|chain)|which (network|chain) (am i|should i)/i],
  ["CAN_CLAIM", /can i claim( my)?( flow)?\b|am i able to claim/i],
];

export function matchWalletQuestion(q: string): WalletQuestion | null {
  for (const [k, re] of RULES) if (re.test(q)) return k;
  return null;
}

/** Reliable EIP-6963 rdns → display name. Anything else stays generic. */
const KNOWN_RDNS: Record<string, string> = {
  "io.metamask": "MetaMask",
  "io.rabby": "Rabby",
  "com.okex.wallet": "OKX Wallet",
  "pro.tokenpocket": "TokenPocket",
  "com.coinbase.wallet": "Coinbase Wallet",
  "com.trustwallet.app": "Trust Wallet",
  "app.safepal": "SafePal",
  "com.bitget.web3": "Bitget Wallet",
};
export const GENERIC_WALLET = "Connected EVM wallet";

export function walletFamilyLabel(rdns: unknown): string {
  return typeof rdns === "string" && KNOWN_RDNS[rdns] ? KNOWN_RDNS[rdns] : GENERIC_WALLET;
}

export type ChainSupport = "BOT_MAINNET" | "BOT_TESTNET" | "BNB_MAINNET" | "BNB_TESTNET" | "LEGACY_UNSUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
export function chainSupport(chainId: number | null): ChainSupport {
  if (chainId == null) return "UNKNOWN";
  if (chainId === 677) return "BOT_MAINNET";
  if (chainId === 968) return "BOT_TESTNET";
  if (chainId === 56) return "BNB_MAINNET";
  if (chainId === 97) return "BNB_TESTNET";
  if (chainId === 1024) return "LEGACY_UNSUPPORTED";
  return "UNSUPPORTED";
}
const CHAIN_NAME: Record<ChainSupport, string> = {
  BOT_MAINNET: "BOT Mainnet (677)", BOT_TESTNET: "BOT Testnet (968)", BNB_MAINNET: "BNB Mainnet (56)",
  BNB_TESTNET: "BNB Testnet (97)", LEGACY_UNSUPPORTED: "legacy chain 1024 (unsupported)", UNSUPPORTED: "an unsupported network", UNKNOWN: "an unknown network",
};

export interface WalletAnswerContext {
  signedIn: boolean;
  emailVerified: boolean;
  boundWallet: string | null;
  connectedWallet: string | null;
  chainId: number | null;
  walletRdns?: string | null;
  progression?: RewardProgression | null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const norm = (a: string | null) => (a && /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : null);
const NETWORK_HELP = "FlowBridge supports BOT Mainnet (677), BOT Testnet (968), BNB Mainnet (56) and BNB Testnet (97). Switch network in your wallet yourself — I never switch it for you.";
const BIND_WHY = "Binding proves you own the wallet by signing a free message. It costs no gas, does not move funds and does not approve any token. It links your rewards to your account. It is not identity or KYC verification, and it is separate from verifying your email.";

export function answerWalletQuestion(kind: WalletQuestion, ctx: WalletAnswerContext): string {
  const connected = norm(ctx.connectedWallet);
  const bound = norm(ctx.boundWallet);
  const support = chainSupport(ctx.chainId);
  const family = walletFamilyLabel(ctx.walletRdns);
  const onSupported = support !== "UNSUPPORTED" && support !== "LEGACY_UNSUPPORTED" && support !== "UNKNOWN";

  switch (kind) {
    case "BIND_GAS":
    case "WHY_BIND":
      return BIND_WHY;
    case "CONNECTED":
      return connected ? `Yes — ${family} ${short(connected)} is connected on ${CHAIN_NAME[support]}.` : "No wallet is connected in this browser. Tap Connect wallet — connecting never asks you to sign or approve anything.";
    case "WHICH_WALLET":
      return connected ? `${family} ${short(connected)}.` : "No wallet is connected right now.";
    case "BOUND": {
      if (!ctx.signedIn) return "Sign in first — binding links a wallet to your FlowBridge account.";
      const email = ctx.emailVerified ? "Your email is verified." : "Your email is not verified yet (that is a separate step).";
      if (!bound) return `No wallet is bound to your account yet. Use Verify & bind wallet on Earn — it is a free signature, no gas. ${email}`;
      const match = connected && connected !== bound ? ` The connected wallet ${short(connected)} is different — switch to the bound one for rewards.` : "";
      return `Yes — ${short(bound)} is bound to your account.${match} ${email}`;
    }
    case "NETWORK":
      if (!connected) return `No wallet is connected. ${NETWORK_HELP}`;
      if (support === "LEGACY_UNSUPPORTED") return `Your wallet is on chain 1024, which FlowBridge does not support. BOT Mainnet is 677. ${NETWORK_HELP}`;
      if (!onSupported) return `Your wallet is on ${CHAIN_NAME[support]}. ${NETWORK_HELP}`;
      return `Yes — you are on ${CHAIN_NAME[support]}, a supported network. FLOW rewards and claims use BOT Mainnet (677).`;
    case "CANT_TRADE": {
      if (!connected) return "No wallet is connected. Connect one first — connecting never signs anything.";
      if (!onSupported) return `Your wallet is on ${CHAIN_NAME[support]}. ${NETWORK_HELP}`;
      return "Your wallet is connected on a supported network. If a trade still won't start, the pair may have no route right now, or the balance may not cover amount plus gas — Trade shows the exact reason before you sign.";
    }
    case "CAN_CLAIM": {
      if (!ctx.signedIn) return "Sign in to check your own claim state.";
      if (!bound) return "Not yet — bind a wallet first. Claims go only to your bound wallet.";
      const p = ctx.progression;
      if (!p) return "I can't read your claim state right now, so I won't guess. Check Earn.";
      const a = p.allocation;
      if (a?.claimed) return `Round #${a.epochId} (${Math.floor(a.amountFlow)} FLOW) is already claimed.`;
      if (a && p.claimButton) {
        if (connected && connected !== bound) return `Yes, round #${a.epochId} is open for ${short(bound)} — but connect that wallet; claims only work from it.`;
        return `Yes — round #${a.epochId} has ${Math.floor(a.amountFlow)} FLOW for your wallet and the window is open. Claim on Earn and sign it yourself.`;
      }
      if (a) return `Round #${a.epochId} has ${Math.floor(a.amountFlow)} FLOW for you, but the claim window is not open (${new Date(a.claimStart * 1000).toUTCString()} to ${new Date(a.claimEnd * 1000).toUTCString()}).`;
      const avail = Math.floor(p.availableTowardMinimum);
      if (avail < 1000) return `Not yet — ${avail.toLocaleString("en-US")} / 1,000 eligible funded FLOW. Claims need at least 1,000 and a published payout round.`;
      return "You have reached 1,000 eligible FLOW but are not in a published payout round yet. A reviewer publishes rounds; then you get a 30-day claim window.";
    }
  }
}
