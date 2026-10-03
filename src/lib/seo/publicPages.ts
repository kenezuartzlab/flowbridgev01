/** Growth V1 — the only list of indexable public pages. Private pages never appear. */
export const PUBLIC_PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/trade", changefreq: "daily", priority: "0.9" },
  { path: "/markets", changefreq: "hourly", priority: "0.9" },
  { path: "/discover", changefreq: "weekly", priority: "0.8" },
  { path: "/learn", changefreq: "weekly", priority: "0.8" },
  { path: "/earn", changefreq: "weekly", priority: "0.8" },
  { path: "/stake", changefreq: "weekly", priority: "0.7" },
  { path: "/liquidity", changefreq: "weekly", priority: "0.7" },
  { path: "/rewards", changefreq: "weekly", priority: "0.7" },
  { path: "/docs", changefreq: "monthly", priority: "0.7" },
  { path: "/bot-chain", changefreq: "monthly", priority: "0.7" },
  { path: "/fortune", changefreq: "weekly", priority: "0.5" },
  { path: "/ecosurge", changefreq: "weekly", priority: "0.5" },
  { path: "/arcadeflix", changefreq: "weekly", priority: "0.5" },
] as const;

export const PRIVATE_PATH_PREFIXES = ["/ops", "/admin", "/account", "/wallet", "/activity", "/home", "/api", "/campaigns/analytics", "/campaigns/studio", "/studio", "/sets", "/reset-password"] as const;

export const isPrivatePath = (p: string) => PRIVATE_PATH_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
