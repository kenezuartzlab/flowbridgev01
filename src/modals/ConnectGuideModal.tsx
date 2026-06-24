import { X, ShieldCheck, Mail, Wallet, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ConnectGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  googleUser: any;
  isAuthLoading: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSandboxSignIn?: () => void;
  isWalletConnected: boolean;
  onConnectWallet: () => void;
}

export function ConnectGuideModal({
  isOpen,
  onClose,
  googleUser,
  isAuthLoading,
  onGoogleSignIn,
  onSandboxSignIn,
  isWalletConnected,
  onConnectWallet
}: ConnectGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/90 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="connect_guide_modal"
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[370px] p-6 shadow-2xl relative flex flex-col gap-5 animate-scale-up border-b-[5px] border-b-[#32FF8B]"
      >
        {/* Header container */}
        <div className="flex justify-between items-center pb-3 border-b border-white/5 font-mono">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#32FF8B]/10 text-[#32FF8B] rounded-lg">
              <ShieldCheck className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Secure Auth Setup</h3>
              <p className="text-[9px] text-[#00D7B2] font-semibold leading-none mt-1 uppercase tracking-widest font-mono">2-Step Process</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guided Steps Explanation */}
        <p className="text-xs text-[#C5C1B9] leading-relaxed">
          To log bridges securely to the PostgreSQL ledger database, please **Sign In with Google first**, then **Connect your Web3 Wallet**.
        </p>

        {/* Step List */}
        <div className="flex flex-col gap-4">
          
          {/* Step 1: Google login */}
          <div className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
            googleUser 
              ? 'bg-[#32FF8B]/5 border-[#32FF8B]/25' 
              : 'bg-[#010C1B]/40 border-white/5'
          }`}>
            <div className="flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                  googleUser 
                    ? 'bg-[#32FF8B] text-[#010C1B]' 
                    : 'bg-white/10 text-[#C5C1B9]'
                }`}>
                  {googleUser ? <CheckCircle2 className="w-3.5 h-3.5 font-bold" /> : '1'}
                </span>
                <span className="text-[11px] font-black tracking-wider uppercase text-[#FFFFFF]">Google Account</span>
              </div>
              {googleUser && (
                <span className="text-[8px] font-black tracking-widest text-[#32FF8B] bg-[#32FF8B]/10 px-2 py-0.5 rounded uppercase font-mono border border-[#32FF8B]/25">
                  Authorized
                </span>
              )}
            </div>

            {googleUser ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-1 text-xs font-mono">
                  <div className="p-1 bg-[#010C1B] rounded-lg border border-white/5 text-[#32FF8B] shrink-0">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[#C5C1B9] font-medium truncate text-[10px] block" title={googleUser.email}>
                    {googleUser.email}
                  </span>
                </div>
                {googleUser.isDemo && (
                  <span className="text-[9px] text-[#00D7B2] font-mono italic px-1 block mt-1">
                    * Authenticated via Sandbox Mode
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={onGoogleSignIn}
                  disabled={isAuthLoading}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 hover:text-slate-950 font-bold py-2.5 px-3 rounded-xl text-xs transition duration-150 shadow-sm disabled:opacity-50 cursor-pointer text-center"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52s.01 0 0 0z" />
                  </svg>
                  Sign In with Google
                </button>
                {onSandboxSignIn && (
                  <>
                    <div className="flex items-center justify-center gap-1.5 text-[8px] text-[#C5C1B9]/30 font-mono uppercase tracking-widest my-0.5">
                      <span className="h-px bg-white/5 flex-1"></span>
                      <span>Or Bypass If Blocked</span>
                      <span className="h-px bg-white/5 flex-1"></span>
                    </div>
                    <button
                      type="button"
                      onClick={onSandboxSignIn}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-teal-500/10 to-[#32FF8B]/10 hover:from-teal-500/20 hover:to-[#32FF8B]/20 border border-[#32FF8B]/30 text-[#32FF8B] font-mono text-[9px] uppercase tracking-wider font-extrabold transition-all duration-150 active:scale-[0.98] cursor-pointer text-center"
                    >
                      ⚡ Access with Demo Sandbox Account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Connection Divider Arrow */}
          <div className="flex justify-center -my-2.5">
            <div className="p-1 bg-[#010C1B] border border-white/5 rounded-full shadow-lg text-[#C5C1B9]">
              <ArrowRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>

          {/* Step 2: Web3 Wallet */}
          <div className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
            isWalletConnected 
              ? 'bg-[#32FF8B]/5 border-[#32FF8B]/25' 
              : 'bg-[#010C1B]/40 border-white/5'
          } ${!googleUser ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                  isWalletConnected 
                    ? 'bg-[#32FF8B] text-[#010C1B]' 
                    : 'bg-white/10 text-[#C5C1B9]'
                }`}>
                  {isWalletConnected ? <CheckCircle2 className="w-3.5 h-3.5 font-bold" /> : '2'}
                </span>
                <span className="text-[11px] font-black tracking-wider uppercase text-[#FFFFFF]">Web3 Wallet</span>
              </div>
              {isWalletConnected && (
                <span className="text-[8px] font-black tracking-widest text-[#32FF8B] bg-[#32FF8B]/10 px-2 py-0.5 rounded uppercase font-mono border border-[#32FF8B]/25">
                  Connected
                </span>
              )}
            </div>

            {isWalletConnected ? (
              <div className="flex items-center gap-2 px-1 text-xs font-mono">
                <div className="p-1 bg-[#010C1B] rounded-lg border border-white/5 text-[#32FF8B] shrink-0">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[#C5C1B9] font-[#32FF8B] text-[10px]">Active Web3 Address Loaded</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  onConnectWallet();
                  onClose();
                }}
                disabled={!googleUser}
                className="w-full flex items-center justify-center gap-1.5 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black py-2.5 px-3 rounded-xl text-[10px] uppercase transition duration-150 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5 animate-bounce-slow" />
                Connect Web3 Wallet
              </button>
            )}
          </div>

        </div>

        {/* Footer note */}
        <div className="pt-3 border-t border-white/5 text-center text-[9px] text-[#C5C1B9]/60 leading-normal font-mono uppercase tracking-widest">
          Secured with cloud databases.
        </div>
      </div>
    </div>
  );
}
