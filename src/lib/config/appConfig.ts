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

/** Optional publish window for a slide. Times are ISO strings (UTC). */
export interface BannerSchedule {
  startAt?: string | null;
  endAt?: string | null;
  /** Allowed weekdays, 0 = Sunday … 6 = Saturday. Empty/undefined = every day. */
  days?: number[] | null;
}

/** How the artwork fills the banner card. */
export type BannerLayout = "compact" | "logo" | "full";

/** One rotating promo slide. Purely presentational + a link target. */
export interface BannerSlide {
  id: string;
  title: string;
  body?: string;
  imageUrl?: string | null;
  /** Internal route ("/rewards") or absolute URL. Empty = not clickable. */
  href?: string | null;
  theme?: "swap" | "bridge";
  isActive?: boolean;
  /** compact = small icon, logo = larger logo, full = edge-to-edge artwork. */
  layout?: BannerLayout;
  schedule?: BannerSchedule | null;
}

export interface BannerSurface {
  intervalMs: number;
  slides: BannerSlide[];
}

export type BannerSurfaceKey = "cabot" | "swap" | "bridge" | "home";

export type BannerSettings = Record<BannerSurfaceKey, BannerSurface>;

/** One external/social link on a partner profile. */
export interface PartnerLink {
  label: string;
  url: string;
}

/** One active campaign row on a partner profile. */
export interface PartnerCampaign {
  title: string;
  reward?: string;
  href?: string | null;
}

/** Admin-managed partner card + profile shown on /partners. */
export interface PartnerCard {
  id: string;
  name: string;
  tagline?: string;
  category?: string;
  status?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  href?: string | null;
  about?: string;
  totalRewards?: string;
  featured?: boolean;
  isActive?: boolean;
  links?: PartnerLink[];
  campaigns?: PartnerCampaign[];
}

export interface AppConfig {
  fees: FeeSettings;
  rewards: RewardSettings;
  flags: FlagSettings;
  banners: BannerSettings;
  partners: PartnerCard[];
  tokens: RemoteToken[];
}

export const BANNER_SURFACES: BannerSurfaceKey[] = ["cabot", "swap", "bridge", "home"];


export const DEFAULT_BANNERS: BannerSettings = {
  cabot: {
    intervalMs: 4000,
    slides: [
      {
        id: "cabot-default",
        title: "CA / BOT Instant Swap",
        body: "Fixed pair routing with live quotes.",
        imageUrl: null,
        href: "/rewards",
        theme: "swap",
      },
    ],
  },
  swap: {
    intervalMs: 4000,
    slides: [
      {
        id: "swap-default",
        title: "Swap & Earn FLOW Points",
        body: "Earn points on every qualified swap.",
        imageUrl: null,
        href: "/rewards",
        theme: "swap",
      },
    ],
  },
  bridge: {
    intervalMs: 4000,
    slides: [
      {
        id: "bridge-default",
        title: "Cross-Chain Bridge",
        body: "Fast. Secure. Multi-chain.",
        imageUrl: null,
        href: "/activity",
        theme: "bridge",
      },
    ],
  },
  home: {
    intervalMs: 4000,
    slides: [
      {
        id: "home-campaign",
        title: "BOT Chain Campaign",
        body: "Swap on BOT Chain and earn bonus FLOW points.",
        imageUrl: null,
        href: "/rewards",
        theme: "swap",
        layout: "logo",
      },
    ],
  },
};

/** Seed partner cards — replaced entirely once an admin publishes a list. */
export const DEFAULT_PARTNERS: PartnerCard[] = [
  {
    id: "bot-chain",
    name: "BOT Chain",
    tagline: "Layer-1 powering FlowBridge routing",
    category: "Infrastructure",
    status: "Live",
    ctaLabel: "Participate",
    href: "/markets",
    about:
      "BOT Chain is the EVM-compatible network FlowBridge routes on. Low fees and fast finality make it ideal for high-frequency swaps and cross-chain settlement.",
    totalRewards: "—",
    featured: true,
    isActive: true,
    links: [],
    campaigns: [{ title: "Swap & earn FLOW", reward: "1 FLOW / $1", href: "/" }],
  },
  {
    id: "carypact",
    name: "CaryPact",
    tagline: "CA token ecosystem & community rewards",
    category: "Community",
    status: "Live",
    ctaLabel: "Participate",
    href: "/",
    about:
      "CaryPact drives the CA token community with recurring quests and liquidity campaigns. CA/BOT is a first-class pair inside FlowBridge.",
    totalRewards: "—",
    featured: true,
    isActive: true,
    links: [],
    campaigns: [{ title: "CA / BOT liquidity quest", reward: "Bonus FLOW", href: "/" }],
  },
  {
    id: "flow-fortune",
    name: "Flow Fortune Wheel",
    tagline: "Two free spins a day, 50 FLOW jackpot",
    category: "Games",
    status: "Launching soon",
    ctaLabel: "Preview",
    href: "/fortune",
    about: "A daily spin mini-app with FLOW prizes. Demo only — no points are awarded yet.",
    isActive: true,
    links: [],
    campaigns: [],
  },
  {
    id: "arcadeflix",
    name: "ArcadeFlix P2E",
    tagline: "Skill arcade with weekly prize pools",
    category: "Games",
    status: "In development",
    ctaLabel: "Preview",
    href: "/arcadeflix",
    about: "Skill-based arcade titles with weekly FLOW prize pools. Currently in development.",
    isActive: true,
    links: [],
    campaigns: [],
  },
  {
    id: "ecosurge",
    name: "Ecosurge Growth Hub",
    tagline: "Partner campaigns that stack multipliers",
    category: "Growth",
    status: "Partner onboarding",
    ctaLabel: "Preview",
    href: "/ecosurge",
    about: "Ecosystem growth campaigns that stack FLOW multipliers across partner apps.",
    isActive: true,
    links: [],
    campaigns: [],
  },
];

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
  flags: { showBanners: true, maintenanceNotice: "" },
  banners: DEFAULT_BANNERS,
  partners: DEFAULT_PARTNERS,

  tokens: [],

};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function mergeSchedule(raw: any): BannerSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const startAt = str(raw.startAt ?? raw.start_at).trim() || null;
  const endAt = str(raw.endAt ?? raw.end_at).trim() || null;
  const days = Array.isArray(raw.days)
    ? Array.from(
        new Set(
          raw.days
            .map((d: any) => Number(d))
            .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ).sort()
    : null;
  if (!startAt && !endAt && (!days || days.length === 0 || days.length === 7)) return null;
  return { startAt, endAt, days: days && days.length ? (days as number[]) : null };
}

function mergeSlide(raw: any, index: number, surface: string): BannerSlide | null {
  if (!raw || typeof raw !== "object") return null;
  const title = str(raw.title).trim();
  if (!title) return null;
  const layout: BannerLayout =
    raw.layout === "full" || raw.layout === "logo" ? raw.layout : "compact";
  return {
    id: str(raw.id).trim() || `${surface}-${index}`,
    title,
    body: str(raw.body).trim() || undefined,
    imageUrl: str(raw.imageUrl ?? raw.image_url).trim() || null,
    href: str(raw.href ?? raw.link).trim() || null,
    theme: raw.theme === "bridge" ? "bridge" : "swap",
    isActive: raw.isActive !== false,
    layout,
    schedule: mergeSchedule(raw.schedule),
  };
}

/** True when the slide is live now (enabled + inside its schedule window). */
export function isSlideVisible(slide: BannerSlide, now: Date = new Date()): boolean {
  if (slide.isActive === false) return false;
  const s = slide.schedule;
  if (!s) return true;
  const t = now.getTime();
  if (s.startAt) {
    const start = Date.parse(s.startAt);
    if (Number.isFinite(start) && t < start) return false;
  }
  if (s.endAt) {
    const end = Date.parse(s.endAt);
    if (Number.isFinite(end) && t > end) return false;
  }
  if (s.days && s.days.length && !s.days.includes(now.getDay())) return false;
  return true;
}


/** Normalizes admin-published banner settings, falling back to defaults. */
export function mergeBanners(partial: any): BannerSettings {
  const out = {} as BannerSettings;
  for (const key of BANNER_SURFACES) {
    const raw = partial?.[key];
    const fallback = DEFAULT_BANNERS[key];
    const slides = Array.isArray(raw?.slides)
      ? raw.slides
          .map((s: any, i: number) => mergeSlide(s, i, key))
          .filter((s: BannerSlide | null): s is BannerSlide => !!s)
      : fallback.slides;
    out[key] = {
      intervalMs: Math.min(60000, Math.max(1500, num(raw?.intervalMs, fallback.intervalMs))),
      slides,
    };
  }
  return out;
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
      showBanners: p.flags?.showBanners !== false,
      maintenanceNotice: typeof p.flags?.maintenanceNotice === "string" ? p.flags.maintenanceNotice : "",
    },
    banners: mergeBanners(p.banners),

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

/** Active + currently scheduled banner slides and delay for a tab surface. */
export function getBannerSurface(config: AppConfig, key: BannerSurfaceKey): BannerSurface {
  const surface = config.banners?.[key] ?? DEFAULT_BANNERS[key];
  const now = new Date();
  return {
    intervalMs: surface.intervalMs,
    slides: surface.slides.filter((s) => isSlideVisible(s, now)),
  };
}

