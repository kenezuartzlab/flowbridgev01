// Network registry for the Wallet tab. The wallet auto-detects the chain the
// connected wallet is on and reads balances / sends / links for that chain.
import type { Chain } from "viem";
import { botMainnet, bscMainnet, ethereum, polygon } from "@/lib/wagmi";
import { getContracts } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS, type Token } from "@/lib/swap/tokenRegistry";

export interface WalletNetwork {
  id: number;
  /** Short label shown in the UI */
  label: string;
  /** Eyebrow shown in the top bar */
  eyebrow: string;
  chain: Chain;
  explorer: string;
  nativeSymbol: string;
  /** true → prices come from the on-chain BOT Chain quoter */
  useQuoterPricing: boolean;
  /** CoinGecko ids keyed by token symbol (used off BOT Chain) */
  priceIds: Record<string, string>;
  tokens: Token[];
}

const c = getContracts(true);

const native = (symbol: string, name: string): Token => ({
  address: NATIVE_TOKEN_ADDRESS,
  symbol,
  name,
  decimals: 18,
  isNative: true,
});

export const WALLET_NETWORKS: WalletNetwork[] = [
  {
    id: botMainnet.id,
    label: "BOT Chain",
    eyebrow: "BOT Chain · Mainnet",
    chain: botMainnet,
    explorer: "https://scan.botchain.ai",
    nativeSymbol: "BOT",
    useQuoterPricing: true,
    priceIds: {},
    tokens: [], // resolved dynamically from the token registry
  },
  {
    id: bscMainnet.id,
    label: "BNB Chain",
    eyebrow: "BNB Smart Chain · Mainnet",
    chain: bscMainnet,
    explorer: "https://bscscan.com",
    nativeSymbol: "BNB",
    useQuoterPricing: false,
    priceIds: { BNB: "binancecoin", USDT: "tether" },
    tokens: [
      native("BNB", "BNB"),
      { address: c.usdtBnb.toLowerCase(), symbol: "USDT", name: "Tether USD", decimals: 18 },
    ],
  },
  {
    id: ethereum.id,
    label: "Ethereum",
    eyebrow: "Ethereum · Mainnet",
    chain: ethereum,
    explorer: "https://etherscan.io",
    nativeSymbol: "ETH",
    useQuoterPricing: false,
    priceIds: { ETH: "ethereum", USDT: "tether", USDC: "usd-coin" },
    tokens: [
      native("ETH", "Ether"),
      { address: c.usdtEth.toLowerCase(), symbol: "USDT", name: "Tether USD", decimals: 6 },
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
      },
    ],
  },
  {
    id: polygon.id,
    label: "Polygon",
    eyebrow: "Polygon · Mainnet",
    chain: polygon,
    explorer: "https://polygonscan.com",
    nativeSymbol: "POL",
    useQuoterPricing: false,
    priceIds: { POL: "polygon-ecosystem-token", USDT: "tether", USDC: "usd-coin" },
    tokens: [
      native("POL", "Polygon"),
      {
        address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        symbol: "USDT",
        name: "Tether USD",
        decimals: 6,
      },
      {
        address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
      },
    ],
  },
];

export function findWalletNetwork(chainId?: number): WalletNetwork | null {
  if (!chainId) return null;
  return WALLET_NETWORKS.find((n) => n.id === chainId) ?? null;
}

export const DEFAULT_WALLET_NETWORK = WALLET_NETWORKS[0];
