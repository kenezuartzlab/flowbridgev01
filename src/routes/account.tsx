import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Coins,
  Download,
  Gift,
  Globe,
  Info,
  LogOut,
  MessageSquare,
  Moon,
  Pencil,
  QrCode,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MetricStrip, StatusPill } from "@/components/ui-kit/primitives";
import { getPage, pageLabel, useAppConfig } from "@/lib/config/appConfig";

import { SignInButton } from "@/components/auth/SignInButton";
import { ProfileEditModal } from "@/components/account/ProfileEditModal";
import { useTheme } from "@/lib/theme";
import { useAccountData } from "@/lib/app/useAccountData";
import { logout } from "@/lib/auth";
import { readPlayState } from "@/lib/games/playState";
import { usePrefs } from "@/lib/prefs";
import { GREETING_STYLES, greetingVariants, type GreetingStyleId } from "@/lib/greetings";


export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Profile & Settings | FlowBridge" },
      {
        name: "description",
        content:
          "Manage your FlowBridge profile: FLOW Points (PTS), appearance, notifications, display currency, language, data export and sign-out — all in one place.",
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

function AccountPage() {
  const { user, authReady, incentives, transactions } = useAccountData();
  const [theme, setTheme] = useTheme();
  const [prefs, savePrefs] = usePrefs();
  const [open, setOpen] = useState<string | null>(null);
  const [play, setPlay] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setPlay(readPlayState().points);
  }, []);

  const toggleTheme = () => setTheme();

  const flow = Number(incentives?.flowPoints ?? 0);
  const config = useAppConfig();
  const page = getPage(config, "account");
  const L = (slot: string, fallback: string) => pageLabel(config, "account", slot, fallback);
  const displayName = user?.displayName || user?.name || user?.email?.split("@")[0] || "Guest";
  const initial = displayName.slice(0, 1).toUpperCase();
  const avatar = user?.photoURL || user?.avatar_url || null;
  const verified = Boolean(user && (user.emailVerified || user.email_verified));


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
      <AppTopBar
        eyebrow="Profile"
        title={page.hero.title || displayName}
        avatar={avatar}
        initial={initial}
      />

      <main
        className="mx-auto w-full max-w-2xl space-y-4 px-3 pt-3 sm:px-4 sm:pt-4 md:max-w-3xl md:pt-6"
        style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/*
         * V10.1 — identity is FlowBridge-native: the shared surface tokens plus
         * the primary accent, instead of the isolated purple gradient card that
         * belonged to no other screen.
         */}
        <section className="fb-surface relative overflow-hidden p-4">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative flex items-center gap-3">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-primary/30 object-cover"
              />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/12 text-xl font-black text-primary">
                {initial}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-black leading-tight tracking-[-0.01em]">
                {displayName}
              </p>
              <p className="truncate font-mono text-[10.5px] text-muted">
                {user?.email ?? "Not signed in"}
              </p>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-card px-2.5 py-1.5 text-[11px] font-bold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Pencil className="h-3 w-3" aria-hidden /> Edit
              </button>
            )}
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={verified ? "ok" : "pending"}>
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {verified ? "Verified pass" : "Verification pending"}
            </StatusPill>
            <span className="text-[11.5px] text-muted">
              {verified
                ? "Wallet binding and referral rewards unlocked."
                : user
                  ? "Verify your email from the header banner to unlock referral rewards."
                  : "Sign in and verify your email to unlock referral rewards."}
            </span>
          </div>

          {authReady && !user && (
            <div className="relative mt-3">
              <SignInButton label="Sign in" returnTo="/account" />
            </div>
          )}
        </section>

        {/* Progression — PTS (campaign/off-chain) stays distinct from FLOW. */}
        <MetricStrip
          items={[
            { label: L("flow", "FLOW Points"), value: flow.toLocaleString("en-US") },
            { label: L("play", "Play points"), value: play.toLocaleString("en-US") },
          ]}
        />

        {/*
         * V10.1 — Profile is identity, progression and account-owned utilities.
         * Rows that duplicate global navigation (Activity, Markets, Explore) or
         * inactive surfaces (Social tasks, Games, AI assistant) were removed.
         */}
        <Group title="Wallet & security">
          <RowLink to="/wallet" icon={<QrCode className="h-4 w-4" />} label="Wallet address & QR" />
          <RowButton
            icon={<Download className="h-4 w-4" />}
            label="Export data"
            value="JSON"
            onClick={download}
          />
        </Group>

        <Group title="Earn">
          <RowLink to="/earn" icon={<Gift className="h-4 w-4" />} label="Earn & FLOW Points" />
          <RowLink to="/rewards" icon={<Users className="h-4 w-4" />} label="Referrals & tasks" />
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
            icon={<MessageSquare className="h-4 w-4" />}
            label="Greeting"
            value={
              GREETING_STYLES.find((g) => g.id === prefs.greeting)?.label ?? "Time of day"
            }
            onClick={() => setOpen(open === "greet" ? null : "greet")}
          />
          {open === "greet" && (
            <div className="space-y-2 border-t border-hairline px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {GREETING_STYLES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => savePrefs({ greeting: g.id })}
                    data-active={prefs.greeting === g.id}
                    className="fb-segment fb-inset min-h-[36px] flex-none px-3 font-mono text-[10.5px] font-black tracking-[0.06em]"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-muted">
                e.g. “{greetingVariants((prefs.greeting as GreetingStyleId) || "timeOfDay").join(" · ")}” — tap the greeting on Home to cycle variants.
              </p>
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

        <Group title="Support">
          <RowLink to="/campaigns/partners" icon={<Info className="h-4 w-4" />} label="About FlowBridge" />

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

      {user && (
        <ProfileEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          currentName={user.displayName || ""}
          currentPhoto={avatar}
          providerName={user.providerName ?? null}
          providerPhoto={user.providerPhoto ?? null}
          hasCustom={!!(user.hasCustomPhoto || user.hasCustomName)}
          onSaved={() => window.location.reload()}
        />
      )}

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

function RowLink({ to, icon, label, hash }: { to: string; icon: React.ReactNode; label: string; hash?: string }) {
  return (
    <Link to={to} hash={hash} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-foreground/5">
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
