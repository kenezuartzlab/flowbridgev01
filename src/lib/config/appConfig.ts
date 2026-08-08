// Runtime app configuration published by the admin panel.
// Client-safe: reads the public /api/config endpoint and caches it in-module.
// Defaults mirror the previous hardcoded values so behaviour never regresses
// when the backend is unreachable.
import { useEffect, useState, type CSSProperties } from "react";
import { setLogoOverrides } from "@/lib/tokenLogos";

export interface FeeSettings {
  defaultSlippagePct: number;
  maxSlippagePct: number;
  minBridgeUsd: number;
  /**
   * Platform fee disclosed in the UI and reserved by MAX/percentage buttons,
   * in basis points (10 = 0.1%). Must mirror FlowBridgeRouter's globalFeeBps —
   * update this whenever the router's fee config changes on-chain. Execution
   * still reads the exact fee from the contract before every swap.
   */
  platformFeeBps: number;
}

/** "0.1%" style label for a fee expressed in basis points. */
export const feeBpsLabel = (bps: number) =>
  `${Number(((bps || 0) / 100).toFixed(4))}%`;

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
  /** Surface toggles — hide sections app-wide without a code change. */
  showMarkets: boolean;
  showPartners: boolean;
  showGames: boolean;
  showAssistant: boolean;
  showActivity: boolean;
  /** Global kill switches for the trade surfaces. */
  swapEnabled: boolean;
  bridgeEnabled: boolean;
}

/** Public brand/social links surfaced in the footer, tasks and partner pages. */
export interface SocialSettings {
  x: string;
  telegram: string;
  youtube: string;
  discord: string;
  website: string;
  docs: string;
  supportEmail: string;
}

/** Editable marketing copy so headline text isn't hardcoded. */
export interface ContentSettings {
  brandName: string;
  tagline: string;
  announcement: string;
  announcementHref: string;
  footerNote: string;
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

/** One admin-managed tile in Home → Quick actions. */
export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  /** Internal route ("/rewards") or absolute URL. */
  to: string;
  /** Optional in-page hash for internal routes. */
  hash?: string | null;
  /** Icon source: built-in line icon, 3D asset kit, or uploaded image. */
  iconKind?: "lucide" | "kit" | "image";
  icon?: string;
  imageUrl?: string | null;
  /** "cover" makes artwork full-bleed (edge-to-edge); "contain" pads it. */
  iconFit?: "contain" | "cover";

  /** Optional feature-flag key that hides the tile when disabled. */
  flag?: string | null;
  isActive?: boolean;
}

/** Pages that expose an admin-editable hero + label set. */
export type PageKey =
  | "home"
  | "wallet"
  | "rewards"
  | "account"
  | "markets"
  | "partners"
  | "activity"
  | "swap";

export const PAGE_KEYS: PageKey[] = [
  "home",
  "wallet",
  "rewards",
  "account",
  "markets",
  "partners",
  "activity",
  "swap",
];

/** Look-and-feel of a page's top hero/dashboard card. */
export interface PageHeroSettings {
  /** Small uppercase line above the title in the top bar / header. */
  eyebrow?: string;
  /** Big header title (top bar / page header). */
  title?: string;
  /** Optional supporting line. */
  subtitle?: string;
  /** Gradient override — leave blank to keep the built-in theme gradient. */
  gradientFrom?: string | null;
  gradientVia?: string | null;
  gradientTo?: string | null;
  /** Background artwork behind the whole card. */
  backgroundImageUrl?: string | null;
  /** 0-100 opacity of the background artwork. */
  backgroundOpacity?: number;
  /** Corner illustration: 3D kit asset, uploaded image, or none. */
  artworkKind?: "kit" | "image" | "none";
  artworkName?: string;
  artworkUrl?: string | null;
  /** Corner illustration size in px and 0-100 opacity. */
  artworkSize?: number;
  artworkOpacity?: number;
}

/** Admin-configurable icon for a named slot inside a page. */
export interface PageIconSetting {
  kind?: "kit" | "image" | "lucide" | "none";
  name?: string;
  imageUrl?: string | null;
}

/** Editable hero + free-form label overrides for one page. */
export interface PageSettings {
  hero: PageHeroSettings;
  /** slot key → replacement text. Unset slots keep the built-in copy. */
  labels: Record<string, string>;
  /** slot key → icon override. Unset slots keep the built-in artwork. */
  icons: Record<string, PageIconSetting>;
}

export type PagesSettings = Record<PageKey, PageSettings>;


/** Label slots each page exposes to the control panel. */
export const PAGE_LABEL_SLOTS: Record<PageKey, [string, string][]> = {
  home: [
    ["balance", "FLOW balance"],
    ["rewardsCta", "Rewards"],
    ["claimable", "Claimable"],
    ["volume", "Swap volume"],
    ["quickActions", "Quick actions"],
    ["markets", "BOT Chain prices"],
    ["activity", "Recent activity"],
  ],
  wallet: [
    ["portfolio", "Portfolio value"],
    ["holdings", "Holdings"],
    ["history", "Transaction history"],
  ],
  rewards: [
    ["points", "Total FLOW Points"],
    ["available", "Available"],
    ["pending", "Pending"],
  ],
  account: [
    ["flow", "FLOW"],
    ["play", "Play points"],
    ["activity", "Your activity"],
  ],
  markets: [["heading", "Markets"]],
  partners: [["heading", "Partners"]],
  activity: [["heading", "Activity"]],
  swap: [["heading", "Trade"]],
};

/**
 * Icon slots each page exposes to the control panel:
 * [slot, admin label, built-in kind, built-in name]
 */
export const PAGE_ICON_SLOTS: Record<PageKey, [string, string, "kit" | "lucide", string][]> = {
  home: [
    ["claimable", "Claimable tile icon", "kit", "gift"],
    ["volume", "Swap volume tile icon", "kit", "bolt"],
  ],
  wallet: [],
  rewards: [],
  account: [
    ["flow", "FLOW tile icon", "kit", "starCoin"],
    ["play", "Play points tile icon", "kit", "gem"],
    ["pass", "Verified pass logo", "kit", "flowbridge"],
    ["passBadge", "Verified pass background", "kit", "shieldCheck"],
  ],
  markets: [],
  partners: [
    ["category", "Category tile icon", "kit", "network"],
    ["empty", "Empty-state icon", "kit", "handshake"],
  ],
  activity: [],
  swap: [],
};

/** Built-in icon for a slot, used when the admin has not overridden it. */
export function defaultPageIcon(key: PageKey, slot: string): PageIconSetting {
  const found = PAGE_ICON_SLOTS[key]?.find(([s]) => s === slot);
  return found ? { kind: found[2], name: found[3] } : { kind: "none" };
}



export interface AppConfig {
  fees: FeeSettings;
  rewards: RewardSettings;
  flags: FlagSettings;
  social: SocialSettings;
  content: ContentSettings;
  banners: BannerSettings;
  partners: PartnerCard[];
  quickActions: QuickAction[];
  pages: PagesSettings;
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

/** Seed Home quick actions — restored whenever an admin publishes an empty list. */
export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: "qa-swap", label: "Swap", hint: "Best route", to: "/", iconKind: "lucide", icon: "ArrowLeftRight", isActive: true },
  { id: "qa-markets", label: "Markets", hint: "Live prices", to: "/markets", iconKind: "lucide", icon: "LineChart", flag: "showMarkets", isActive: true },
  { id: "qa-partners", label: "Partners", hint: "Quests & apps", to: "/partners", iconKind: "lucide", icon: "Compass", flag: "showPartners", isActive: true },
  { id: "qa-rewards", label: "Rewards", hint: "FLOW points", to: "/rewards", iconKind: "lucide", icon: "Gift", isActive: true },
  { id: "qa-portal", label: "FLOW Portal", hint: "Incentive tasks", to: "/rewards", hash: "portal", iconKind: "lucide", icon: "Heart", isActive: true },
  { id: "qa-assistant", label: "Assistant", hint: "Ask anything", to: "/assistant", iconKind: "lucide", icon: "Sparkles", flag: "showAssistant", isActive: true },
];

function emptyPage(hero: PageHeroSettings = {}): PageSettings {
  return { hero, labels: {}, icons: {} };
}


/** Seed page themes — mirror the current hardcoded hero artwork. */
export const DEFAULT_PAGES: PagesSettings = {
  home: emptyPage({ artworkKind: "kit", artworkName: "flowbridge", artworkSize: 132, artworkOpacity: 20 }),
  wallet: emptyPage({ artworkKind: "kit", artworkName: "vault", artworkSize: 130, artworkOpacity: 20 }),
  rewards: emptyPage({ artworkKind: "kit", artworkName: "trophy", artworkSize: 128, artworkOpacity: 20 }),
  account: emptyPage({ artworkKind: "none", artworkSize: 120, artworkOpacity: 20 }),
  markets: emptyPage(),
  partners: emptyPage(),
  activity: emptyPage(),
  swap: emptyPage(),
};

export const DEFAULT_APP_CONFIG: AppConfig = {


  fees: { defaultSlippagePct: 0.5, maxSlippagePct: 5, minBridgeUsd: 10, platformFeeBps: 10 },
  rewards: {
    minUsd: 5,
    usdBlock: 1,
    pointsPerBlock: 1,
    referralClaimMinSwapUsd: 100,
    claimThreshold: 1000,
    referralActivityPct: 20,
  },
  flags: {
    showBanners: true,
    maintenanceNotice: "",
    showMarkets: true,
    showPartners: true,
    showGames: true,
    showAssistant: true,
    showActivity: true,
    swapEnabled: true,
    bridgeEnabled: true,
  },
  social: {
    x: "https://x.com/flowbridgeweb3",
    telegram: "https://t.me/flowbridgeweb3",
    youtube: "https://youtube.com/@flowbridgeweb3",
    discord: "",
    website: "https://flowbridge.space",
    docs: "",
    supportEmail: "",
  },
  content: {
    brandName: "FlowBridge",
    tagline: "Swap on BOT Chain, bridge USDT across chains, earn FLOW.",
    announcement: "",
    announcementHref: "",
    footerNote: "ⓒ 2026 FlowBridge. Built by Kenezu",
  },
  banners: DEFAULT_BANNERS,
  partners: DEFAULT_PARTNERS,
  quickActions: DEFAULT_QUICK_ACTIONS,
  pages: DEFAULT_PAGES,




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

/** Normalizes an admin-published partner list (empty list = use defaults). */
export function mergePartners(raw: any): PartnerCard[] {
  if (!Array.isArray(raw)) return DEFAULT_PARTNERS;
  const list = raw
    .map((p: any, i: number): PartnerCard | null => {
      if (!p || typeof p !== "object") return null;
      const name = str(p.name).trim();
      if (!name) return null;
      return {
        id: str(p.id).trim() || `partner-${i}`,
        name,
        tagline: str(p.tagline).trim() || undefined,
        category: str(p.category).trim() || undefined,
        status: str(p.status).trim() || undefined,
        imageUrl: str(p.imageUrl ?? p.image_url).trim() || null,
        ctaLabel: str(p.ctaLabel).trim() || "Participate",
        href: str(p.href).trim() || null,
        about: str(p.about).trim() || undefined,
        totalRewards: str(p.totalRewards).trim() || undefined,
        featured: p.featured === true,
        isActive: p.isActive !== false,
        links: Array.isArray(p.links)
          ? p.links
              .map((l: any) => ({ label: str(l?.label).trim(), url: str(l?.url).trim() }))
              .filter((l: PartnerLink) => l.label && l.url)
          : [],
        campaigns: Array.isArray(p.campaigns)
          ? p.campaigns
              .map((c: any) => ({
                title: str(c?.title).trim(),
                reward: str(c?.reward).trim() || undefined,
                href: str(c?.href).trim() || null,
              }))
              .filter((c: PartnerCampaign) => !!c.title)
          : [],
      };
    })
    .filter((p: PartnerCard | null): p is PartnerCard => !!p);
  return list.length ? list : DEFAULT_PARTNERS;
}

/** Partner cards visible to users, featured first. */
export function getPartners(config: AppConfig): PartnerCard[] {
  return (config.partners ?? DEFAULT_PARTNERS).filter((p) => p.isActive !== false);
}

/** Normalizes an admin-published quick-action list (empty list = use defaults). */
export function mergeQuickActions(raw: any): QuickAction[] {
  if (!Array.isArray(raw)) return DEFAULT_QUICK_ACTIONS;
  const list = raw
    .map((a: any, i: number): QuickAction | null => {
      if (!a || typeof a !== "object") return null;
      const label = str(a.label).trim();
      const to = str(a.to ?? a.href).trim();
      if (!label || !to) return null;
      const kind = a.iconKind === "kit" || a.iconKind === "image" ? a.iconKind : "lucide";
      return {
        id: str(a.id).trim() || `qa-${i}`,
        label,
        hint: str(a.hint).trim() || undefined,
        to,
        hash: str(a.hash).trim().replace(/^#/, "") || null,
        iconKind: kind,
        icon: str(a.icon).trim() || undefined,
        imageUrl: str(a.imageUrl ?? a.image_url).trim() || null,
        iconFit: (a.iconFit ?? a.icon_fit) === "cover" ? "cover" : "contain",
        flag: str(a.flag).trim() || null,
        isActive: a.isActive !== false,
      };

    })
    .filter((a: QuickAction | null): a is QuickAction => !!a);
  return list.length ? list : DEFAULT_QUICK_ACTIONS;
}

/** Quick-action tiles visible to users (active + feature flag satisfied). */
export function getQuickActions(config: AppConfig): QuickAction[] {
  const list = config.quickActions?.length ? config.quickActions : DEFAULT_QUICK_ACTIONS;
  return list.filter(
    (a) => a.isActive !== false && (!a.flag || (config.flags as any)[a.flag] !== false),
  );
}

/** Normalizes admin-published per-page hero/label settings. */
export function mergePages(raw: any): PagesSettings {
  const out = {} as PagesSettings;
  for (const key of PAGE_KEYS) {
    const src = raw?.[key] ?? {};
    const fb = DEFAULT_PAGES[key];
    const h = src.hero ?? {};
    const kind =
      h.artworkKind === "image" || h.artworkKind === "none" || h.artworkKind === "kit"
        ? h.artworkKind
        : fb.hero.artworkKind ?? "none";
    const labels: Record<string, string> = {};
    if (src.labels && typeof src.labels === "object") {
      Object.entries(src.labels).forEach(([k, v]) => {
        const text = str(v).trim();
        if (k && text) labels[k.slice(0, 40)] = text.slice(0, 120);
      });
    }
    const icons: Record<string, PageIconSetting> = {};
    if (src.icons && typeof src.icons === "object") {
      Object.entries<any>(src.icons).forEach(([k, v]) => {
        if (!k || !v || typeof v !== "object") return;
        const ik =
          v.kind === "kit" || v.kind === "image" || v.kind === "lucide" || v.kind === "none"
            ? v.kind
            : undefined;
        if (!ik) return;
        icons[k.slice(0, 40)] = {
          kind: ik,
          name: str(v.name).trim().slice(0, 60) || undefined,
          imageUrl: str(v.imageUrl).trim().slice(0, 500) || null,
        };
      });
    }
    out[key] = {

      hero: {
        eyebrow: str(h.eyebrow).trim() || undefined,
        title: str(h.title).trim() || undefined,
        subtitle: str(h.subtitle).trim() || undefined,
        gradientFrom: str(h.gradientFrom).trim() || null,
        gradientVia: str(h.gradientVia).trim() || null,
        gradientTo: str(h.gradientTo).trim() || null,
        backgroundImageUrl: str(h.backgroundImageUrl).trim() || null,
        backgroundOpacity: Math.min(100, Math.max(0, num(h.backgroundOpacity, 35))),
        artworkKind: kind,
        artworkName: str(h.artworkName).trim() || fb.hero.artworkName,
        artworkUrl: str(h.artworkUrl).trim() || null,
        artworkSize: Math.min(320, Math.max(40, num(h.artworkSize, fb.hero.artworkSize ?? 128))),
        artworkOpacity: Math.min(100, Math.max(0, num(h.artworkOpacity, fb.hero.artworkOpacity ?? 20))),
      },
      labels,
      icons,
    };
  }
  return out;
}

/** Resolved page settings (never undefined). */
export function getPage(config: AppConfig, key: PageKey): PageSettings {
  return config.pages?.[key] ?? DEFAULT_PAGES[key];
}

/** Admin label override for a slot, falling back to the built-in copy. */
export function pageLabel(config: AppConfig, key: PageKey, slot: string, fallback: string): string {
  const v = getPage(config, key).labels?.[slot];
  return v && v.trim() ? v : fallback;
}

/** Admin icon override for a slot, falling back to the built-in artwork. */
export function pageIcon(config: AppConfig, key: PageKey, slot: string): PageIconSetting {
  const override = getPage(config, key).icons?.[slot];
  if (!override || !override.kind) return defaultPageIcon(key, slot);
  if (override.kind === "image" && !override.imageUrl) return defaultPageIcon(key, slot);
  return override;
}


/** Inline gradient style for a hero card when the admin overrode the colors. */
export function heroStyle(hero: PageHeroSettings): CSSProperties | undefined {
  const from = hero.gradientFrom;
  const to = hero.gradientTo;
  if (!from && !to) return undefined;
  const a = from || to!;
  const b = to || from!;
  const via = hero.gradientVia || undefined;
  const stops = via ? `${a} 0%, ${via} 55%, ${b} 100%` : `${a} 0%, ${b} 100%`;
  return {
    background: `radial-gradient(120% 130% at 12% 0%, rgba(255,255,255,0.22) 0%, transparent 55%), linear-gradient(135deg, ${stops})`,
  };
}


export function mergeAppConfig(partial: any): AppConfig {
  const p = partial ?? {};
  const d = DEFAULT_APP_CONFIG;
  return {
    fees: {
      defaultSlippagePct: num(p.fees?.defaultSlippagePct, d.fees.defaultSlippagePct),
      maxSlippagePct: num(p.fees?.maxSlippagePct, d.fees.maxSlippagePct),
      minBridgeUsd: num(p.fees?.minBridgeUsd, d.fees.minBridgeUsd),
      platformFeeBps: Math.min(
        500,
        Math.max(0, Math.round(num(p.fees?.platformFeeBps, d.fees.platformFeeBps))),
      ),
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
      maintenanceNotice: str(p.flags?.maintenanceNotice),
      showMarkets: p.flags?.showMarkets !== false,
      showPartners: p.flags?.showPartners !== false,
      showGames: p.flags?.showGames !== false,
      showAssistant: p.flags?.showAssistant !== false,
      showActivity: p.flags?.showActivity !== false,
      swapEnabled: p.flags?.swapEnabled !== false,
      bridgeEnabled: p.flags?.bridgeEnabled !== false,
    },
    social: {
      x: str(p.social?.x, d.social.x),
      telegram: str(p.social?.telegram, d.social.telegram),
      youtube: str(p.social?.youtube, d.social.youtube),
      discord: str(p.social?.discord, d.social.discord),
      website: str(p.social?.website, d.social.website),
      docs: str(p.social?.docs, d.social.docs),
      supportEmail: str(p.social?.supportEmail, d.social.supportEmail),
    },
    content: {
      brandName: str(p.content?.brandName, d.content.brandName) || d.content.brandName,
      tagline: str(p.content?.tagline, d.content.tagline),
      announcement: str(p.content?.announcement),
      announcementHref: str(p.content?.announcementHref),
      footerNote: str(p.content?.footerNote, d.content.footerNote),
    },

    banners: mergeBanners(p.banners),
    partners: mergePartners(p.partners),
    quickActions: mergeQuickActions(p.quickActions),
    pages: mergePages(p.pages),



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
  // Feed admin-published token artwork into the shared logo resolver.
  const map: Record<string, string> = {};
  next.tokens.forEach((t) => {
    if (t.logoUrl) map[t.symbol.trim().toLowerCase()] = t.logoUrl;
  });
  setLogoOverrides(map);
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

