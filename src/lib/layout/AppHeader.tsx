import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { EnvironmentBadge } from './EnvironmentBadge';
import { WalletPill } from './WalletPill';
import {
  History, Heart, Gift, AlertTriangle, RefreshCw, CheckCircle, Video, Sun, Moon, Menu, X, LogOut,
  ChevronDown, LogIn, CircleUser,
} from 'lucide-react';

import { cn } from '../utils';
import { sendVerification, reloadUser } from '../auth';
import logoUrl from '@/assets/flowbridge-logo.png';
import { FlowPointsPill } from '@/components/rewards/FlowPointsPill';
import { PrimaryNav } from '@/components/shell/PrimaryNav';


const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_KEY = 'fb_resend_verify_until';

interface AppHeaderProps {
  walletAddress?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  isMainnet: boolean;
  onToggleMainnet: () => void;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  isPresentationMode?: boolean;
  onTogglePresentationMode?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onShowHistory?: () => void;
  onDonateClick?: () => void;
  onRewardsClick?: () => void;
  googleUser?: any;
  setGoogleUser?: (user: any) => void;
  /** Active source network label, e.g. "BOT", "BNB", "ETH", "TRON". Drives which wallet pill is primary. */
  activeNetworkLabel?: string;
  /** When TRON is the active source, pass the base58 address so it becomes the primary pill. */
  tronAddress?: string | null;
  /** Called when user clicks Connect on the Tron pill (TRON active + not connected). */
  onConnectTron?: () => void;
  /** Secondary/recipient chip (the counterparty address, shown below the primary pill). */
  recipientAddress?: string | null;
  recipientLabel?: string;
  /** Sign out the current Google/email user. */
  onSignOut?: () => void;
  /** Start Google sign-in for a guest. */
  onSignIn?: () => void;
  /** Referral code the current session was captured under, if any. */
  referralAppliedCode?: string | null;
  /** Read-only incentives payload used to render the FLOW pill. */
  incentives?: any;
  /** True while the incentives payload is still loading. */
  incentivesLoading?: boolean;
}

export function AppHeader({
  walletAddress,
  onConnect,
  onDisconnect,
  isMainnet,
  onToggleMainnet,
  isPresentationMode,
  onTogglePresentationMode,
  theme = 'dark',
  onToggleTheme,
  onShowHistory,
  onDonateClick,
  onRewardsClick,
  googleUser,
  setGoogleUser,
  activeNetworkLabel,
  tronAddress,
  onConnectTron,
  recipientAddress,
  recipientLabel,
  onSignOut,
  onSignIn,
  referralAppliedCode,
  incentives,
  incentivesLoading,
}: AppHeaderProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [roadmapOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();


  const isUserLoggedIn = !!googleUser;
  const isVerified = !!(googleUser?.emailVerified || googleUser?.email_verified || googleUser?.isDemo);
  const isUnverified = isUserLoggedIn && !isVerified;

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RESEND_COOLDOWN_KEY) : null;
    const until = raw ? parseInt(raw, 10) : 0;
    const remain = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (remain > 0) setCooldownSec(remain);
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [cooldownSec]);

  // Close submenu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleResend = async () => {
    if (cooldownSec > 0 || loading) return;
    setLoading(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      await sendVerification();
      const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
      try { window.localStorage.setItem(RESEND_COOLDOWN_KEY, String(until)); } catch {}
      setCooldownSec(RESEND_COOLDOWN_SECONDS);
      setSuccessMsg("Verification sent! Check inbox + spam.");
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      const msg = err?.message || "Failed to resend.";
      if (/rate|too many|seconds/i.test(msg)) {
        setCooldownSec(RESEND_COOLDOWN_SECONDS);
        try { window.localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)); } catch {}
      }
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    } finally { setLoading(false); }
  };

  const handleRefresh = async () => {
    setLoading(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      const refreshedUser = await reloadUser();
      if (refreshedUser) {
        setGoogleUser?.(refreshedUser);
        if (refreshedUser.emailVerified) {
          setSuccessMsg("Verified!");
          setTimeout(() => setSuccessMsg(null), 6000);
        } else {
          setErrorMsg("Still unverified.");
          setTimeout(() => setErrorMsg(null), 6000);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to refresh.");
      setTimeout(() => setErrorMsg(null), 6000);
    } finally { setLoading(false); }
  };

  type MenuItem = {
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    accent?: boolean;
    show: boolean;
    /** Nested links (rendered indented under the parent). */
    children?: { id: string; label: string; onClick: () => void }[];
  };
  type MenuSection = { id: string; title: string; items: MenuItem[] };

  const go = (to: string) => () => { navigate({ to }); setMenuOpen(false); };

  const sections: MenuSection[] = [
    {
      id: 'explore',
      title: 'Trade',
      items: [
        {
          id: 'rewards',
          label: 'FLOW Portal',
          icon: <Gift className="w-4 h-4" />,
          onClick: () => { onRewardsClick?.(); setMenuOpen(false); },
          accent: true,
          show: !!onRewardsClick,
        },
        {
          id: 'history',
          label: 'History',
          icon: <History className="w-4 h-4" />,
          onClick: () => { onShowHistory?.(); setMenuOpen(false); },
          show: !!(walletAddress && onShowHistory),
        },
        {
          id: 'donate',
          label: 'Support',
          icon: <Heart className="w-4 h-4 fill-primary/20 text-primary/80" />,
          onClick: () => { onDonateClick?.(); setMenuOpen(false); },
          show: !!onDonateClick,
        },
        {
          id: 'account',
          label: 'Settings & more',
          icon: <CircleUser className="w-4 h-4" />,
          onClick: go('/account'),
          show: true,
        },
      ],
    },

    {
      id: 'preferences',
      title: 'Preferences',
      items: [
        {
          id: 'theme',
          label: theme === 'light' ? 'Dark mode' : 'Light mode',
          icon: theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />,
          onClick: () => { onToggleTheme?.(); setMenuOpen(false); },
          show: !!onToggleTheme,
        },
        {
          id: 'demo',
          label: isPresentationMode ? 'Exit demo mode' : 'Demo mode',
          icon: <Video className="w-4 h-4" />,
          onClick: () => { onTogglePresentationMode?.(); setMenuOpen(false); },
          show: !!onTogglePresentationMode,
        },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      items: [
        {
          id: 'signin',
          label: 'Sign in',
          icon: <LogIn className="w-4 h-4" />,
          onClick: () => { onSignIn?.(); setMenuOpen(false); },
          show: !!(onSignIn && !isUserLoggedIn),
        },
        {
          id: 'signout',
          label: 'Sign out',
          icon: <LogOut className="w-4 h-4" />,
          onClick: () => { onSignOut?.(); setMenuOpen(false); },
          show: !!(onSignOut && isUserLoggedIn),
        },
      ],
    },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length > 0);


  return (
    <header className="presentation-exempt flex flex-col border-b border-hairline bg-background relative z-20 w-full font-mono">
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4 min-w-0">
        {/* Brand */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoUrl} alt="" className="w-6 h-6 rounded-md shrink-0" draggable={false} />
            <h1 className="text-sm font-black tracking-widest text-foreground uppercase leading-none truncate">
              FlowBridge<span className="text-primary">.</span>
              <span className="sr-only"> — Cross-Chain Bridge &amp; Swap for BOT Chain</span>
            </h1>

          </div>
          <div className="flex items-center gap-2 mt-2 min-w-0">
            <button
              onClick={onToggleMainnet}
              title="Click to toggle Testnet / Mainnet"
              className="transition-transform hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            >
              <EnvironmentBadge isMainnet={isMainnet} />
            </button>
            <FlowPointsPill googleUser={googleUser} incentives={incentives} loading={incentivesLoading} />
          </div>
        </div>

        {/* V9 — one authoritative desktop navigation, shared with every other route */}
        <PrimaryNav className="shrink-0" />

        {/* Actions: wallet + one menu button */}
        <div className="flex items-center gap-1.5 shrink-0">

          {activeNetworkLabel === 'TRON' ? (
            <WalletPill
              address={tronAddress || null}
              onConnect={onConnectTron}
              onDisconnect={undefined}
            />
          ) : (
            <WalletPill
              address={walletAddress}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          )}

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Open menu"
              title="Menu"
              className={cn(
                "p-2 border rounded-xl cursor-pointer transition-all shadow-sm active:scale-95",
                menuOpen
                  ? "bg-primary/15 border-primary/50 text-primary"
                  : "bg-card border-hairline text-muted hover:text-primary hover:border-primary/30 hover:bg-white/5"
              )}
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="animate-menu-in absolute right-0 mt-2 w-56 bg-card/95 backdrop-blur-xl border border-hairline rounded-xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.75)] overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-hairline">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-muted-soft font-black">
                    Menu
                  </p>
                </div>
                <div className="py-1 max-h-[70vh] overflow-y-auto">
                  {sections.map((section, si) => (
                    <div key={section.id} className={si > 0 ? "border-t border-hairline mt-1 pt-1" : ""}>
                      <p className="px-3 pt-1.5 pb-1 text-[9px] tracking-[0.22em] uppercase text-muted-soft font-black">
                        {section.title}
                      </p>
                      <ul>
                        {section.items.map((item) => (
                          <li key={item.id}>
                            <button
                              role="menuitem"
                              onClick={item.onClick}
                              aria-expanded={item.children ? roadmapOpen : undefined}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 text-left text-[13px] tracking-wide transition-colors cursor-pointer",
                                item.accent
                                  ? "text-primary hover:bg-primary/10"
                                  : "text-foreground hover:bg-white/5 hover:text-primary"
                              )}
                            >
                              <span className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center border shrink-0",
                                item.accent
                                  ? "bg-primary/10 border-primary/30"
                                  : "bg-white/5 border-hairline"
                              )}>
                                {item.icon}
                              </span>
                              <span className="font-semibold truncate flex-1">{item.label}</span>
                              {item.children && (
                                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", roadmapOpen && "rotate-180")} />
                              )}
                            </button>
                            {item.children && roadmapOpen && (
                              <ul className="pb-1">
                                {item.children.map((child) => (
                                  <li key={child.id}>
                                    <button
                                      role="menuitem"
                                      onClick={child.onClick}
                                      className="w-full flex items-center gap-2 pl-[52px] pr-3 py-2 text-left text-[12px] text-muted hover:text-primary hover:bg-white/5 transition-colors cursor-pointer"
                                    >
                                      <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                                      <span className="font-semibold truncate">{child.label}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {recipientAddress && (
        <div className="flex items-center justify-end gap-2 px-3 sm:px-4 pb-2 -mt-1">
          <div className="flex items-center gap-1.5 bg-card/60 border border-hairline rounded-lg px-2 py-1">
            <span className="text-[9px] tracking-[0.2em] uppercase text-muted-soft font-black">
              {recipientLabel || 'Recipient'}
            </span>
            <span className="text-[11px] font-mono font-bold text-foreground/85">
              {`${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`}
            </span>
          </div>
        </div>
      )}

      {referralAppliedCode && !googleUser && (
        <div className="flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 bg-primary/10 border-t border-primary/25 text-primary text-[11px] font-mono font-bold tracking-wider">
          <Gift className="w-3 h-3" />
          <span>Referral applied: <span className="text-foreground">{referralAppliedCode}</span> — sign in to earn +50 FLOW for you & referrer.</span>
        </div>
      )}

      {isUnverified && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-950/20 border-t border-amber-500/10 text-amber-200 text-[12px] font-mono select-none">
          <div className="flex items-center gap-2 text-left min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
            <span className="leading-tight truncate pr-1">
              {successMsg ? (
                <span className="text-primary font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-primary" /> {successMsg}
                </span>
              ) : errorMsg ? (
                <span className="text-red-400 font-bold">{errorMsg}</span>
              ) : (
                <>Email unverified! Verify <span className="text-foreground font-bold">{googleUser.email}</span></>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleResend}
              disabled={loading || cooldownSec > 0}
              title={cooldownSec > 0 ? `Wait ${cooldownSec}s before resending` : 'Resend verification email'}
              className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 hover:text-foreground rounded text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px]"
            >
              {cooldownSec > 0 ? `${cooldownSec}s` : 'Resend'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh verification status"
              className="p-1 hover:bg-white/5 border border-hairline hover:border-white/20 text-muted hover:text-foreground rounded transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-2.5 h-2.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
