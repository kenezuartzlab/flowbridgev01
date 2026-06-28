import React, { useState, useEffect } from 'react';
import { 
  X, Copy, Check, QrCode, Heart, Sparkles, MessageSquare, Plus, Minus, Send, 
  ThumbsUp, Code, GraduationCap, DollarSign, Gift, Mail, Lock, User as UserIcon, 
  RefreshCw, AlertTriangle, CheckCircle 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAccount, useSendTransaction, useBalance, useSignMessage, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseEther } from 'viem';
import { emailSignUp, emailSignIn, sendVerification, reloadUser, googleSignIn } from '../lib/auth';

interface Suggestion {
  id: string;
  category: 'learning' | 'earning' | 'developer_tools' | 'arbitrage_bot' | 'other';
  text: string;
  votes: number;
  author: string;
  timestamp: number;
}

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  googleUser?: any;
  getEffectiveIdToken?: () => Promise<string | null>;
  initialTab?: 'donate' | 'feedback' | 'incentives';
  onGoogleSignIn?: () => Promise<void>;
  onSandboxSignIn?: () => void;
  setGoogleUser?: (user: any) => void;
}

const DONATION_ADDRESSES = {
  EVM: "0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47",
  SOLANA: "Dy7nYuuMLz5Q5ZnfsTajdf3vJGfPwucToDvutGjCQc6M",
  TRX: "TNzXqsEW6zS1i2KhKAsjL34RwkuKL3FnMs",
  BITCOIN: "bc1p63y7eaufv48jpazjmcjhktntesrwpyju3cdydn4t2h9qq6jchvfqp6m4hv"
};

const COIN_CONFIGS = [
  { id: 'BOT', name: 'BOT Chain (EVM)', symbol: 'BOT', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [0.1, 0.5], step: 0.01, min: 0.02, max: 1000 },
  { id: 'BNB', name: 'BNB Smart Chain (EVM)', symbol: 'BNB', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [0.01, 0.05], step: 0.005, min: 0.001, max: 10 },
  { id: 'POLYGON', name: 'Polygon (EVM)', symbol: 'POL', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [5, 20], step: 1, min: 1, max: 500 },
  { id: 'ETH', name: 'Ethereum Mainnet (EVM)', symbol: 'ETH', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [0.005, 0.02], step: 0.001, min: 0.0005, max: 2 },
  { id: 'SOL', name: 'Solana', symbol: 'SOL', address: DONATION_ADDRESSES.SOLANA, type: 'non_evm', increments: [0.1, 0.5], step: 0.05, min: 0.01, max: 50 },
  { id: 'TRX', name: 'TRON TRC20', symbol: 'TRX', address: DONATION_ADDRESSES.TRX, type: 'non_evm', increments: [25, 100], step: 5, min: 10, max: 5000 },
  { id: 'BTC', name: 'Bitcoin', symbol: 'BTC', address: DONATION_ADDRESSES.BITCOIN, type: 'non_evm', increments: [0.0005, 0.002], step: 0.0001, min: 0.0001, max: 0.5 },
  // USDT options on requested chains with 1 USDT minimum
  { id: 'USDT_BOT', name: 'USDT - BOT Chain', symbol: 'USDT', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [5, 20], step: 1, min: 1, max: 10000 },
  { id: 'USDT_POLYGON', name: 'USDT - Polygon Chain', symbol: 'USDT', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [5, 20], step: 1, min: 1, max: 10000 },
  { id: 'USDT_BNB', name: 'USDT - BNB Smart Chain', symbol: 'USDT', address: DONATION_ADDRESSES.EVM, type: 'evm', increments: [5, 20], step: 1, min: 1, max: 10000 },
  { id: 'USDT_SOL', name: 'USDT - Solana Chain', symbol: 'USDT', address: DONATION_ADDRESSES.SOLANA, type: 'non_evm', increments: [5, 20], step: 1, min: 1, max: 10000 },
  { id: 'USDT_TRX', name: 'USDT - TRON (TRC20)', symbol: 'USDT', address: DONATION_ADDRESSES.TRX, type: 'non_evm', increments: [5, 20], step: 1, min: 1, max: 10000 }
];

export function DonateModal({ 
  isOpen, 
  onClose, 
  googleUser, 
  getEffectiveIdToken, 
  initialTab,
  onGoogleSignIn,
  onSandboxSignIn,
  setGoogleUser
}: DonateModalProps) {
  const { address: connectedAddress, isConnected } = useAccount();
  const { sendTransaction, data: txData, isPending: isTxPending, isSuccess: isTxSuccess } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();
  const { connect } = useConnect();

  // Basic component state
  const [selectedCoin, setSelectedCoin] = useState(COIN_CONFIGS[0]);
  const [amountStr, setAmountStr] = useState('1.0');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionCategory, setSuggestionCategory] = useState<'learning' | 'earning' | 'developer_tools' | 'arbitrage_bot' | 'other'>('learning');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeTab, setActiveTab] = useState<'donate' | 'feedback' | 'incentives'>(initialTab || 'donate');
  const [donationSuccessState, setDonationSuccessState] = useState(false);

  // Email-password authentication state variables
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLocalLoading, setAuthLocalLoading] = useState(false);
  const [authLocalError, setAuthLocalError] = useState<string | null>(null);

  // Email verification state variables
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleLocalGoogleSignIn = async () => {
    setAuthLocalError(null);
    setAuthLocalLoading(true);
    try {
      if (onGoogleSignIn) {
        await onGoogleSignIn();
      } else {
        const res = await googleSignIn();
        if (res && setGoogleUser) {
          setGoogleUser(res.user);
        }
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthLocalError(err.message || "Google Sign-In failed.");
      }
    } finally {
      setAuthLocalLoading(false);
    }
  };

  const handleLocalEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthLocalError("Please enter email and password.");
      return;
    }
    if (authMode === 'signup' && !authName) {
      setAuthLocalError("Please enter your display name.");
      return;
    }

    setAuthLocalError(null);
    setAuthLocalLoading(true);
    try {
      if (authMode === 'signup') {
        const user = await emailSignUp(authEmail, authPassword, authName);
        if (setGoogleUser) {
          setGoogleUser(user);
        }
        setVerificationSuccess("Account created successfully! Verification email sent.");
      } else {
        const user = await emailSignIn(authEmail, authPassword);
        if (setGoogleUser) {
          setGoogleUser(user);
        }
      }
    } catch (err: any) {
      console.error("Local Auth Error:", err);
      let errMsg = err.message || "Authentication failed.";
      if (err.code === 'auth/invalid-credential') {
        errMsg = "Invalid email or password.";
      } else if (err.code === 'auth/email-already-in-use') {
        errMsg = "This email is already registered.";
      } else if (err.code === 'auth/weak-password') {
        errMsg = "Password should be at least 6 characters.";
      } else if (err.code === 'auth/invalid-email') {
        errMsg = "Please enter a valid email address.";
      }
      setAuthLocalError(errMsg);
    } finally {
      setAuthLocalLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationError(null);
    setVerificationSuccess(null);
    setVerificationLoading(true);
    try {
      await sendVerification();
      setVerificationSuccess("Verification email has been resent to your inbox.");
    } catch (err: any) {
      console.error("Resend error:", err);
      setVerificationError(err.message || "Failed to resend verification email.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleRefreshVerification = async () => {
    setVerificationError(null);
    setVerificationSuccess(null);
    setVerificationLoading(true);
    try {
      const refreshedUser = await reloadUser();
      if (refreshedUser) {
        if (setGoogleUser) {
          setGoogleUser(refreshedUser);
        }
        if (refreshedUser.emailVerified) {
          setVerificationSuccess("Success! Your email is now verified.");
        } else {
          setVerificationError("Email is still not verified. Please check your inbox and try again.");
        }
      }
    } catch (err: any) {
      console.error("Refresh error:", err);
      setVerificationError(err.message || "Failed to refresh user profile.");
    } finally {
      setVerificationLoading(false);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Incentive tracking state variables
  const [incentives, setIncentives] = useState<{
    flowPoints: number;
    claimedTokens: number;
    referralCode: string | null;
    referredBy: string | null;
    walletAddress: string | null;
    lastBindingChange: string | null;
    bindingChangesCount: number;
    inviteCount: number;
    globalTotalEarned: number;
    globalTotalClaimed: number;
    milestoneReached: boolean;
  } | null>(null);
  const [isIncentivesLoading, setIsIncentivesLoading] = useState(false);
  const [incentivesError, setIncentivesError] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<{ success?: boolean; error?: string; loading?: boolean }>({});

  const fetchIncentives = async () => {
    if (!googleUser || !getEffectiveIdToken) return;
    setIsIncentivesLoading(true);
    setIncentivesError(null);
    try {
      const token = await getEffectiveIdToken();
      if (!token) return;
      const res = await fetch('/api/users/incentives', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.incentives) {
        setIncentives(data.incentives);
      } else {
        setIncentivesError(data.error || "Failed to load incentive data.");
      }
    } catch (e: any) {
      console.error("Error loading points:", e);
      setIncentivesError(e.message || "Network error loading points.");
    } finally {
      setIsIncentivesLoading(false);
    }
  };

  const handleClaimPoints = async () => {
    if (!googleUser || !getEffectiveIdToken) return;
    setClaimStatus({ loading: true });
    try {
      const token = await getEffectiveIdToken();
      if (!token) return;
      const res = await fetch('/api/users/claim', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.incentives) {
        setIncentives(data.incentives);
        setClaimStatus({ success: true });
      } else {
        setClaimStatus({ error: data.error || "Failed to process claim request." });
      }
    } catch (e: any) {
      console.error("Error claiming points:", e);
      setClaimStatus({ error: e.message || "Network failure during claim." });
    }
  };

  const [bindStatus, setBindStatus] = useState<{ success?: boolean; error?: string; loading?: boolean }>({});
  const [manualWalletInput, setManualWalletInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  const handleBindWallet = async (addressToBind: string) => {
    if (!googleUser || !getEffectiveIdToken) return;
    setBindStatus({ loading: true, error: undefined, success: false });
    try {
      const token = await getEffectiveIdToken();
      if (!token) {
        setBindStatus({ error: "Missing auth token." });
        return;
      }
      const res = await fetch('/api/users/bind-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ walletAddress: addressToBind })
      });
      const data = await res.json();
      if (data.success) {
        setBindStatus({ success: true });
        await fetchIncentives(); // refresh state
      } else {
        setBindStatus({ error: data.error || "Failed to bind wallet." });
      }
    } catch (e: any) {
      console.error("Error binding wallet:", e);
      setBindStatus({ error: e.message || "Network failure during binding." });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchIncentives();
    }
  }, [isOpen, googleUser]);

  // New pending suggestion state to allow writing first, validating and donating second
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    text: string;
    category: 'learning' | 'earning' | 'developer_tools' | 'arbitrage_bot' | 'other';
  } | null>(null);

  // Vote unique signature state
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [isVotingId, setIsVotingId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Anti-Spam Gate States
  const [hasSigned, setHasSigned] = useState(false);
  const [isSigningMessage, setIsSigningMessage] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [isDemoActive, setIsDemoActive] = useState(false);

  // Check unique votes for the logged-in wallet on connect
  useEffect(() => {
    if (connectedAddress) {
      const savedVotes = localStorage.getItem(`fb_voted_${connectedAddress.toLowerCase()}`);
      if (savedVotes) {
        try {
          setVotedIds(JSON.parse(savedVotes));
        } catch (e) {
          setVotedIds([]);
        }
      } else {
        setVotedIds([]);
      }
    } else {
      setVotedIds([]);
    }
  }, [connectedAddress]);

  // Check if demo bypass is active from localStorage
  useEffect(() => {
    const isDemo = localStorage.getItem('flowbridge_demo_mode') === 'true';
    setIsDemoActive(isDemo);
  }, []);

  const handleSignAntiSpam = async () => {
    setIsSigningMessage(true);
    setSignError(null);
    try {
      const detailText = pendingSuggestion 
        ? `Proposal of category ${pendingSuggestion.category}: "${pendingSuggestion.text}"` 
        : "I authorize this feedback proposal for FlowBridge community development";
      
      const msg = `${detailText}. I verify my wallet ownership to prevent abuse & spamming of the feedback boards.`;
      
      if (!connectedAddress) throw new Error("Wallet not connected");
      await signMessageAsync({ message: msg, account: connectedAddress });
      setHasSigned(true);
    } catch (err: any) {
      console.warn("Signature failed:", err);
      setSignError(err?.message || "Signature request was rejected by your wallet connector.");
    } finally {
      setIsSigningMessage(false);
    }
  };

  // Fetch proposals from backend database
  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/proposals');
      const data = await res.json();
      if (data.success && data.proposals) {
        setSuggestions(data.proposals);
      }
    } catch (e) {
      console.error("Failed to fetch suggestions:", e);
    }
  };

  // Initialize suggestions from backend database
  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen]);

  // Update amount input when coin changes to fit standard sizes
  const handleCoinChange = (coinId: string) => {
    const coin = COIN_CONFIGS.find(c => c.id === coinId);
    if (coin) {
      setSelectedCoin(coin);
      setAmountStr(coin.increments[0].toString());
      setDonationSuccessState(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(selectedCoin.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  // Safe Math helpers for guide increments
  const adjustAmount = (increment: number) => {
    const current = parseFloat(amountStr) || 0;
    const newVal = Math.max(selectedCoin.min, Math.min(selectedCoin.max, current + increment));
    
    // Format nicely based on range scale
    if (selectedCoin.step < 0.01) {
      setAmountStr(newVal.toFixed(4));
    } else if (selectedCoin.step < 1) {
      setAmountStr(newVal.toFixed(3));
    } else {
      setAmountStr(newVal.toFixed(1));
    }
  };

  // EVM On-Chain direct transaction sender
  const handleOnChainDonate = async () => {
    if (!isConnected) return;
    try {
      const amtEther = parseFloat(amountStr);
      if (isNaN(amtEther) || amtEther <= 0) return;

      sendTransaction({
        to: selectedCoin.address as `0x${string}`,
        value: parseEther(amountStr),
      });
    } catch (err) {
      console.warn("Direct EVM sending failed", err);
    }
  };

  useEffect(() => {
    if (isTxSuccess) {
      setDonationSuccessState(true);
    }
  }, [isTxSuccess]);

  // Submit Feedback Suggestion - Launches the validation and verification step first
  const handleLaunchVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestionText.trim()) return;

    setPendingSuggestion({
      text: suggestionText,
      category: suggestionCategory
    });
    setHasSigned(false);
    setDonationSuccessState(false);
    setSignError(null);
  };

  // Commit suggestion to public community board after successful verification
  const commitPendingSuggestion = async () => {
    if (!pendingSuggestion) return;

    const author = connectedAddress ? `${connectedAddress.slice(0, 5)}...${connectedAddress.slice(-4)}` : 'Anonymous Supporter';

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: pendingSuggestion.category,
          text: pendingSuggestion.text,
          author
        })
      });
      const data = await res.json();
      if (data.success && data.proposal) {
        setSuggestions(prev => [data.proposal, ...prev]);
      } else {
        const newSugg: Suggestion = {
          id: Math.random().toString(),
          category: pendingSuggestion.category,
          text: pendingSuggestion.text,
          votes: 1,
          author,
          timestamp: Date.now()
        };
        setSuggestions(prev => [newSugg, ...prev]);
      }
    } catch (err) {
      console.error("Failed to save proposal to DB:", err);
      const newSugg: Suggestion = {
        id: Math.random().toString(),
        category: pendingSuggestion.category,
        text: pendingSuggestion.text,
        votes: 1,
        author,
        timestamp: Date.now()
      };
      setSuggestions(prev => [newSugg, ...prev]);
    }
    
    // Clear back to writing screen
    setSuggestionText('');
    setPendingSuggestion(null);
    setHasSigned(false);
    setDonationSuccessState(false);
  };

  // Upvote suggestion with off-chain cryptographic signature gate
  const handleVote = async (id: string) => {
    if (!isConnected) {
      try {
        connect({ connector: injected() });
      } catch (err) {
        setVoteError("Please connect your wallet first.");
      }
      return;
    }

    if (!connectedAddress) return;

    const addrLower = connectedAddress.toLowerCase();
    const alreadyVoted = votedIds.includes(id);

    if (alreadyVoted) {
      setVoteError("Your connected wallet address has already authenticated a vote for this proposal!");
      setTimeout(() => setVoteError(null), 3000);
      return;
    }

    setIsVotingId(id);
    setVoteError(null);

    try {
      const voteMessage = `I cryptographically sign to authorize casting 1 community voice vote for Proposal #${id} on FlowBridge. We verify wallet owners off-chain to avoid unlimited spam.`;
      await signMessageAsync({ message: voteMessage, account: connectedAddress });

      // Save the vote to the database via Express API
      const res = await fetch(`/api/proposals/${id}/vote`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success && data.proposal) {
        setSuggestions(prev => prev.map(s => s.id === id ? data.proposal : s));
      } else {
        const updated = suggestions.map(s => {
          if (s.id === id) {
            return { ...s, votes: s.votes + 1 };
          }
          return s;
        });
        setSuggestions(updated);
      }

      // Mark as voted in state & localStorage to prevent double clicking in the same browser session
      const nextVoted = [...votedIds, id];
      setVotedIds(nextVoted);
      localStorage.setItem(`fb_voted_${addrLower}`, JSON.stringify(nextVoted));

    } catch (err: any) {
      console.warn("Vote signature failed:", err);
      setVoteError(err?.message || "Signature request was rejected by your wallet connector.");
      setTimeout(() => setVoteError(null), 4000);
    } finally {
      setIsVotingId(null);
    }
  };

  if (!isOpen) return null;

  const isVerified = !!(googleUser?.emailVerified || googleUser?.email_verified || googleUser?.isDemo);

  // Render standard QR code using public dynamic qrserver api
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=32ff8b&bgcolor=010c1b&data=${encodeURIComponent(selectedCoin.address)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="donate_modal_card"
        className="bg-[#030E1A] border border-white/10 text-[#F0F7F3] rounded-2xl sm:rounded-[28px] w-full max-w-[480px] max-h-[calc(100svh-1rem)] sm:max-h-[88vh] p-0 shadow-2xl relative flex flex-col overflow-hidden animate-scale-up"
      >
        {/* Dynamic Banner based on activeTab */}
        <div className={cn(
          "p-4 sm:p-5 border-b border-white/5 relative flex justify-between items-start transition-all duration-300",
          activeTab === 'donate' && "bg-gradient-to-r from-teal-500/20 via-[#32FF8B]/10 to-teal-900/40",
          activeTab === 'feedback' && "bg-gradient-to-r from-blue-500/20 via-[#32FF8B]/10 to-indigo-950/40",
          activeTab === 'incentives' && "bg-gradient-to-r from-emerald-500/20 via-[#32FF8B]/10 to-teal-950/40"
        )}>
          <div className="space-y-1">
            {activeTab === 'donate' && (
              <>
                <div className="flex items-center gap-1.5 text-[#32FF8B]">
                  <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-[#32FF8B]" />
                  <span className="text-[12px] sm:text-[13px] font-mono font-black tracking-widest uppercase">Support Public Utilities</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white font-mono tracking-tight uppercase leading-tight">
                  Fuel FlowBridge
                </h2>
                <p className="text-[13px] text-[#C5C1B9] max-w-[340px] leading-relaxed hidden sm:block">
                  We charge **0% protocol fees**! Support our decentralized team in building advanced cross-chain indices, learning tools, & earnings scanners.
                </p>
              </>
            )}
            {activeTab === 'feedback' && (
              <>
                <div className="flex items-center gap-1.5 text-[#32FF8B]">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-[#32FF8B]" />
                  <span className="text-[12px] sm:text-[13px] font-mono font-black tracking-widest uppercase">Community Voting</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white font-mono tracking-tight uppercase leading-tight">
                  Request & Vote Tools
                </h2>
                <p className="text-[13px] text-[#C5C1B9] max-w-[340px] leading-relaxed hidden sm:block">
                  Propose custom tools, arbitrage bots, or indexes. Vote using free cryptographic signatures to direct our dev pipeline!
                </p>
              </>
            )}
            {activeTab === 'incentives' && (
              <>
                <div className="flex items-center gap-1.5 text-[#32FF8B]">
                  <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-[#32FF8B]" />
                  <span className="text-[12px] sm:text-[13px] font-mono font-black tracking-widest uppercase">FLOW Incentive Portal</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white font-mono tracking-tight uppercase leading-tight">
                  Rewards & Points
                </h2>
                <p className="text-[13px] text-[#C5C1B9] max-w-[340px] leading-relaxed hidden sm:block">
                  Claim your off-chain points as on-chain FLOW tokens, track active community milestones, and share your invitation links!
                </p>
              </>
            )}
          </div>
          {/* Close button inside modal container */}
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-xl text-[#C0C8D0] hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Sub-Tabs selector */}
        <div className="flex border-b border-white/5 bg-[#010C1B]">
          <button
            onClick={() => setActiveTab('donate')}
            className={cn(
               "flex-1 py-3 text-sm font-black uppercase tracking-wider font-mono transition-all border-b-2 flex items-center justify-center gap-2",
               activeTab === 'donate' 
                 ? "border-[#32FF8B] text-[#32FF8B] bg-white/[0.02]" 
                 : "border-transparent text-[#C5C1B9] hover:text-white hover:bg-white/[0.01]"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Donate Direct</span>
          </button>
          
          <button
            onClick={() => setActiveTab('feedback')}
            className={cn(
               "flex-1 py-3 text-sm font-black uppercase tracking-wider font-mono transition-all border-b-2 flex items-center justify-center gap-2",
               activeTab === 'feedback' 
                 ? "border-[#32FF8B] text-[#32FF8B] bg-white/[0.02]" 
                 : "border-transparent text-[#C5C1B9] hover:text-white hover:bg-white/[0.01]"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Request Tools ({suggestions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('incentives')}
            className={cn(
               "flex-1 py-3 text-sm font-black uppercase tracking-wider font-mono transition-all border-b-2 flex items-center justify-center gap-2",
               activeTab === 'incentives' 
                 ? "border-[#32FF8B] text-[#32FF8B] bg-white/[0.02]" 
                 : "border-transparent text-[#C5C1B9] hover:text-white hover:bg-white/[0.01]"
            )}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>FLOW Rewards</span>
          </button>
        </div>

        {/* Tab Body Contents. Added responsive scrolling flex-1 layout to prevent overflow on mobile devices */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
          {activeTab === 'donate' && (
            <div className="space-y-4">
              {/* Crypto selector grid */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-bold text-[#C5C1B9] uppercase tracking-wider font-mono block">
                    Direct Supporter Option
                  </label>
                  <span className="text-[10px] font-mono text-[#32FF8B] uppercase tracking-widest font-black">
                    No proposal required
                  </span>
                </div>
                <select
                  value={selectedCoin.id}
                  onChange={(e) => handleCoinChange(e.target.value)}
                  className="col-span-2 bg-[#010C1B] border border-white/10 rounded-xl px-3 py-3 text-sm font-bold font-mono focus:border-[#32FF8B]/50 focus:outline-none text-white cursor-pointer w-full"
                >
                  {COIN_CONFIGS.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Custom Input & Guides UI */}
              <div className="space-y-3 bg-[#010C1B]/80 border border-white/5 rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] font-bold text-[#C5C1B9] uppercase tracking-wider font-mono">
                    Donation Amount
                  </span>
                  <span className="text-[12px] font-mono text-[#32FF8B] font-bold bg-[#32FF8B]/10 px-1.5 py-0.5 rounded">
                    Min {selectedCoin.min} {selectedCoin.symbol}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 bg-[#030E1A] border border-white/10 rounded-xl p-1.5 focus-within:border-[#32FF8B]/40 transition-all">
                  <button 
                    type="button"
                    onClick={() => adjustAmount(-selectedCoin.step)}
                    className="p-2 border border-white/5 rounded-lg text-white hover:text-[#32FF8B] hover:bg-white/5 cursor-pointer active:scale-95 transition"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="bg-transparent border-none text-center font-bold text-lg font-mono tracking-tight text-white focus:outline-none w-full"
                    min={selectedCoin.min}
                    max={selectedCoin.max}
                    step={selectedCoin.step}
                  />

                  <button 
                    type="button"
                    onClick={() => adjustAmount(selectedCoin.step)}
                    className="p-2 border border-white/5 rounded-lg text-white hover:text-[#32FF8B] hover:bg-white/5 cursor-pointer active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* 2 Fixed Amount option choices requested in spec */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-extrabold text-[#C5C1B9]/70 font-mono uppercase shrink-0">
                    Guide:
                  </span>
                  {selectedCoin.increments.map((choice, i) => (
                    <button
                      key={i}
                      onClick={() => setAmountStr(choice.toString())}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[12px] font-mono font-bold border transition-all cursor-pointer",
                        parseFloat(amountStr) === choice
                          ? "bg-[#32FF8B]/10 border-[#32FF8B] text-[#32FF8B] shadow-inner"
                          : "bg-[#030E1A] border-white/5 hover:border-white/15 text-[#C5C1B9] hover:text-white"
                      )}
                    >
                      {choice} {selectedCoin.symbol}
                    </button>
                  ))}
                  
                  {/* Plus presets */}
                  <button
                    onClick={() => adjustAmount(selectedCoin.increments[1])}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-[#030E1A] border border-white/5 text-[#C5C1B9] hover:border-[#32FF8B]/30 hover:text-[#32FF8B] cursor-pointer"
                  >
                    +{selectedCoin.increments[1]}
                  </button>
                </div>
              </div>

              {/* Layout splits for QR scan vs Onchain trigger */}
              <div className="flex flex-col sm:flex-row gap-4">
                {/* QR Generation block */}
                {showQr && (
                  <div className="shrink-0 flex flex-col items-center justify-center p-2 sm:p-3.5 bg-[#010C1B] border border-[#32FF8B]/15 rounded-2xl relative shadow-xl focus-within:border-teal-500/50 mx-auto sm:mx-0">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 bg-[#010C1B] rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5">
                      <img 
                        src={qrUrl} 
                        alt="Donation address QR Scan code" 
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#C5C1B9] mt-2 block select-none">
                      SCAN TO PAY WALLET
                    </span>
                  </div>
                )}

                {/* Address Display & Manual Copy/Send controls */}
                <div className="flex-1 space-y-3.5 flex flex-col justify-between">
                  {/* Address indicator with copy */}
                  <div className="space-y-1.5">
                    <span className="text-[12px] font-bold text-[#C5C1B9] uppercase tracking-wider font-mono block">
                      Transfer Support address
                    </span>
                    <div className="flex items-center justify-between gap-1 bg-[#010C1B] rounded-xl border border-white/10 p-2 text-left">
                      <div className="font-mono text-[11px] text-[#C5C1B9] truncate flex-1 leading-snug select-all py-1 px-1 pr-3 scrollbar-none overflow-x-auto">
                        {selectedCoin.address}
                      </div>

                      <button 
                        onClick={copyAddress}
                        className={cn(
                          "p-2 rounded-xl transition cursor-pointer shrink-0 border duration-150 active:scale-95",
                          copied 
                            ? "bg-[#32FF8B]/10 text-[#32FF8B] border-[#32FF8B]/30" 
                            : "bg-[#030E1A] text-[#C5C1B9] hover:text-[#32FF8B] border-white/5 hover:border-[#32FF8B]/20"
                        )}
                        title="Copy address"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[#32FF8B]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Direct transaction executor for EVMs when wallet is connected */}
                  {selectedCoin.type === 'evm' ? (
                    <div className="space-y-2">
                      {isConnected ? (
                        <button
                          onClick={handleOnChainDonate}
                          disabled={isTxPending}
                          className="w-full py-3 rounded-xl bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black text-[10.5px] uppercase transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-98"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isTxPending ? 'Approving modal transaction...' : `Send direct ${amountStr} ${selectedCoin.symbol}`}</span>
                        </button>
                      ) : (
                        <div className="text-center p-2.5 bg-[#0D1C2A]/40 border border-[#32FF8B]/10 rounded-xl">
                          <p className="text-[8.5px] leading-relaxed text-[#C5C1B9]/90 font-mono tracking-normal uppercase">
                            Connect your wallet to execute automatic direct transfers, or utilize any QR/custom mobile wallet above.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-teal-950/20 border border-teal-500/20 rounded-xl text-left">
                      <p className="text-[8.5px] leading-relaxed text-teal-200/90 font-mono">
                        Direct wallet execution is only supported for EVM networks. For Solana, BTC, and TRON, scan the generated QR code or copy the address above.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status / Confirmation banners */}
              {donationSuccessState && (
                <div className="bg-[#122A26] border border-[#32FF8B]/30 rounded-xl p-3 text-left">
                  <p className="text-[13px] font-semibold text-[#32FF8B] flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 bg-[#32FF8B]/10 border border-[#32FF8B]/30 rounded p-0.5" />
                    <span>Support transfer successful! You are a legend. Thank you for empowering decentralized utilities!</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="space-y-5">
              {/* PROCEDURE: ANYONE CAN INPUT REQUEST FIRST */}
              {pendingSuggestion === null ? (
                <form onSubmit={handleLaunchVerification} className="space-y-3.5 bg-[#010C1B] border border-white/5 rounded-2xl p-4.5 text-left relative overflow-hidden animate-scale-up">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#32FF8B]/5 to-transparent blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <div className="flex items-center gap-1.5 text-[#32FF8B]">
                      <MessageSquare className="w-4 h-4 text-[#32FF8B]" />
                      <span className="text-[12px] font-mono font-black uppercase tracking-widest text-[#32FF8B]">Request New Utility / Tool</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#32FF8B]/80 font-bold bg-[#32FF8B]/10 px-1.5 py-0.5 rounded tracking-widest uppercase">
                      Propose FlowBridge Features
                    </span>
                  </div>
                  
                  <p className="text-[10.5px] text-[#C5C1B9] leading-relaxed select-none">
                    Describe any arbitrage bots, dashboards, custom analytics or cross-chain learning tools you would like listed on the bridge.
                  </p>

                  <div className="space-y-2">
                    <label className="text-[11px] font-mono text-[#C5C1B9] uppercase font-bold block">
                      Focus Category
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'learning', label: 'Learnings', icon: GraduationCap },
                        { id: 'earning', label: 'Scanner', icon: DollarSign },
                        { id: 'developer_tools', label: 'Dev Kit', icon: Code },
                        { id: 'arbitrage_bot', label: 'Arbitrage Bot', icon: Sparkles }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSuggestionCategory(cat.id as any)}
                          className={cn(
                            "px-2.5 py-1 rounded-md border text-[11px] font-bold font-mono tracking-tight transition-all cursor-pointer flex items-center gap-1",
                            suggestionCategory === cat.id
                              ? "bg-[#32FF8B]/10 border-[#32FF8B] text-[#32FF8B]"
                              : "bg-[#030E1A] border-white/5 text-[#C5C1B9] hover:border-white/15 hover:text-white"
                          )}
                        >
                          <cat.icon className="w-3 h-3 shrink-0" />
                          <span>{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-[#C5C1B9] uppercase font-bold block">
                      Describe your request / suggestion
                    </label>
                    <textarea
                      value={suggestionText}
                      onChange={(e) => setSuggestionText(e.target.value)}
                      placeholder="E.g., An arbitrage dashboard showing the price differences of key ecosystem pairs..."
                      maxLength={300}
                      className="bg-[#030E1A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-[#32FF8B]/50 focus:outline-none w-full h-[70px] resize-none"
                      required
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-mono text-white/30">{300 - suggestionText.length} characters left</span>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] rounded-xl text-[12px] uppercase font-black tracking-widest font-mono duration-150 cursor-pointer active:scale-95 shadow-md shadow-[#32FF8B]/10"
                      >
                        Submit Proposal Option
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* STEP 2: PROMPTED WITH DONATION & VERIFICATION IF THEY SUBMIT */
                <div className="bg-[#010C1B] border border-[#32FF8B]/20 rounded-2xl p-5 text-left space-y-4 font-mono relative animate-scale-up">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 px-0.5">
                    <div className="flex items-center gap-1.5 text-[#32FF8B]">
                      <Sparkles className="w-4 h-4 text-[#32FF8B]" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-white">Unlock & Authorize Proposal</h3>
                    </div>
                    <span className="text-[7.5px] font-mono font-bold text-[#E2E8F0]/60 bg-white/5 px-2 py-0.5 rounded">
                      ID: DRAFT
                    </span>
                  </div>

                  {/* Preview what they are verifying */}
                  <div className="bg-[#030E1A] border border-white/5 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#32FF8B] bg-[#32FF8B]/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                        {pendingSuggestion.category.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-[#C5C1B9]/50">Wallet Owner: {connectedAddress ? `${connectedAddress.slice(0, 5)}...${connectedAddress.slice(-4)}` : 'Disconnected'}</span>
                    </div>
                    <p className="text-[13px] text-white/90 italic font-sans leading-relaxed">
                      "{pendingSuggestion.text}"
                    </p>
                  </div>

                  {/* Payment selector specifically for checkout */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-white/60 uppercase font-bold block">
                      Step 1: Choose Sponsor Coin & Network
                    </label>
                    <select
                      value={selectedCoin.id}
                      onChange={(e) => handleCoinChange(e.target.value)}
                      className="bg-[#030E1A] border border-white/10 rounded-xl px-2.5 py-2 text-[10.5px] font-bold font-mono focus:border-[#32FF8B]/50 focus:outline-none text-white cursor-pointer w-full"
                    >
                      {COIN_CONFIGS.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Security checklist */}
                  <div className="space-y-2.5">
                    <label className="text-[11px] font-mono text-white/60 uppercase font-bold block">
                      Step 2: Sign Off-Chain Protection Checklist
                    </label>

                    {/* Check 1: Connected address */}
                    <div className="flex items-center justify-between p-2.5 bg-[#030E1A] border border-white/5 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-[#32FF8B]/15 border border-[#32FF8B]/40 flex items-center justify-center text-[#32FF8B]">
                          {isConnected ? <Check className="w-3 h-3" /> : <div className="w-1.5 h-1.5 bg-[#32FF8B] rounded-full animate-ping" />}
                        </div>
                        <span className="text-[12px] font-bold text-white">Wallet Connection</span>
                      </div>
                      {isConnected ? (
                        <span className="text-[8.5px] text-white/50 bg-white/5 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                          {connectedAddress}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connect({ connector: injected() })}
                          className="px-2 py-0.5 bg-[#32FF8B] text-[#010C1B] rounded text-[8.5px] font-bold uppercase transition"
                        >
                          Connect Wallet
                        </button>
                      )}
                    </div>

                    {/* Check 2: Cryptographic Signature Message */}
                    <div className={cn(
                      "flex items-center justify-between p-2.5 bg-[#030E1A] rounded-xl border transition-all",
                      hasSigned ? "border-[#32FF8B]/30" : "border-white/5"
                    )}>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center",
                          hasSigned 
                            ? "bg-[#32FF8B]/15 border border-[#32FF8B]/40 text-[#32FF8B]" 
                            : "bg-white/5 border border-white/10 text-white/40"
                        )}>
                          {hasSigned ? <Check className="w-3 h-3" /> : <span className="text-[10px]">1</span>}
                        </div>
                        <span className="text-[12px] font-bold text-white">Sign Security Gasless Seal</span>
                      </div>
                      
                      {!hasSigned ? (
                        <button
                          type="button"
                          disabled={!isConnected || isSigningMessage}
                          onClick={handleSignAntiSpam}
                          className="px-2.5 py-1 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-bold text-[8.5px] uppercase rounded cursor-pointer transition disabled:opacity-40"
                        >
                          {isSigningMessage ? 'Signing...' : 'Seal Draft'}
                        </button>
                      ) : (
                        <span className="text-[9.5px] text-[#32FF8B] font-bold italic">Signed Off</span>
                      )}
                    </div>

                    {/* Check 3: Verified Support Transaction */}
                    <div className={cn(
                      "flex items-center justify-between p-2.5 bg-[#030E1A] rounded-xl border transition-all",
                      donationSuccessState ? "border-[#32FF8B]/30" : "border-white/5"
                    )}>
                      <div className="flex items-center gap-2 w-full min-w-0 flex-1">
                        <div className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                          donationSuccessState 
                            ? "bg-[#32FF8B]/15 border border-[#32FF8B]/40 text-[#32FF8B]" 
                            : "bg-white/5 border border-white/10 text-white/40"
                        )}>
                          {donationSuccessState ? <Check className="w-3 h-3" /> : <span className="text-[10px]">2</span>}
                        </div>
                        <span className="text-[12px] font-bold text-white truncate">Transfer Min support {selectedCoin.min} {selectedCoin.symbol}</span>
                      </div>

                      {!donationSuccessState ? (
                        <div className="flex gap-1.5 shrink-0 ml-2">
                          {selectedCoin.type === 'evm' && isConnected ? (
                            <button
                              type="button"
                              onClick={handleOnChainDonate}
                              disabled={isTxPending}
                              className="px-2 py-1 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-bold text-[8.5px] uppercase rounded cursor-pointer transition disabled:opacity-50"
                            >
                              {isTxPending ? 'Executing..' : 'Pay Direct'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                // For Non-evm we display QR code address above and let them confirm
                                setDonationSuccessState(true);
                              }}
                              className="px-2 py-1 border border-[#32FF8B]/35 hover:bg-[#32FF8B]/15 text-[#32FF8B] font-bold text-[8.5px] uppercase rounded cursor-pointer transition"
                              title="Click to self-confirm once sent from Sol/TRX/BTC external wallet"
                            >
                              Confirm Sent
                            </button>
                          )}

                          {isDemoActive && (
                            <button
                              type="button"
                              onClick={() => {
                                setDonationSuccessState(true);
                              }}
                              className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white font-bold text-[8.5px] uppercase rounded cursor-pointer transition"
                              title="Bypass check in Demo/Dev Mode"
                            >
                              Demo Free
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[9.5px] text-[#32FF8B] font-bold italic leading-none">Paid</span>
                      )}
                    </div>
                  </div>

                  {/* Payment instruction details area */}
                  {!donationSuccessState && (
                    <div className="bg-[#030E1A] p-3 rounded-xl border border-white/5 text-[11px] text-[#C5C1B9] leading-relaxed space-y-1.5 text-left">
                      <p className="font-bold text-[#32FF8B] uppercase tracking-wider text-[10px]">
                        Address for external payments:
                      </p>
                      <div className="text-white bg-[#010C1B] p-1.5 rounded border border-white/10 select-all font-sans break-all select-all flex justify-between items-center">
                        <span className="font-mono text-[10px]">{selectedCoin.address}</span>
                        <button 
                          onClick={copyAddress}
                          className="text-[10px] bg-[#030E1A] rounded px-1.5 py-0.5 hover:bg-white/5 text-slate-400 hover:text-white transition"
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p>
                        Scan the "Donate Direct" QR code or use any wallet app to send the registration security fee. Your fee directly supports our zero-fee project. Thank you!
                      </p>
                    </div>
                  )}

                  {signError && (
                    <div className="text-[12px] text-rose-400 font-mono bg-rose-950/20 border border-rose-500/25 rounded-xl p-2 px-3 text-left leading-relaxed">
                      ⚠️ {signError}
                    </div>
                  )}

                  {/* Submission trigger actions */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setPendingSuggestion(null)} // Cancel and details remain in form!
                      className="flex-1 py-3 border border-white/10 hover:bg-white/5 rounded-xl text-[12px] text-[#C5C1B9] uppercase font-bold tracking-widest transition duration-150 cursor-pointer text-center"
                    >
                      Cancel & Edit Proposal
                    </button>

                    <button
                      type="button"
                      disabled={!hasSigned || !donationSuccessState}
                      onClick={commitPendingSuggestion}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-[12px] uppercase font-black tracking-widest duration-150 text-center relative",
                        (hasSigned && donationSuccessState)
                          ? "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] cursor-pointer shadow-lg active:scale-95 shadow-[#32FF8B]/10 animate-pulse"
                          : "bg-white/5 border border-white/5 text-white/30 cursor-not-allowed"
                      )}
                      title="Commit verified suggestions to the list"
                    >
                      Publish Proposal
                    </button>
                  </div>
                </div>
              )}

              {/* Suggestions feed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black text-[#C5C1B9] uppercase tracking-wider font-mono block text-left">
                    Requested by Community ({suggestions.length})
                  </span>
                  <span className="text-[10px] font-mono text-[#32FF8B] animate-pulse">
                    ⚡ Free Off-Chain Signing
                  </span>
                </div>

                {voteError && (
                  <div className="text-[12px] text-rose-400 font-mono bg-rose-950/20 border border-rose-500/25 rounded-xl p-2.5 leading-relaxed text-left animate-shake">
                    ⚠️ {voteError}
                  </div>
                )}

                <div className="space-y-3">
                  {suggestions.map((item) => {
                    const hasUserVoted = votedIds.includes(item.id);
                    const isMining = isVotingId === item.id;

                    return (
                      <div 
                        key={item.id} 
                        className={cn(
                          "p-4 bg-[#010C1B]/60 border rounded-2xl flex justify-between items-start gap-3.5 hover:border-white/10 transition-colors",
                          hasUserVoted ? "border-[#32FF8B]/25 bg-[#32FF8B]/[0.02]" : "border-white/5"
                        )}
                      >
                        <div className="space-y-1.5 text-left flex-1 min-w-0">
                          {/* Tags */}
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "border rounded-full px-2 py-0.5 text-[8.5px] font-mono capitalize",
                              hasUserVoted 
                                ? "bg-[#32FF8B]/10 border-[#32FF8B]/20 text-[#32FF8B]" 
                                : "bg-white/5 text-white/55 border-white/5"
                            )}>
                              {item.category.replace('_', ' ')}
                            </span>
                            <span className="text-[8.5px] font-mono text-white/35">By {item.author}</span>
                            {hasUserVoted && (
                              <span className="text-[10px] font-mono text-[#32FF8B] bg-[#32FF8B]/10 px-1.5 rounded-full font-bold">
                                Checked In
                              </span>
                            )}
                          </div>
                          {/* Text */}
                          <p className="text-sm text-white/85 leading-relaxed font-sans font-medium break-words">
                            {item.text}
                          </p>
                        </div>

                        {/* Vote Button */}
                        <button
                          type="button"
                          disabled={isMining}
                          onClick={() => handleVote(item.id)}
                          className={cn(
                            "flex flex-col items-center justify-center p-2.5 rounded-xl cursor-pointer duration-150 active:scale-95 group shrink-0 w-12 border text-center relative",
                            hasUserVoted 
                              ? "bg-[#32FF8B]/10 border-[#32FF8B] text-[#32FF8B]" 
                              : "bg-[#030E1A] hover:bg-white/[0.02] border-white/5 hover:border-[#32FF8B]/30 text-[#C5C1B9] hover:text-[#32FF8B]"
                          )}
                          title={hasUserVoted ? "You upvoted this proposal" : "Sign with wallet to upvote"}
                        >
                          {isMining ? (
                            <span className="text-[11px] font-mono font-bold animate-pulse text-[#32FF8B]">...</span>
                          ) : (
                            <ThumbsUp className={cn(
                              "w-3.5 h-3.5 group-hover:scale-110 duration-150",
                              hasUserVoted ? "text-[#32FF8B] fill-[#32FF8B]/10" : "text-slate-400 group-hover:text-[#32FF8B]"
                            )} />
                          )}
                          <span className={cn(
                            "text-[10.5px] font-black font-mono mt-1",
                            hasUserVoted ? "text-[#32FF8B]" : "text-[#FFFFFF] group-hover:text-[#32FF8B]"
                          )}>
                            {item.votes}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'incentives' && (
            <div className="space-y-6">
              {!googleUser ? (
                <div className="bg-[#0D1C2A]/40 border border-white/5 rounded-2xl p-5 sm:p-6 space-y-5">
                  <div className="text-center space-y-1.5">
                    <div className="inline-flex p-2.5 bg-[#32FF8B]/5 border border-[#32FF8B]/10 rounded-full text-[#32FF8B] mb-1">
                      <Gift className="w-5 h-5 animate-bounce" />
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">FLOW Incentive Portal</h3>
                    <p className="text-[13px] text-[#C5C1B9] max-w-sm mx-auto leading-relaxed font-mono">
                      Sign in to unlock off-chain FLOW rewards, generate custom referral links, track achievements, and trace tokens.
                    </p>
                  </div>

                  {/* Email & Password Form */}
                  <form onSubmit={handleLocalEmailAuth} className="space-y-3.5">
                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="text-[12px] font-mono text-[#C5C1B9] uppercase font-bold tracking-wider">Display Name</label>
                        <div className="relative">
                          <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input 
                            type="text" 
                            placeholder="e.g. Satoshi" 
                            value={authName}
                            onChange={(e) => setAuthName(e.target.value)}
                            className="w-full bg-[#010C1B]/80 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#32FF8B]/50 transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[12px] font-mono text-[#C5C1B9] uppercase font-bold tracking-wider">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          type="email" 
                          placeholder="name@example.com" 
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="w-full bg-[#010C1B]/80 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#32FF8B]/50 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[12px] font-mono text-[#C5C1B9] uppercase font-bold tracking-wider">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input 
                          type="password" 
                          placeholder="••••••••" 
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className="w-full bg-[#010C1B]/80 border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#32FF8B]/50 transition-colors"
                        />
                      </div>
                    </div>

                    {authLocalError && (
                      <div className="p-2.5 bg-red-950/20 border border-red-500/20 text-red-400 rounded-xl text-[12px] font-mono text-center">
                        {authLocalError}
                      </div>
                    )}

                    {verificationSuccess && (
                      <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 text-[#32FF8B] rounded-xl text-[12px] font-mono text-center">
                        {verificationSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLocalLoading}
                      className="w-full bg-[#32FF8B] hover:bg-[#1FFF7D] disabled:opacity-50 text-black rounded-xl py-2.5 text-sm font-black uppercase tracking-wider font-mono cursor-pointer transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      {authLocalLoading ? "Processing..." : authMode === 'signin' ? "Sign In with Email" : "Create Account & Verify"}
                    </button>
                  </form>

                  <div className="flex justify-between items-center px-1 font-mono text-[12px]">
                    <span className="text-white/40">
                      {authMode === 'signin' ? "No account yet?" : "Have an account?"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                        setAuthLocalError(null);
                      }}
                      className="text-[#32FF8B] hover:underline uppercase font-bold tracking-wider"
                    >
                      {authMode === 'signin' ? "Sign Up" : "Sign In"}
                    </button>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-white/5"></div>
                    <span className="flex-shrink mx-4 text-white/20 text-[11px] font-mono uppercase tracking-widest">or continue with</span>
                    <div className="flex-grow border-t border-white/5"></div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleLocalGoogleSignIn}
                      disabled={authLocalLoading}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl py-2.5 text-sm font-bold font-mono cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Google Authenticator
                    </button>
                  </div>
                </div>
              ) : isIncentivesLoading && !incentives ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-[#32FF8B] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[12px] font-mono text-[#C5C1B9] uppercase">Synchronizing incentive ledger...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Email Verification Pending Notice */}
                  {!isVerified && (
                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-2xl p-4.5 space-y-3.5">
                      <div className="flex gap-3 text-left">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl h-fit shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-amber-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                            Email Verification Required
                          </h4>
                          <p className="text-[10.5px] text-amber-200/80 leading-relaxed font-mono">
                            To protect the community and prevent wash trading bots, you must verify your email address to earn FLOW points. A verification email was sent to <strong className="text-white">{googleUser.email}</strong>.
                          </p>
                        </div>
                      </div>

                      {verificationError && (
                        <div className="p-2 bg-red-950/20 border border-red-500/10 rounded-xl text-red-400 text-[9.5px] font-mono uppercase text-center">
                          {verificationError}
                        </div>
                      )}

                      {verificationSuccess && (
                        <div className="p-2 bg-emerald-950/20 border border-emerald-500/10 rounded-xl text-[#32FF8B] text-[9.5px] font-mono uppercase text-center">
                          {verificationSuccess}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2.5 font-mono">
                        <button
                          type="button"
                          disabled={verificationLoading}
                          onClick={handleResendVerification}
                          className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl py-2 text-[12px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          {verificationLoading ? "Sending..." : "Resend Verification"}
                        </button>

                        <button
                          type="button"
                          disabled={verificationLoading}
                          onClick={handleRefreshVerification}
                          className="flex-1 bg-[#32FF8B] hover:bg-[#1FFF7D] text-black rounded-xl py-2 text-[12px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", verificationLoading && "animate-spin")} />
                          Refresh Status
                        </button>
                      </div>

                      <div className="text-center">
                        <p className="text-[11px] text-amber-200/45 uppercase tracking-wide">
                          * Guest mode active. Swaps & bridges still work, but points earned will be 0.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Balance cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Points Balance */}
                    <div className="bg-[#030E1A] border border-white/5 rounded-2xl p-4.5 flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#32FF8B]/[0.02] rounded-full blur-2xl pointer-events-none" />
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[12px] font-mono text-[#C5C1B9] uppercase tracking-wider font-mono">Unclaimed Points</span>
                        <div className="p-1.5 bg-[#32FF8B]/5 rounded-lg border border-[#32FF8B]/10 text-[#32FF8B]">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-3xl font-black font-mono text-[#32FF8B]">
                          {incentives?.flowPoints?.toLocaleString() ?? 0}
                        </div>
                        <div className="text-[11px] font-mono text-white/40 uppercase font-mono">FLOW Points</div>
                      </div>
                    </div>

                    {/* Claimed Tokens */}
                    <div className="bg-[#030E1A] border border-white/5 rounded-2xl p-4.5 flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/[0.02] rounded-full blur-2xl pointer-events-none" />
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[12px] font-mono text-[#C5C1B9] uppercase tracking-wider font-mono">Claimed Tokens</span>
                        <div className="p-1.5 bg-blue-500/5 rounded-lg border border-blue-500/10 text-blue-400">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-3xl font-black font-mono text-white">
                          {incentives?.claimedTokens?.toLocaleString() ?? 0}
                        </div>
                        <div className="text-[11px] font-mono text-white/40 uppercase font-mono">FLOW Tokens</div>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Wallet Binding Panel */}
                  <div className="bg-[#030E1A] border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 text-left">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                          Cryptographic Wallet Binding
                        </h4>
                        <p className="text-[12px] text-[#C5C1B9] leading-relaxed font-mono">
                          To record and secure your off-chain FLOW rewards, your authenticated email must be uniquely bound to your Web3 wallet address.
                        </p>
                      </div>
                      <div className="p-1.5 bg-[#32FF8B]/5 rounded-lg border border-[#32FF8B]/10 text-[#32FF8B] shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="space-y-3 font-mono">
                      {incentives?.walletAddress ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-[#010C1B] border border-white/5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                            <div className="space-y-1">
                              <span className="text-[10px] text-white/40 uppercase font-bold block">Currently Bound Wallet</span>
                              <code className="text-[12px] text-[#32FF8B] break-all">
                                {incentives.walletAddress}
                              </code>
                            </div>
                            {connectedAddress && connectedAddress.toLowerCase() === incentives.walletAddress.toLowerCase() && (
                              <span className="px-2.5 py-1 bg-[#32FF8B]/10 border border-[#32FF8B]/20 text-[#32FF8B] rounded-lg text-[11px] font-bold uppercase shrink-0 text-center">
                                Active Connection
                              </span>
                            )}
                          </div>

                          {/* Binding updates / limits information */}
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-1">
                            <div className="space-y-0.5 text-left">
                              <p className="text-[11px] text-[#C5C1B9]/60 uppercase">
                                Changes this month: <strong className="text-white">{incentives.bindingChangesCount || 0} / 2</strong>
                              </p>
                              {incentives.lastBindingChange && (
                                <p className="text-[10px] text-white/35">
                                  Last updated: {new Date(incentives.lastBindingChange).toLocaleDateString()}
                                </p>
                              )}
                            </div>

                            {/* Bind button to change address */}
                            {connectedAddress && connectedAddress.toLowerCase() !== incentives.walletAddress.toLowerCase() ? (
                              <button
                                type="button"
                                disabled={bindStatus.loading}
                                onClick={() => handleBindWallet(connectedAddress)}
                                className="w-full sm:w-auto px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                              >
                                {bindStatus.loading ? "Binding..." : "Change Binding to Connected"}
                              </button>
                            ) : (
                              <p className="text-[11px] text-[#C5C1B9]/50 italic">
                                {!connectedAddress ? "Connect a wallet to change binding." : "Wallet matches active connection."}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-blue-950/10 border border-blue-500/10 rounded-2xl space-y-4 text-left">
                          <p className="text-[10.5px] text-blue-200 leading-relaxed">
                            No Web3 wallet has been bound to this account yet. Bind your wallet address to activate your off-chain trade rewards tracking!
                          </p>

                          {connectedAddress && !showManualInput ? (
                            <div className="space-y-3">
                              <div className="p-2.5 bg-[#010C1B] border border-white/5 rounded-xl">
                                <span className="text-[10px] text-white/40 uppercase font-black block">Detected Wallet Address</span>
                                <code className="text-sm text-white break-all">{connectedAddress}</code>
                              </div>
                              <button
                                type="button"
                                disabled={bindStatus.loading}
                                onClick={() => handleBindWallet(connectedAddress)}
                                className="w-full bg-[#32FF8B] hover:bg-[#1FFF7D] text-black rounded-xl py-2.5 text-sm font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
                              >
                                {bindStatus.loading ? "Binding Wallet..." : "Bind Detected Wallet"}
                              </button>
                              <div className="text-center">
                                <button
                                  type="button"
                                  onClick={() => setShowManualInput(true)}
                                  className="text-[9.5px] text-[#C5C1B9]/60 hover:text-white underline cursor-pointer"
                                >
                                  Or enter wallet address manually
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[11px] text-white/55 uppercase font-black">EVM Wallet Address (0x...)</label>
                                <input
                                  type="text"
                                  placeholder="0x..."
                                  value={manualWalletInput}
                                  onChange={(e) => setManualWalletInput(e.target.value)}
                                  className="w-full bg-[#010C1B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:border-[#32FF8B]/50 focus:outline-none font-mono"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={bindStatus.loading || !manualWalletInput.trim()}
                                onClick={() => {
                                  const trimmed = manualWalletInput.trim();
                                  if (!trimmed.toLowerCase().startsWith("0x") || trimmed.length !== 42) {
                                    setBindStatus({ error: "Please enter a valid EVM address starting with 0x (42 characters long)." });
                                    return;
                                  }
                                  handleBindWallet(trimmed);
                                }}
                                className="w-full bg-[#32FF8B] hover:bg-[#1FFF7D] text-black rounded-xl py-2.5 text-sm font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                              >
                                {bindStatus.loading ? "Binding..." : "Bind Manual Address"}
                              </button>
                              
                              {connectedAddress && (
                                <div className="text-center">
                                  <button
                                    type="button"
                                    onClick={() => setShowManualInput(false)}
                                    className="text-[9.5px] text-[#C5C1B9]/60 hover:text-white underline cursor-pointer"
                                  >
                                    Use detected Web3 wallet
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {bindStatus.error && (
                        <div className="p-2.5 bg-red-950/20 border border-red-500/20 text-red-400 rounded-xl text-[12px] text-center font-bold">
                          Error: {bindStatus.error}
                        </div>
                      )}

                      {bindStatus.success && (
                        <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 text-[#32FF8B] rounded-xl text-[12px] text-center font-bold">
                          Success! Wallet address bound successfully.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Claim Button action panel */}
                  <div className="bg-[#0D1C2A]/30 border border-white/5 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5 justify-center sm:justify-start">
                        Claim FLOW Tokens
                      </h4>
                      <p className="text-[12px] text-[#C5C1B9] leading-relaxed max-w-md text-left font-mono">
                        Accumulate at least 1,000 points to claim. Claiming transfers your off-chain points to on-chain FLOW tokens.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!incentives || incentives.flowPoints < 1000 || claimStatus.loading}
                      onClick={handleClaimPoints}
                      className={cn(
                        "w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider font-mono cursor-pointer transition-all duration-150 active:scale-95 text-center shrink-0 min-w-[160px]",
                        incentives && incentives.flowPoints >= 1000 && !claimStatus.loading
                          ? "bg-[#32FF8B] text-black shadow-lg shadow-[#32FF8B]/15 hover:bg-[#1FFF7D]"
                          : "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed"
                      )}
                    >
                      {claimStatus.loading ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        `Claim FLOW`
                      )}
                    </button>
                  </div>

                  {claimStatus.error && (
                    <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-red-400 text-[12px] font-mono uppercase text-center font-mono">
                      Error: {claimStatus.error}
                    </div>
                  )}
                  {claimStatus.success && (
                    <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-[#32FF8B] text-[12px] font-mono uppercase text-center font-mono">
                      Claim processed successfully! Tokens are now claimable.
                    </div>
                  )}

                  {/* Cooperative progress bar */}
                  <div className="bg-[#030E1A] border border-white/5 rounded-2xl p-5 space-y-3.5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-left">
                      <div className="space-y-0.5">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                          Liquidity Milestone Tracker
                        </h4>
                        <p className="text-[12px] text-[#C5C1B9] font-mono">
                          Cooperative community pool target to enable FLOW token swap.
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="text-sm font-mono font-black text-[#32FF8B]">
                          {(incentives?.globalTotalClaimed ?? 0).toLocaleString()} / 1,000,000 FLOW
                        </div>
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest font-mono">
                          {Math.min(100, Math.floor(((incentives?.globalTotalClaimed ?? 0) / 1000000) * 100))}% Reached
                        </div>
                      </div>
                    </div>

                    {/* Progress slider bar */}
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-[#32FF8B] rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((incentives?.globalTotalClaimed ?? 0) / 1000000) * 100)}%` }}
                      />
                    </div>

                    {incentives?.globalTotalClaimed && incentives.globalTotalClaimed >= 1000000 ? (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                        <p className="text-[12px] font-mono text-[#32FF8B] uppercase font-bold tracking-wider font-mono">
                          🎉 LIQUIDITY UNLOCKED: FLOW Token swap is now enabled in Swap tab!
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] font-mono text-white/35 leading-relaxed text-left font-mono">
                        ⚠️ FLOW token swap/trading with BOT/USDT remains locked until the cooperative community milestone of 1,000,000 claimed tokens is unlocked by all supporters combined. Invite others to bridge or swap to speed up the launch!
                      </p>
                    )}
                  </div>

                  {/* Referral link & QR */}
                  <div className="bg-[#030E1A] border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="space-y-1 text-left">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                        Your Ambassador Dashboard
                      </h4>
                      <p className="text-[12px] text-[#C5C1B9] leading-relaxed font-mono">
                        Earn a massive <strong className="text-[#32FF8B]">20% bonus</strong> from all FLOW points generated by your invitees, plus a <strong className="text-[#32FF8B]">50 pt welcome reward</strong> on their signup.
                      </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-5 items-center justify-between text-left">
                      {/* Left: Input with link & statistics */}
                      <div className="w-full flex-1 space-y-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-mono text-[#C5C1B9] uppercase block tracking-wider font-mono">
                            Direct Invite Link
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={incentives?.referralCode ? `${window.location.origin}/?ref=${incentives.referralCode}` : ""}
                              className="flex-1 bg-[#010C1B] border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const refLinkStr = incentives?.referralCode ? `${window.location.origin}/?ref=${incentives.referralCode}` : "";
                                navigator.clipboard.writeText(refLinkStr);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="px-3 py-2 bg-[#0D1C2A] border border-white/10 rounded-xl text-sm hover:border-[#32FF8B]/30 hover:bg-white/5 transition-colors cursor-pointer font-mono"
                            >
                              {copied ? <Check className="w-3.5 h-3.5 text-[#32FF8B]" /> : <Copy className="w-3.5 h-3.5 text-[#C5C1B9]" />}
                            </button>
                          </div>
                        </div>

                        {/* Referral stats banner */}
                        <div className="p-3 bg-[#0D1C2A]/20 border border-white/5 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="text-sm font-mono font-black text-white">
                              {incentives?.inviteCount ?? 0}
                            </div>
                            <div className="text-[10px] font-mono text-[#C5C1B9] uppercase font-mono">Successful Invites</div>
                          </div>
                          <div className="h-6 w-px bg-white/10" />
                          <div className="space-y-0.5">
                            <div className="text-sm font-mono font-black text-[#32FF8B]">
                              {incentives?.referralCode ?? "---"}
                            </div>
                            <div className="text-[10px] font-mono text-[#C5C1B9] uppercase font-mono">Your Invite Code</div>
                          </div>
                        </div>
                      </div>

                      {/* Right: QR Code rendering using safe QRServer API */}
                      {incentives?.referralCode && (
                        <div className="shrink-0 flex flex-col items-center gap-2 p-3 bg-[#010C1B] border border-white/10 rounded-2xl w-full sm:w-auto">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(`${window.location.origin}/?ref=${incentives.referralCode}`)}&color=32ff8b&bgcolor=010c1b`}
                            alt="Referral Link QR Code"
                            className="w-28 h-28 border border-[#32FF8B]/10 rounded-lg bg-[#010C1B]"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-[10px] font-mono text-white/40 uppercase font-black tracking-widest font-mono">
                            Scan Invite QR
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Anti-exploitation summary */}
                  <div className="bg-[#0D1C2A]/20 border border-white/5 rounded-2xl p-4.5 space-y-2 text-left">
                    <h5 className="text-[11px] font-mono font-black uppercase text-[#32FF8B] tracking-wider font-mono">
                      🛡️ Rewards System Policy & Protections
                    </h5>
                    <ul className="list-disc pl-4 text-[9.5px] font-mono text-[#C5C1B9]/70 space-y-1.5 leading-relaxed font-mono">
                      <li><strong>100% Trading Rewards</strong>: Earn 100% of your swap and bridge volume as off-chain FLOW points based on $1 equivalent (e.g. trading $250 equals 250 FLOW points).</li>
                      <li><strong>20% Ambassador Bonus</strong>: Earn 20% of all FLOW points generated recursively by your invitees (with no reduction to their own earnings).</li>
                      <li><strong>Minimum Swap/Bridge Volume</strong>: Only transactions with a minimum calculated value of $5.00 earn FLOW points.</li>
                      <li><strong>Daily Rolling Cap</strong>: Users can earn a maximum of 5,000 points per rolling 24-hour period.</li>
                      <li><strong>Cryptographic Authorization</strong>: Swaps and bridge events must be signed on-chain to verify wallet and transaction records.</li>
                      <li><strong>Self-Referral Guard</strong>: Referrals of your own secondary accounts are filtered.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dynamic Footer credits block */}
        <div className="bg-[#010C1B] p-4.5 border-t border-white/5 text-center text-[#C5C1B9]/65 text-[11px] tracking-wide uppercase font-mono">
          Decentralized Community Project • Supporting Open Learning & Growth
        </div>
      </div>
    </div>
  );
}
