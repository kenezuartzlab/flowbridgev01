import React, { useEffect, useRef, useState } from 'react';
import { EnvironmentBadge } from './EnvironmentBadge';
import { WalletPill } from './WalletPill';
import { History, Heart, Gift, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { cn } from '../utils';
import { sendVerification, reloadUser } from '../auth';

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
  onShowHistory?: () => void;
  onDonateClick?: () => void;
  onRewardsClick?: () => void;
  googleUser?: any;
  setGoogleUser?: (user: any) => void;
}

export function AppHeader({ 
  walletAddress, 
  onConnect, 
  onDisconnect, 
  isMainnet,
  onToggleMainnet,
  isDemoMode,
  onToggleDemoMode,
  onShowHistory,
  onDonateClick,
  onRewardsClick,
  googleUser,
  setGoogleUser
 }: AppHeaderProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
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

  const handleResend = async () => {
    if (cooldownSec > 0 || loading) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await sendVerification();
      const until = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
      try { window.localStorage.setItem(RESEND_COOLDOWN_KEY, String(until)); } catch {}
      setCooldownSec(RESEND_COOLDOWN_SECONDS);
      setSuccessMsg("Verification sent! Check inbox + spam.");
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      const msg = err?.message || "Failed to resend.";
      // Surface Supabase rate-limit hint clearly
      if (/rate|too many|seconds/i.test(msg)) {
        setCooldownSec(RESEND_COOLDOWN_SECONDS);
        try {
          window.localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + RESEND_COOLDOWN_SECONDS * 1000));
        } catch {}
      }
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 6000);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const refreshedUser = await reloadUser();
      if (refreshedUser) {
        if (setGoogleUser) {
          setGoogleUser(refreshedUser);
        }
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="flex flex-col border-b border-white/10 bg-[#010C1B] relative z-10 w-full font-mono">
      <div className="flex items-center justify-between p-4">
        <div className="flex flex-col">
          <h1 className="text-sm font-black tracking-widest text-white uppercase leading-none">
            FlowBridge<span className="text-[#32FF8B]">.</span>
          </h1>
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
        
        <div className="flex items-center gap-1.5">
          {onRewardsClick && (
            <button
              onClick={onRewardsClick}
              title="Claim off-chain FLOW rewards & Referral points"
              className="p-1.5 sm:p-2 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 border border-[#32FF8B]/30 hover:border-[#32FF8B]/50 active:scale-95 text-[#32FF8B] hover:text-[#1FFF7D] transition-all rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5 px-2 sm:px-3 text-[9px] font-black tracking-widest uppercase"
            >
              <Gift className="w-3.5 h-3.5" />
              <span className="hidden xs:inline text-[#32FF8B]">REWARDS</span>
            </button>
          )}
          {onDonateClick && (
            <button
              onClick={onDonateClick}
              title="Donate to support FlowBridge volunteer builders"
              className="p-1.5 sm:p-2 bg-[#0D1C2A] border border-white/10 hover:border-[#32FF8B]/30 hover:bg-white/5 active:scale-95 text-[#C5C1B9] hover:text-[#32FF8B] transition-all rounded-xl cursor-pointer shadow-sm flex items-center gap-1 px-2.5 sm:px-3 text-[10px] font-bold"
            >
              <Heart className="w-3.5 h-3.5 fill-[#32FF8B]/20 text-[#32FF8B]/80" />
              <span className="hidden xs:inline text-rose-100 tracking-wider">Support</span>
            </button>
          )}
          {walletAddress && onShowHistory && (
            <button
              onClick={onShowHistory}
              title="View cloud transaction ledger"
              className="p-2 bg-[#0D1C2A] border border-white/10 hover:bg-white/5 active:scale-95 text-[#C5C1B9] hover:text-[#32FF8B] transition-all rounded-xl cursor-pointer shadow-sm animate-fade-in"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}
          <WalletPill 
            address={walletAddress} 
            onConnect={onConnect} 
            onDisconnect={onDisconnect} 
          />
        </div>
      </div>

      {isUnverified && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-950/20 border-t border-amber-500/10 text-amber-200 text-[10px] font-mono select-none">
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
              disabled={loading}
              className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              Resend
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
