import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Coins,
  Download,
  Globe,
  History,
  Info,
  LogOut,
  Moon,
  QrCode,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { KitIcon } from "@/components/kit/KitIcon";
import { SignInButton } from "@/components/auth/SignInButton";
import { useTheme } from "@/lib/theme";
import { useAccountData } from "@/lib/app/useAccountData";
import { logout } from "@/lib/auth";
import { readPlayState } from "@/lib/games/playState";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Profile & Settings | FlowBridge" },
      {
        name: "description",
        content:
          "Manage your FlowBridge profile: FLOW balance, appearance, notifications, display currency, language, data export and sign-out — all in one place.",
      },
      { property: "og:title", content: "FlowBridge Account" },
      {
        property: "og:description",
        content: "Your FlowBridge profile, preferences and data controls.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/account" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/account" }],
  }),
  component: AccountPage,
});

const CURRENCIES = ["USD", "EUR", "PHP", "JPY", "INR"] as const;
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
] as const;

const PREF_KEY = "fb_prefs_v1";

type Prefs = { notifications: boolean; marketing: boolean; currency: string; language: string };
const DEFAULT_PREFS: Prefs = {
  notifications: true,
  marketing: false,
  currency: "USD",
  language: "en",
};

function AccountPage() {
  const { user, authReady, incentives, transactions } = useAccountData();
  const [theme, setTheme] = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [open, setOpen] = useState<string | null>(null);
  const [play, setPlay] = useState(0);

  useEffect(() => {
    setPlay(readPlayState().points);
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable */
    }
  }, []);

  const savePrefs = (next: Partial<Prefs>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        window.localStorage.setItem(PREF_KEY, JSON.stringify(merged));
      } catch {
        /* storage unavailable */
      }
      return merged;
    });
  };

  const toggleTheme = () => setTheme();

  const flow = Number(incentives?.flowPoints ?? 0);
  const displayName = user?.displayName || user?.name || user?.email?.split("@")[0] || "Guest";
  const initial = displayName.slice(0, 1).toUpperCase();
  const avatar = user?.photoURL || user?.avatar_url || null;

  const exportData = useMemo(
    () => ({
      profile: { name: displayName, email: user?.email ?? null },
      flowPoints: flow,
      playPoints: play,
      preferences: prefs,
      transactions,
      exportedAt: new Date().toISOString(),
    }),
    [displayName, user?.email, flow, play, prefs, transactions],
  );

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowbridge-account-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader title="Account" subtitle="Profile & settings" />

      <main className="mx-auto max-w-2xl space-y-3 p-3 sm:p-4">
        {/* Profile card */}
        <section className="fb-surface p-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-primary/40 object-cover"
              />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/12 text-xl font-black text-primary">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[19px] font-black leading-tight">{displayName}</p>
              <p className="truncate font-mono text-[10.5px] text-muted">
                {user?.email ?? "Not signed in"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="fb-inset flex items-center gap-2 px-3 py-2">
              <KitIcon name="starCoin" size={28} />
              <span className="min-w-0">
                <span className="fb-eyebrow block">FLOW</span>
                <span className="block font-mono text-[14px] font-black tabular-nums text-primary">
                  {flow.toLocaleString("en-US")}
                </span>
              </span>
            </div>
            <div className="fb-inset flex items-center gap-2 px-3 py-2">
              <KitIcon name="gem" size={28} />
              <span className="min-w-0">
                <span className="fb-eyebrow block">Play points</span>
                <span className="block font-mono text-[14px] font-black tabular-nums">
                  {play.toLocaleString("en-US")}
                </span>
              </span>
            </div>
          </div>

          {authReady && !user && (
            <div className="mt-3 space-y-2">
              <p className="font-mono text-[10.5px] leading-relaxed text-muted">
                Sign in to sync your FLOW balance, referrals and transaction history.
              </p>
              <SignInButton label="Sign in" returnTo="/account" />
            </div>
          )}
        </section>

        {/* Verification / trust card — mirrors the reference A-Pass panel */}
        <section className="fb-surface relative overflow-hidden p-4">
          <KitIcon
            name="shieldCheck"
            size={92}
            className="pointer-events-none absolute -right-3 -top-2 opacity-20"
          />
          <div className="relative flex items-start gap-3">
            <KitIcon name="flowbridge" size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black">FlowBridge Verified Pass</p>
              <p className="mt-0.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {user
                  ? user.emailVerified || user.email_verified
                    ? "Email verified — wallet binding and referral rewards unlocked."
                    : "Verify your email from the header banner to unlock referral rewards."
                  : "Sign in and verify your email to unlock referral rewards."}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] ${
                user && (user.emailVerified || user.email_verified)
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
              {user && (user.emailVerified || user.email_verified) ? "Verified" : "Pending"}
            </span>
          </div>
        </section>

        {/* Navigation rows */}
        <Group title="Your activity">
          <RowLink to="/activity" icon={<History className="h-4 w-4" />} label="Activity" />
          <RowLink to="/wallet" icon={<QrCode className="h-4 w-4" />} label="Wallet address & QR" />
          <RowLink to="/rewards" icon={<Users className="h-4 w-4" />} label="Referrals & rewards" />
          <RowLink to="/games" icon={<ShieldCheck className="h-4 w-4" />} label="Games & challenges" />
        </Group>

        <Group title="Preferences">
          <RowButton
            icon={theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            label="Appearance"
            value={theme === "light" ? "Light" : "Dark"}
            onClick={toggleTheme}
          />
          <RowButton
            icon={<Bell className="h-4 w-4" />}
            label="Notifications"
            value={prefs.notifications ? "On" : "Off"}
            onClick={() => setOpen(open === "notif" ? null : "notif")}
          />
          {open === "notif" && (
            <div className="space-y-2 border-t border-hairline px-4 py-3">
              <Toggle
                label="Transaction alerts"
                checked={prefs.notifications}
                onChange={(v) => savePrefs({ notifications: v })}
              />
              <Toggle
                label="Product & marketing"
                checked={prefs.marketing}
                onChange={(v) => savePrefs({ marketing: v })}
              />
            </div>
          )}
          <RowButton
            icon={<Coins className="h-4 w-4" />}
            label="Display currency"
            value={prefs.currency}
            onClick={() => setOpen(open === "cur" ? null : "cur")}
          />
          {open === "cur" && (
            <div className="flex flex-wrap gap-2 border-t border-hairline px-4 py-3">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => savePrefs({ currency: c })}
                  data-active={prefs.currency === c}
                  className="fb-segment fb-inset min-h-[36px] flex-none px-3 font-mono text-[10.5px] font-black uppercase tracking-[0.1em]"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <RowButton
            icon={<Globe className="h-4 w-4" />}
            label="Language"
            value={LANGUAGES.find((l) => l.code === prefs.language)?.label ?? "English"}
            onClick={() => setOpen(open === "lang" ? null : "lang")}
          />
          {open === "lang" && (
            <div className="flex flex-wrap gap-2 border-t border-hairline px-4 py-3">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => savePrefs({ language: l.code })}
                  data-active={prefs.language === l.code}
                  className="fb-segment fb-inset min-h-[36px] flex-none px-3 font-mono text-[10.5px] font-black tracking-[0.06em]"
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </Group>

        <Group title="Data & security">
          <RowButton
            icon={<Download className="h-4 w-4" />}
            label="Export data"
            value="JSON"
            onClick={download}
          />
          <RowLink to="/partners" icon={<Info className="h-4 w-4" />} label="About FlowBridge" />
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-danger/10"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
                <LogOut className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-black text-danger">
                Log out
              </span>
            </button>
          )}
        </Group>

        <p className="px-1 pb-1 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-soft">
          FlowBridge · BOT Chain Mainnet
        </p>
      </main>

      <BottomNav />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="fb-eyebrow mb-2 px-1">{title}</p>
      <div className="fb-surface divide-y divide-hairline overflow-hidden">{children}</div>
    </section>
  );
}

function RowLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-foreground/5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-black">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

function RowButton({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-black">{label}</span>
      {value && (
        <span className="shrink-0 font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-muted">
          {value}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="min-w-0 truncate font-mono text-[11.5px] text-foreground">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-primary/50 bg-primary/25" : "border-hairline bg-foreground/10"
        }`}
      >
        <span
          className={`absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all ${
            checked ? "left-[18px] bg-primary" : "left-[2px] bg-muted"
          }`}
        />
      </span>
    </button>
  );
}
