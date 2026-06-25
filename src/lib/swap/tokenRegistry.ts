// Curated token list + persisted user-imported tokens for the universal Swap card.
import { getContracts } from "@/lib/contracts";

export const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;

export interface Token {
  address: string;       // lowercase; sentinel for native BOT
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
  imported?: boolean;
}

export function getCuratedTokens(isMainnet: boolean): Token[] {
  const c = getContracts(isMainnet);
  return [
    {
      address: NATIVE_TOKEN_ADDRESS,
      symbol: "BOT",
      name: "BOT (native)",
      decimals: 18,
      isNative: true,
    },
    {
      address: c.wbot.toLowerCase(),
      symbol: "WBOT",
      name: "Wrapped BOT",
      decimals: 18,
    },
    {
      address: c.usdtBot.toLowerCase(),
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    {
      address: c.caToken.toLowerCase(),
      symbol: "CA",
      name: "CaryPact",
      decimals: 18,
    },
  ];
}

const STORAGE_KEY = "flowbridge.imported_tokens.v1";

interface StoredMap {
  [chainKey: string]: Token[];
}

function readStore(): StoredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function chainKey(isMainnet: boolean) {
  return isMainnet ? "bot-mainnet" : "bot-testnet";
}

export function getImportedTokens(isMainnet: boolean): Token[] {
  return readStore()[chainKey(isMainnet)] ?? [];
}

export function addImportedToken(isMainnet: boolean, token: Token) {
  const store = readStore();
  const key = chainKey(isMainnet);
  const list = store[key] ?? [];
  const addr = token.address.toLowerCase();
  if (list.some((t) => t.address.toLowerCase() === addr)) return;
  store[key] = [...list, { ...token, address: addr, imported: true }];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

export function tokenKey(t: Token) {
  return t.address.toLowerCase();
}
