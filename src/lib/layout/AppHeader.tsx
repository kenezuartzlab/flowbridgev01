import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { EnvironmentBadge } from './EnvironmentBadge';
import { WalletPill } from './WalletPill';
import {
  History, Heart, Gift, AlertTriangle, RefreshCw, CheckCircle, Video, Sun, Moon, Menu, X, LogOut,
  BarChart3, Sparkles, Rocket, Gamepad2,
} from 'lucide-react';
import { cn } from '../utils';
import { sendVerification, reloadUser } from '../auth';
import logoUrl from '@/assets/flowbridge-logo.png';


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
  /** Referral code the current session was captured under, if any. */
  referralAppliedCode?: string | null;
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
  referralAppliedCode,
}: AppHeaderProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  };
  const menuItems: MenuItem[] = [
    {
      id: 'rewards',
      label: 'Rewards',
      icon: <Gift className="w-4 h-4" />,
      onClick: () => { onRewardsClick?.(); setMenuOpen(false); },
      accent: true,
      show: !!onRewardsClick,
    },
    {
      id: 'donate',
      label: 'Support',
      icon: <Heart className="w-4 h-4 fill-[#32FF8B]/20 text-[#32FF8B]/80" />,
      onClick: () => { onDonateClick?.(); setMenuOpen(false); },
      show: !!onDonateClick,
    },
    {
      id: 'history',
      label: 'History',
      icon: <History className="w-4 h-4" />,
      onClick: () => { onShowHistory?.(); setMenuOpen(false); },
      show: !!(walletAddress && onShowHistory),
    },
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
    {
      id: 'signout',
      label: 'Sign out',
      icon: <LogOut className="w-4 h-4" />,
      onClick: () => { onSignOut?.(); setMenuOpen(false); },
      show: !!(onSignOut && isUserLoggedIn),
    },
  ].filter(m => m.show);

  return (
    <header className="presentation-exempt flex flex-col border-b border-white/10 bg-[#010C1B] relative z-20 w-full font-mono">
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4 min-w-0">
        {/* Brand */}
        <div className="flex flex-col min-w-0 shrink">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoUrl} alt="" className="w-6 h-6 rounded-md shrink-0" draggable={false} />
            <h1 className="text-sm font-black tracking-widest text-white uppercase leading-none truncate">
              FlowBridge<span className="text-[#32FF8B]">.</span>
            </h1>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={onToggleMainnet}
              title="Click to toggle Testnet / Mainnet"
              className="transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              <EnvironmentBadge isMainnet={isMainnet} />
            </button>
          </div>
        </div>

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
                  ? "bg-[#32FF8B]/15 border-[#32FF8B]/50 text-[#32FF8B]"
                  : "bg-[#0D1C2A] border-white/10 text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/30 hover:bg-white/5"
              )}
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="animate-menu-in absolute right-0 mt-2 w-56 bg-[#0D1C2A]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.75)] overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-white/5">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-[#C5C1B9]/70 font-black">
                    Menu
                  </p>
                </div>
                <ul className="py-1">
                  {menuItems.map((item) => (
                    <li key={item.id}>
                      <button
                        role="menuitem"
                        onClick={item.onClick}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left text-[13px] tracking-wide transition-colors cursor-pointer",
                          item.accent
                            ? "text-[#32FF8B] hover:bg-[#32FF8B]/10"
                            : "text-[#F0F7F3] hover:bg-white/5 hover:text-[#32FF8B]"
                        )}
                      >
                        <span className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center border shrink-0",
                          item.accent
                            ? "bg-[#32FF8B]/10 border-[#32FF8B]/30"
                            : "bg-white/5 border-white/10"
                        )}>
                          {item.icon}
                        </span>
                        <span className="font-semibold truncate">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {recipientAddress && (
        <div className="flex items-center justify-end gap-2 px-3 sm:px-4 pb-2 -mt-1">
          <div className="flex items-center gap-1.5 bg-[#0D1C2A]/60 border border-white/5 rounded-lg px-2 py-1">
            <span className="text-[9px] tracking-[0.2em] uppercase text-[#C5C1B9]/60 font-black">
              {recipientLabel || 'Recipient'}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#F0F7F3]/85">
              {`${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}`}
            </span>
          </div>
        </div>
      )}

      {referralAppliedCode && !googleUser && (
        <div className="flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 bg-[#32FF8B]/8 border-t border-[#32FF8B]/20 text-[#32FF8B] text-[11px] font-mono font-bold tracking-wider">
          <Gift className="w-3 h-3" />
          <span>Referral applied: <span className="text-white">{referralAppliedCode}</span> — sign in to earn +50 FLOW for you & referrer.</span>
        </div>
      )}

      {isUnverified && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-950/20 border-t border-amber-500/10 text-amber-200 text-[12px] font-mono select-none">
          <div className="flex items-center gap-2 text-left min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
            <span className="leading-tight truncate pr-1">
              {successMsg ? (
                <span className="text-[#32FF8B] font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-[#32FF8B]" /> {successMsg}
                </span>
              ) : errorMsg ? (
                <span className="text-red-400 font-bold">{errorMsg}</span>
              ) : (
                <>Email unverified! Verify <span className="text-white font-bold">{googleUser.email}</span></>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleResend}
              disabled={loading || cooldownSec > 0}
              title={cooldownSec > 0 ? `Wait ${cooldownSec}s before resending` : 'Resend verification email'}
              className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 hover:text-white rounded text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px]"
            >
              {cooldownSec > 0 ? `${cooldownSec}s` : 'Resend'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh verification status"
              className="p-1 hover:bg-white/5 border border-white/10 hover:border-white/20 text-[#C5C1B9] hover:text-white rounded transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-2.5 h-2.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
