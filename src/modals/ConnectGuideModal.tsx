import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ShieldCheck, Mail, Wallet, ArrowRight, CheckCircle2, Sparkles, Lock, ChevronDown, ExternalLink, KeyRound } from 'lucide-react';
import { useAccount, useSignMessage, useChainId, useSwitchChain } from 'wagmi';
import { signInWithEthereum } from '@/lib/siwe';
import { emailSignIn, emailSignUp, getIdToken, reloadUser, requestPasswordReset, type AppUser } from '@/lib/auth';
import { isInAppBrowser, inAppBrowserName } from '@/lib/in-app-browser';
import { getWalletSignatureErrorMessage, isWalletVerified, signMessageWithActiveWallet } from '@/lib/walletVerification';
import { botMainnet } from '@/lib/wagmi';

interface ConnectGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  googleUser: any;
  isAuthLoading: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSandboxSignIn?: () => void; // kept for compat, no longer rendered
  isWalletConnected: boolean;
  onConnectWallet: () => void;
  onLinked?: (user: AppUser | null) => void;
}

export function ConnectGuideModal({
  isOpen,
  onClose,
  googleUser,
  isAuthLoading,
  onGoogleSignIn,
  isWalletConnected,
  onConnectWallet,
  onLinked,
}: ConnectGuideModalProps) {
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const inApp = useMemo(() => isInAppBrowser(), []);
  const inAppName = useMemo(() => inAppBrowserName(), []);
  const { address: connectedAddress } = useAccount();
  const activeChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [siweBusy, setSiweBusy] = useState(false);
  const siweRequestId = useRef(0);

  // If the user switches wallets (or disconnects) mid-signature, wagmi's
  // in-flight signMessage promise can hang against the previous connector.
  // Clear busy state so the button re-enables and the user can retry.
  useEffect(() => {
    siweRequestId.current += 1;
    setSiweBusy(false);
    setErr(null);
  }, [connectedAddress]);

  // Full SIWE state reset every time the modal opens. Prevents "stuck" busy
  // state from a previous session/attempt from carrying over — the button
  // must always start fresh and clickable when the user reopens the modal.
  useEffect(() => {
    if (!isOpen) return;
    siweRequestId.current += 1;
    setSiweBusy(false);
    setErr(null);
    setMsg(null);
    setBusy(false);
  }, [isOpen]);

  const bindVerifiedWalletToSignedInUser = async () => {
    if (!connectedAddress || !isWalletVerified(connectedAddress)) return false;

    const token = await getIdToken();
    if (!token) return false;

    await fetch('/api/users/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }).catch(() => null);

    const res = await fetch('/api/users/bind-wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ walletAddress: connectedAddress }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Signed in, but the wallet link was not saved. Open Rewards, then bind wallet.');
    }
    return true;
  };

  const handleSiwe = async () => {
    if (!connectedAddress) return;
    if (siweBusy) {
      siweRequestId.current += 1;
      setSiweBusy(false);
      setErr('Signature request cancelled. Tap “Sign in with wallet” to request a fresh signature.');
      return;
    }
    const requestId = siweRequestId.current + 1;
    siweRequestId.current = requestId;
    setErr(null); setMsg(null); setSiweBusy(true);
    try {
      // Pre-flight: confirm the injected wallet still exposes the connected
      // address. Watch-only or switched wallets fail here with a clear message.
      if (typeof window !== 'undefined') {
        const eth = (window as any).ethereum;
        if (eth?.request) {
          try {
            const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
            const active = (accounts?.[0] || '').toLowerCase();
            if (active && active !== connectedAddress.toLowerCase()) {
              throw new Error(`Your wallet is now on ${active.slice(0,6)}…${active.slice(-4)} but FlowBridge is connected to ${connectedAddress.slice(0,6)}…${connectedAddress.slice(-4)}. Reconnect the matching wallet, then retry.`);
            }
          } catch (probeErr: any) {
            if (probeErr?.message?.includes('FlowBridge is connected')) throw probeErr;
            // ignore other probe failures; some in-app wallets block eth_accounts
          }
        }
      }

      // Auto-recover chain: SIWE binds the signature to BOT Chain (677).
      // If the wallet is on the wrong network, try switching first.
      let expectedChainId = botMainnet.id;
      if (activeChainId !== expectedChainId) {
        try {
          await switchChainAsync({ chainId: expectedChainId });
        } catch {
          throw new Error(`Switch your wallet to BOT Chain (id ${expectedChainId}) and try signing again.`);
        }
      }

      const signWithTimeout = (m: string) =>
        signMessageWithActiveWallet(connectedAddress, m, signMessageAsync as any);
      const result = await signInWithEthereum({
        address: connectedAddress,
        chainId: expectedChainId,
        signMessage: signWithTimeout,
      });
      if (siweRequestId.current !== requestId) return;
      if (result.status === 'signed_in') {
        const user = await reloadUser();
        setMsg(`Signed in as ${result.email}.`);
        onLinked?.(user);
      } else {
        const linkedNow = await bindVerifiedWalletToSignedInUser();
        if (linkedNow) {
          setMsg('Wallet verified and linked to your signed-in email.');
          onLinked?.(await reloadUser());
        } else {
          setMsg('Wallet verified, but no email is linked yet. Sign in once with email below to bind this wallet.');
          setShowEmail(true);
        }
      }
    } catch (e: any) {
      if (siweRequestId.current !== requestId) return;
      if (e?.name === 'WalletVerificationRejectedError') {
        setErr(getWalletSignatureErrorMessage(e));
      } else {
        const { toFriendlyError } = await import('@/lib/friendlyError');
        setErr(toFriendlyError(e, { action: 'sign-in' }));
      }
    } finally {
      if (siweRequestId.current === requestId) setSiweBusy(false);
    }
  };

  if (!isOpen) return null;

  const copyUrlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMsg('Link copied — paste it into Chrome or Safari to use Google sign-in.');
    } catch {
      setErr('Copy failed. Long-press the address bar to copy the URL.');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      if (mode === 'signin') {
        const user = await emailSignIn(email.trim(), password);
        const linkedNow = await bindVerifiedWalletToSignedInUser();
        setMsg(linkedNow ? 'Signed in and wallet linked.' : 'Signed in. Tap “Sign in with wallet” once to prove and link this wallet.');
        if (linkedNow) onLinked?.(user);
      } else if (mode === 'signup') {
        const user = await emailSignUp(email.trim(), password, name.trim() || email.split('@')[0]);
        const linkedNow = await bindVerifiedWalletToSignedInUser();
        setMsg(linkedNow ? 'Account created and wallet linked. Check your inbox to verify your email.' : 'Check your inbox to verify your email. Then sign in to link this wallet.');
        if (linkedNow) onLinked?.(user);
      } else {
        await requestPasswordReset(email.trim());
        setMsg('Reset link sent. Check your inbox.');
      }
    } catch (e: any) {
      const { toFriendlyError } = await import('@/lib/friendlyError');
      setErr(toFriendlyError(e, { action: mode === 'signup' ? 'sign up' : mode === 'forgot' ? 'send reset link' : 'sign in' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/90 backdrop-blur-md animate-fade-in font-sans">
      <div
        id="connect_guide_modal"
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[370px] p-6 shadow-2xl relative flex flex-col gap-5 animate-scale-up border-b-[5px] border-b-[#32FF8B] max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-white/5 font-mono">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#32FF8B]/10 text-[#32FF8B] rounded-lg">
              <ShieldCheck className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Connect to Bridge</h3>
              <p className="text-[11px] text-[#00D7B2] font-semibold leading-none mt-1 uppercase tracking-widest font-mono">
                Wallet First · Sign-in Optional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Intro */}
        <p className="text-sm text-[#C5C1B9] leading-relaxed">
          Just connect your wallet to start bridging — transactions are recorded automatically against your wallet address. Sign in only if you want to earn <span className="text-[#32FF8B] font-semibold">FlowPoints</span> and referrals.
        </p>

        <div className="flex flex-col gap-4">
          {/* Step 1: Wallet (required) */}
          <div
            className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
              isWalletConnected ? 'bg-[#32FF8B]/5 border-[#32FF8B]/25' : 'bg-[#010C1B]/40 border-white/5'
            }`}
          >
            <div className="flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                    isWalletConnected ? 'bg-[#32FF8B] text-[#010C1B]' : 'bg-white/10 text-[#C5C1B9]'
                  }`}
                >
                  {isWalletConnected ? <CheckCircle2 className="w-3.5 h-3.5 font-bold" /> : '1'}
                </span>
                <span className="text-[13px] font-black tracking-wider uppercase text-white">Web3 Wallet</span>
                <span className="text-[10px] font-black tracking-widest text-[#32FF8B] bg-[#32FF8B]/10 px-1.5 py-0.5 rounded uppercase font-mono border border-[#32FF8B]/25">
                  Required
                </span>
              </div>
              {isWalletConnected && (
                <span className="text-[10px] font-black tracking-widest text-[#32FF8B] bg-[#32FF8B]/10 px-2 py-0.5 rounded uppercase font-mono border border-[#32FF8B]/25">
                  Connected
                </span>
              )}
            </div>

            {isWalletConnected ? (
              <div className="flex items-center gap-2 px-1 text-sm font-mono">
                <div className="p-1 bg-[#010C1B] rounded-lg border border-white/5 text-[#32FF8B] shrink-0">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[#C5C1B9] text-[12px]">Wallet address is your unique identity here.</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  onConnectWallet();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black py-2.5 px-3 rounded-xl text-[12px] uppercase transition duration-150 shadow-md active:scale-95 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect Web3 Wallet
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="flex justify-center -my-2.5">
            <div className="p-1 bg-[#010C1B] border border-white/5 rounded-full shadow-lg text-[#C5C1B9]">
              <ArrowRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>

          {/* Step 2: Sign in (optional, perks only) */}
          <div
            className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
              googleUser ? 'bg-[#32FF8B]/5 border-[#32FF8B]/25' : 'bg-[#010C1B]/40 border-white/5'
            }`}
          >
            <div className="flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                    googleUser ? 'bg-[#32FF8B] text-[#010C1B]' : 'bg-white/10 text-[#C5C1B9]'
                  }`}
                >
                  {googleUser ? <CheckCircle2 className="w-3.5 h-3.5 font-bold" /> : '2'}
                </span>
                <span className="text-[13px] font-black tracking-wider uppercase text-white">Sign-in</span>
                <span className="text-[10px] font-black tracking-widest text-[#00D7B2] bg-[#00D7B2]/10 px-1.5 py-0.5 rounded uppercase font-mono border border-[#00D7B2]/25">
                  Optional
                </span>
              </div>
              {googleUser && (
                <span className="text-[10px] font-black tracking-widest text-[#32FF8B] bg-[#32FF8B]/10 px-2 py-0.5 rounded uppercase font-mono border border-[#32FF8B]/25">
                  Linked
                </span>
              )}
            </div>

            <p className="text-[12px] text-[#C5C1B9]/80 leading-snug px-0.5 flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 text-[#32FF8B] shrink-0 mt-0.5" />
              <span>Only needed to earn FlowPoints, climb the leaderboard, and unlock referral rewards. Bridges work without it.</span>
            </p>

            {googleUser ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1 text-sm font-mono">
                  <div className="p-1 bg-[#010C1B] rounded-lg border border-white/5 text-[#32FF8B] shrink-0">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[#C5C1B9] font-medium truncate text-[12px] block" title={googleUser.email}>
                    {googleUser.email}
                  </span>
                </div>
                {isWalletConnected && connectedAddress && !isWalletVerified(connectedAddress) && (
                  <button
                    onClick={handleSiwe}
                    className="w-full flex items-center justify-center gap-2 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black py-2.5 px-3 rounded-xl text-[12px] uppercase transition duration-150 shadow-md active:scale-95 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {siweBusy ? 'Cancel / retry signing' : 'Sign wallet to link email'}
                  </button>
                )}
              </div>
            ) : (
              <>
                {isWalletConnected && connectedAddress && (
                  <button
                    onClick={handleSiwe}
                    className="w-full flex items-center justify-center gap-2 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black py-2.5 px-3 rounded-xl text-[12px] uppercase transition duration-150 shadow-md active:scale-95 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {siweBusy ? 'Cancel / retry signing' : 'Sign in with wallet'}
                  </button>
                )}
                {isWalletConnected && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#C5C1B9]/70 font-mono uppercase tracking-widest">
                    <span className="h-px flex-1 bg-white/5" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-white/5" />
                  </div>
                )}
                {inApp ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 flex flex-col gap-2">
                    <p className="text-[12px] text-amber-200/90 leading-snug">
                      Google sign-in is blocked inside{inAppName ? ` ${inAppName}` : ' in-app wallet browsers'} (Google's "Use secure browsers" policy). Use email below, or open this page in Chrome/Safari.
                    </p>
                    <button
                      type="button"
                      onClick={copyUrlToClipboard}
                      className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-amber-100 text-[12px] font-mono uppercase tracking-widest font-black py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Copy link for Chrome/Safari
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onGoogleSignIn}
                    disabled={isAuthLoading}
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 hover:text-slate-950 font-bold py-2.5 px-3 rounded-xl text-sm transition duration-150 shadow-sm disabled:opacity-50 cursor-pointer text-center"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52s.01 0 0 0z" />
                    </svg>
                    Continue with Google
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setShowEmail(!showEmail); setErr(null); setMsg(null); }}
                  className="w-full flex items-center justify-center gap-1.5 text-[12px] font-mono uppercase tracking-widest text-[#C5C1B9] hover:text-white py-1.5 transition-colors cursor-pointer"
                >
                  <Mail className="w-3 h-3" />
                  <span>Or use email</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showEmail ? 'rotate-180' : ''}`} />
                </button>

                {showEmail && (
                  <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2 pt-1 border-t border-white/5">
                    <div className="flex gap-1 text-[11px] font-mono uppercase tracking-widest">
                      {(['signin', 'signup', 'forgot'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setMode(m); setErr(null); setMsg(null); }}
                          className={`flex-1 py-1 rounded font-black transition-all cursor-pointer ${
                            mode === m
                              ? 'bg-[#32FF8B]/15 text-[#32FF8B] border border-[#32FF8B]/30'
                              : 'text-[#C5C1B9] hover:text-white border border-transparent'
                          }`}
                        >
                          {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Sign up' : 'Forgot'}
                        </button>
                      ))}
                    </div>

                    {mode === 'signup' && (
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Display name (optional)"
                        className="bg-[#010C1B] border border-white/10 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-[#32FF8B]/50"
                      />
                    )}
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="bg-[#010C1B] border border-white/10 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-[#32FF8B]/50"
                    />
                    {mode !== 'forgot' && (
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C5C1B9]" />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'signup' ? 'Password (min 8 chars)' : 'Password'}
                          className="w-full bg-[#010C1B] border border-white/10 rounded-lg pl-7 pr-2.5 py-2 text-sm focus:outline-none focus:border-[#32FF8B]/50"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono font-black uppercase tracking-widest text-[12px] py-2 rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {busy
                        ? 'Working…'
                        : mode === 'signin'
                          ? 'Sign in'
                          : mode === 'signup'
                            ? 'Create account'
                            : 'Send reset link'}
                    </button>

                    {msg && <p className="text-[12px] text-[#32FF8B] font-mono">{msg}</p>}
                    {err && <p className="text-[12px] text-red-400 font-mono">{err}</p>}
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/5 text-center text-[11px] text-[#C5C1B9]/60 leading-normal font-mono uppercase tracking-widest">
          Your wallet address is your account. Email link is optional.
        </div>
      </div>
    </div>
  );
}
