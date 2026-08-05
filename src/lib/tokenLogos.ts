/**
 * Token logo registry.
 *
 * Resolution order used by <TokenIcon />:
 *   1. Local brand asset (BOT Chain natives: CA, BOT)
 *   2. Remote CDN logo (cryptocurrency-icons — stable, versioned jsDelivr path)
 *   3. Lettered fallback circle rendered by the component
 *
 * Keep every entry lowercase-keyed by symbol so lookups are case-insensitive.
 */

const CDN = "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color";

/** Symbols that ship with a local brand PNG (with an SVG fallback in /public). */
export const LOCAL_LOGOS: Record<string, { png: string; svg: string }> = {
  ca: { png: "/carypact-logo.png", svg: "/carypact-logo.svg" },
  bot: { png: "/bot-icon.png", svg: "/bot-icon.svg" },
  wbot: { png: "/bot-icon.png", svg: "/bot-icon.svg" },
  cawbot: { png: "/bot-icon.png", svg: "/bot-icon.svg" },
};

/** Remote logo slugs on the icon CDN, keyed by token symbol. */
const REMOTE_SLUGS: Record<string, string> = {
  btc: "btc",
  wbtc: "wbtc",
  eth: "eth",
  weth: "eth",
  bnb: "bnb",
  wbnb: "bnb",
  usdt: "usdt",
  usdc: "usdc",
  busd: "busd",
  dai: "dai",
  trx: "trx",
  link: "link",
  uni: "uni",
  shib: "shib",
  cake: "cake",
  matic: "matic",
  sol: "sol",
  ada: "ada",
  xrp: "xrp",
  doge: "doge",
  ltc: "ltc",
  avax: "avax",
  dot: "dot",
  atom: "atom",
  near: "near",
  arb: "arb",
  op: "op",
  jst: "jst",
  sun: "sun",
};

export function normalizeSymbol(symbol: string) {
  return (symbol || "").trim().toLowerCase();
}

/** Ordered list of candidate image URLs for a symbol (may be empty). */
export function logoCandidates(symbol: string): string[] {
  const key = normalizeSymbol(symbol);
  const out: string[] = [];
  const local = LOCAL_LOGOS[key];
  if (local) out.push(local.png, local.svg);
  const slug = REMOTE_SLUGS[key];
  if (slug) out.push(`${CDN}/${slug}.svg`);
  return out;
}

export function hasKnownLogo(symbol: string) {
  return logoCandidates(symbol).length > 0;
}

/** Stable brand-ish tint for the lettered fallback, derived from the symbol. */
export function symbolHue(symbol: string) {
  const key = normalizeSymbol(symbol) || "?";
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}
