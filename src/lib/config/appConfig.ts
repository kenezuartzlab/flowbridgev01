// Runtime app configuration published by the admin panel.
// Client-safe: reads the public /api/config endpoint and caches it in-module.
// Defaults mirror the previous hardcoded values so behaviour never regresses
// when the backend is unreachable.
import { useEffect, useState } from "react";

export interface FeeSettings {
  defaultSlippagePct: number;
  maxSlippagePct: number;
  minBridgeUsd: number;
}

export interface RewardSettings {
  minUsd: number;
  usdBlock: number;
  pointsPerBlock: number;
  referralClaimMinSwapUsd: number;
  claimThreshold: number;
  /** % of a referee's earned swap points credited to their referrer. */
  referralActivityPct: number;
}

export interface FlagSettings {
  limitTabPublic: boolean;
  showBanners: boolean;
  maintenanceNotice: string;
}

export interface RemoteToken {
  id?: string;
  chain: "mainnet" | "testnet";
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string | null;
  routerId?: number | null;
  liquidityVerified?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AppConfig {
  fees: FeeSettings;
  rewards: RewardSettings;
  flags: FlagSettings;
  tokens: RemoteToken[];
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  fees: { defaultSlippagePct: 0.5, maxSlippagePct: 5, minBridgeUsd: 10 },
  rewards: {
    minUsd: 5,
    usdBlock: 1,
    pointsPerBlock: 1,
    referralClaimMinSwapUsd: 100,
    claimThreshold: 1000,
    referralActivityPct: 20,
  },
  flags: { limitTabPublic: false, showBanners: true, maintenanceNotice: "" },
  tokens: [],
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mergeAppConfig(partial: any): AppConfig {
  const p = partial ?? {};
  const d = DEFAULT_APP_CONFIG;
  return {
    fees: {
      defaultSlippagePct: num(p.fees?.defaultSlippagePct, d.fees.defaultSlippagePct),
      maxSlippagePct: num(p.fees?.maxSlippagePct, d.fees.maxSlippagePct),
      minBridgeUsd: num(p.fees?.minBridgeUsd, d.fees.minBridgeUsd),
    },
    rewards: {
      minUsd: num(p.rewards?.minUsd, d.rewards.minUsd),
      usdBlock: Math.max(0.01, num(p.rewards?.usdBlock, d.rewards.usdBlock)),
      pointsPerBlock: num(p.rewards?.pointsPerBlock, d.rewards.pointsPerBlock),
      referralClaimMinSwapUsd: num(
        p.rewards?.referralClaimMinSwapUsd,
        d.rewards.referralClaimMinSwapUsd,
      ),
      claimThreshold: num(p.rewards?.claimThreshold, d.rewards.claimThreshold),
      referralActivityPct: Math.min(
        100,
        Math.max(0, num(p.rewards?.referralActivityPct, d.rewards.referralActivityPct)),
      ),
    },
    flags: {
      limitTabPublic: !!p.flags?.limitTabPublic,
      showBanners: p.flags?.showBanners !== false,
      maintenanceNotice: typeof p.flags?.maintenanceNotice === "string" ? p.flags.maintenanceNotice : "",
    },
    tokens: Array.isArray(p.tokens)
      ? p.tokens
          .filter((t: any) => t && typeof t.address === "string" && typeof t.symbol === "string")
          .map((t: any) => ({
            id: t.id,
            chain: t.chain === "testnet" ? "testnet" : "mainnet",
            address: String(t.address).toLowerCase(),
            symbol: String(t.symbol),
            name: String(t.name ?? t.symbol),
            decimals: num(t.decimals, 18),
            logoUrl: t.logoUrl ?? t.logo_url ?? null,
            routerId: t.routerId ?? t.router_id ?? null,
            liquidityVerified: !!(t.liquidityVerified ?? t.liquidity_verified),
            isActive: t.isActive ?? t.is_active ?? true,
            sortOrder: num(t.sortOrder ?? t.sort_order, 100),
          }))
      : [],
  };
}

let current: AppConfig = DEFAULT_APP_CONFIG;
let loadPromise: Promise<AppConfig> | null = null;
const listeners = new Set<(c: AppConfig) => void>();

export function getAppConfig(): AppConfig {
  return current;
}

export function setAppConfig(next: AppConfig) {
  current = next;
  listeners.forEach((l) => l(current));
}

/** Fetches published config once per session (idempotent). */
export function loadAppConfig(force = false): Promise<AppConfig> {
  if (typeof window === "undefined") return Promise.resolve(current);
  if (loadPromise && !force) return loadPromise;
  loadPromise = fetch("/api/config")
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json) setAppConfig(mergeAppConfig(json));
      return current;
    })
    .catch(() => current);
  return loadPromise;
}

export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(current);
  useEffect(() => {
    listeners.add(setCfg);
    void loadAppConfig();
    return () => {
      listeners.delete(setCfg);
    };
  }, []);
  return cfg;
}

/** Admin-published tokens for a chain, newest-sorted for the picker. */
export function getRemoteTokens(isMainnet: boolean): RemoteToken[] {
  const chain = isMainnet ? "mainnet" : "testnet";
  return current.tokens
    .filter((t) => t.chain === chain && t.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
}
