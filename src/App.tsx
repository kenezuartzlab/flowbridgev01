import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance, useReadContract, useWriteContract, useSwitchChain, useChainId, useSendTransaction, usePublicClient } from 'wagmi';

import { formatUnits, parseUnits, encodePacked, encodeAbiParameters, createPublicClient, http } from 'viem';
import { injected } from 'wagmi/connectors';
import { botTestnet, bscTestnet, botMainnet, bscMainnet } from './lib/wagmi';
import { getContracts, ERC20_ABI, UNISWAP_V2_ROUTER_ABI, CASWAP_ROUTER_ABI, COMMUNITY_FEE_RECIPIENT, FLOWBRIDGE_ROUTER_ABI, FLOW_BRIDGE_ROUTER_V3_ABI, UNISWAP_V3_POOL_ABI, UNISWAP_V3_ROUTER_ABI, UNIVERSAL_ROUTER_ABI } from './lib/contracts';
import { AppHeader } from './lib/layout/AppHeader';
import { RouteTabs, TabId } from './components/routetabs/RouteTabs';
import { RouteProgress } from './components/routetabs/RouteProgress';
import { SwapCard } from './components/routetabs/SwapCard';
import { UniversalSwapCard } from './components/routetabs/swap/UniversalSwapCard';
import { LimitOrderCard } from './components/routetabs/limit/LimitOrderCard';
import { BridgeCard } from './components/routetabs/BridgeCard';
import { WarningPanel } from './components/routetabs/WarningPanel';
import { getLocalSession, saveLocalSession, RouteSession } from './store/routeSession';
import { initAuth, googleSignIn, logout as googleLogout, getIdToken } from './lib/auth';
import { LogOut, Database, Gift } from 'lucide-react';
import { cn } from './lib/utils';
import { ConfirmSwapModal } from './modals/ConfirmSwapModal';
import { WaitingModal } from './modals/WaitingModal';
import { ReceiptModal } from './modals/ReceiptModal';
import { DonateModal } from './modals/DonateModal';
import { RouteModal } from './modals/RouteModal';
import { LedgerHistoryModal } from './modals/LedgerHistoryModal';
import { ConnectGuideModal } from './modals/ConnectGuideModal';
import { ConfirmDestinationModal } from './modals/ConfirmDestinationModal';
import { RealtimeBridgeTrackerModal } from './modals/RealtimeBridgeTrackerModal';

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Google Authentication States
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchUserIncentivesInApp = async () => {
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
        setGlobalTotalClaimed(data.incentives.globalTotalClaimed || 0);
      }
    } catch (e) {
      console.error("Failed to load user incentives:", e);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const res = await fetch('/api/incentives/global');
      const data = await res.json();
      if (data.success && data.stats) {
        setGlobalTotalClaimed(data.stats.globalTotalClaimed || 0);
      }
    } catch (e) {
      console.error("Failed to load global stats:", e);
    }
  };

  // Initialize Auth listener on start and capture referral parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      sessionStorage.setItem('flowbridge_referred_by', refCode);
      console.log("Captured referral code from invitation URL:", refCode);
    }

    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );
    fetchGlobalStats();
    return () => unsubscribe();
  }, []);

  // Cloud SQL Persistence States
  const [dbTransactions, setDbTransactions] = useState<any[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isDonateModalOpen, setIsDonateModalOpen] = useState<boolean>(false);
  const [donateModalInitialTab, setDonateModalInitialTab] = useState<'donate' | 'feedback' | 'incentives'>('donate');
  const [isConnectGuideOpen, setIsConnectGuideOpen] = useState<boolean>(false);

  // Helper to obtain token (gets mock token if demo bypass is active)
  const getEffectiveIdToken = async (): Promise<string | null> => {
    if (googleUser && googleUser.isDemo) {
      return `sandbox-token-${googleUser.email}`;
    }
    return await getIdToken();
  };

  // Synchronize authenticated user profile to Cloud SQL with optional referral link
  const syncUserWithDb = async () => {
    try {
      const token = await getEffectiveIdToken();
      if (!token) return;
      
      const referredByCode = sessionStorage.getItem('flowbridge_referred_by') || undefined;
      
      const response = await fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ referredByCode })
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Logged in profile synchronized:", data.user);
        
        if (referredByCode) {
          sessionStorage.removeItem('flowbridge_referred_by');
        }
        
        fetchDbTransactions(token);
        fetchUserIncentivesInApp();
      }
    } catch (err) {
      console.error("Error synchronizing profile with database:", err);
    }
  };

  // Retrieve transaction history logs from Cloud SQL DB
  const fetchDbTransactions = async (token: string) => {
    try {
      const response = await fetch('/api/transactions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDbTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
  };

  // Log a new transaction to Cloud SQL DB
  const logTransactionToDb = async (txType: string, direction: string, fromAmount: string, toAmount: string, txHash: string, status: string) => {
    if (!googleUser) return;
    try {
      const token = await getEffectiveIdToken();
      if (!token) return;
      
      await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          txType,
          direction,
          fromAmount,
          toAmount,
          txHash,
          status
        })
      });
      
      fetchDbTransactions(token);
      fetchUserIncentivesInApp();
    } catch (err) {
      console.error("Failed to log transaction to db:", err);
    }
  };

  // Sync profile when Google user logs in
  useEffect(() => {
    if (googleUser) {
      syncUserWithDb();
    } else {
      setDbTransactions([]);
    }
  }, [googleUser]);

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError(err.message || 'Google Auth failed');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSandboxSignIn = () => {
    setGoogleUser({
      uid: 'sandbox-explorer',
      email: 'sandbox.user@ecosurge.demo',
      displayName: 'Sandbox Explorer',
      photoURL: null,
      isDemo: true
    });
  };

  const handleGoogleLogout = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      if (googleUser?.isDemo) {
        setGoogleUser(null);
      } else {
        await googleLogout();
        setGoogleUser(null);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign out');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Environment and Mode states
  const [isMainnet, setIsMainnet] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Live market prices in USD from BDEX public price API (mainnet only).
  // Keyed by lowercase token address. Falls back to on-chain math when absent.
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isMainnet || isDemoMode) return;
    const c = getContracts(true);
    const tokens = [
      c.wbot.toLowerCase(),
      c.caToken.toLowerCase(),
      c.usdtBot.toLowerCase(),
    ];
    let cancelled = false;
    const fetchPrices = async () => {
      try {
        const results = await Promise.all(
          tokens.map(async (t) => {
            try {
              const r = await fetch(`https://dex-wallet.botchain.ai/api/v1/price?token=${t}&pool_type=all`);
              const j = await r.json();
              const p = parseFloat(j?.data?.price ?? '');
              return [t, isFinite(p) ? p : NaN] as const;
            } catch { return [t, NaN] as const; }
          })
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const [t, p] of results) if (isFinite(p) && p > 0) next[t] = p;
        setMarketPrices(next);
      } catch (e) { /* ignore */ }
    };
    fetchPrices();
    const id = setInterval(fetchPrices, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isMainnet, isDemoMode]);

  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('fb_presentation_mode') === '1'; } catch { return false; }
  });
  const handleTogglePresentationMode = () => {
    setIsPresentationMode((prev) => {
      const next = !prev;
      try { window.localStorage.setItem('fb_presentation_mode', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const [session, setSession] = useState<RouteSession>(getLocalSession());
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (session.step1.status !== 'done') return 'CA/BOT';
    if (session.step2.status !== 'done') return 'BOT/USDT';
    return 'BRIDGE';
  });

  // Admin-only gate for the LIMIT tab (still experimental, kept private)
  const isLimitAdmin = googleUser?.email?.toLowerCase() === 'kenezuartzlab@gmail.com';
  useEffect(() => {
    if (activeTab === 'LIMIT' && !isLimitAdmin) setActiveTab('BOT/USDT');
  }, [activeTab, isLimitAdmin]);

  // Form states
  const [caAmount, setCaAmount] = useState('');
  const [botAmount, setBotAmount] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');

  // Directions
  const [caToBotDirection, setCaToBotDirection] = useState<'CA_TO_BOT' | 'BOT_TO_CA'>('CA_TO_BOT');
  const [botToUsdtDirection, setBotToUsdtDirection] = useState<'BOT_TO_USDT' | 'USDT_TO_BOT'>('BOT_TO_USDT');
  const [bridgeDirection, setBridgeDirection] = useState<'BOT_TO_BNB' | 'BNB_TO_BOT'>('BOT_TO_BNB');

  // Bohr DEX Aggregator Pro states
  const [selectedPair, setSelectedPair] = useState<string>('BOT/USDT');
  const [isPairReversed, setIsPairReversed] = useState<boolean>(false);
  const [globalTotalClaimed, setGlobalTotalClaimed] = useState<number>(0);
  const [incentives, setIncentives] = useState<any>(null);

  // UX Transaction States
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionStep, setActionStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletLinkNotice, setWalletLinkNotice] = useState<
    | { kind: "signin-needed"; emailHint: string }
    | { kind: "mismatch"; emailHint: string }
    | { kind: "linked" }
    | null
  >(null);

  // Premium Modal Interactivity States
  const [activeConfirmModal, setActiveConfirmModal] = useState<'CA/BOT' | 'BOT/USDT' | 'BRIDGE' | null>(null);
  const [isWaitingModalOpen, setIsWaitingModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptTxHash, setReceiptTxHash] = useState('');
  const [receiptUrlPrefix, setReceiptUrlPrefix] = useState('');
  const [receiptTxType, setReceiptTxType] = useState<'swap' | 'bridge'>('swap');
  const [receiptStatus, setReceiptStatus] = useState<'success' | 'failed'>('success');
  const [universalSwapInfo, setUniversalSwapInfo] = useState<{
    fromAmount: string; fromSymbol: string; toAmount: string; toSymbol: string;
  } | null>(null);
  const [activeRouteModal, setActiveRouteModal] = useState<{ from: string; to: string } | null>(null);

  // Premium Destination Address & Tracker Modal States
  const [customDestinationAddress, setCustomDestinationAddress] = useState<string>('');
  const [isConfirmDestinationOpen, setIsConfirmDestinationOpen] = useState(false);
  const [isRealtimeTrackerOpen, setIsRealtimeTrackerOpen] = useState(false);
  const [trackerRecipientAddress, setTrackerRecipientAddress] = useState<string>('');

  // Populate default destination address from wallet address
  useEffect(() => {
    if (address && !customDestinationAddress) {
      setCustomDestinationAddress(address);
    }
  }, [address]);

  // When a wallet connects, check if it's already bound to a registered
  // account so the user can be guided back into the linked email (instead of
  // earning points/referrals on an unlinked session). Privacy-safe: the
  // public endpoint returns only a masked email hint.
  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !address) {
      setWalletLinkNotice(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/public/wallet-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          bound?: boolean;
          userId?: string;
          emailHint?: string;
        };
        if (cancelled) return;
        if (!data.bound) {
          setWalletLinkNotice(null);
          return;
        }
        if (!googleUser) {
          setWalletLinkNotice({ kind: "signin-needed", emailHint: data.emailHint ?? "" });
        } else if (data.userId && data.userId !== googleUser.uid) {
          setWalletLinkNotice({ kind: "mismatch", emailHint: data.emailHint ?? "" });
        } else {
          setWalletLinkNotice({ kind: "linked" });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, googleUser?.uid]);



  // Load contract registry
  const contracts = getContracts(isMainnet);

  // Standard Wagmi Write Hooks
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  // On-Chain Reads (Cached balances)
  const currentBotChainId = isMainnet ? 677 : 968;
  const currentBscChainId = isMainnet ? 56 : 97;
  const botPublicClient = usePublicClient({ chainId: currentBotChainId });

  // 1. Native BOT balance
  const { data: botBalance, refetch: refetchBotBalance } = useBalance({
    address,
    chainId: currentBotChainId
  });

  // 2. Native BNB balance (on BSC)
  const { data: bnbBalance, refetch: refetchBnbBalance } = useBalance({
    address,
    chainId: currentBscChainId
  });

  // 3. CA Token balance (on BOT Chain)
  const { data: rawCaBalance, refetch: refetchCaBalance } = useReadContract({
    address: contracts.caToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address }
  });

  // 4. USDT Token balance (on BOT Chain)
  const { data: rawUsdtBotBalance, refetch: refetchUsdtBotBalance } = useReadContract({
    address: contracts.usdtBot as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address }
  });

  // 5. USDT Token balance (on BNB Chain)
  const { data: rawUsdtBnbBalance, refetch: refetchUsdtBnbBalance } = useReadContract({
    address: contracts.usdtBnb as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: currentBscChainId,
    query: { enabled: !!address }
  });

  // Allowance Reads
  const { data: rawCaAllowance, refetch: refetchCaAllowance } = useReadContract({
    address: contracts.caToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, contracts.caSwapRouter as `0x${string}`] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address && !isDemoMode }
  });

  const { data: rawUsdtBotSwapAllowance, refetch: refetchUsdtBotSwapAllowance } = useReadContract({
    address: contracts.usdtBot as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, contracts.bdexRouter as `0x${string}`] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address && !isDemoMode }
  });

  const { data: rawUsdtBotBridgeAllowance, refetch: refetchUsdtBotBridgeAllowance } = useReadContract({
    address: contracts.usdtBot as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, contracts.botBridgeProxy as `0x${string}`] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address && !isDemoMode }
  });

  const { data: rawUsdtBotFlowRouterAllowance, refetch: refetchUsdtBotFlowRouterAllowance } = useReadContract({
    address: contracts.usdtBot as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, contracts.flowBridgeRouterV3 as `0x${string}`] : undefined,
    chainId: currentBotChainId,
    query: { enabled: !!address && !isDemoMode }
  });

  const { data: rawUsdtBnbBridgeAllowance, refetch: refetchUsdtBnbBridgeAllowance } = useReadContract({
    address: contracts.usdtBnb as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, contracts.bnbBridgeProxy as `0x${string}`] : undefined,
    chainId: currentBscChainId,
    query: { enabled: !!address && !isDemoMode }
  });

  // Safe parsers for inputs to calculate live pool quotes
  const safeParseCaAmount = () => {
    try {
      if (!caAmount || isNaN(parseFloat(caAmount)) || parseFloat(caAmount) <= 0) return 0n;
      return parseUnits(caAmount, 18);
    } catch {
      return 0n;
    }
  };

  const safeParseBotAmount = () => {
    try {
      if (!botAmount || isNaN(parseFloat(botAmount)) || parseFloat(botAmount) <= 0) return 0n;
      // BOT is 18 decimals, USDT BOT is 6 decimals
      const decs = botToUsdtDirection === 'BOT_TO_USDT' ? 18 : 6;
      return parseUnits(botAmount, decs);
    } catch {
      return 0n;
    }
  };

  const caToBotPath = caToBotDirection === 'CA_TO_BOT'
    ? [contracts.caToken as `0x${string}`, contracts.caWbot as `0x${string}`] as const
    : [contracts.caWbot as `0x${string}`, contracts.caToken as `0x${string}`] as const;

  const botToUsdtPath = botToUsdtDirection === 'BOT_TO_USDT'
    ? [contracts.wbot as `0x${string}`, contracts.usdtBot as `0x${string}`] as const
    : [contracts.usdtBot as `0x${string}`, contracts.wbot as `0x${string}`] as const;

  // Live pool quotes reads from CaryPact caSwapRouter
  const { data: rawCaToBotQuote, refetch: refetchCaToBotQuote } = useReadContract({
    address: contracts.caSwapRouter as `0x${string}`,
    abi: CASWAP_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: safeParseCaAmount() > 0n ? [safeParseCaAmount(), caToBotPath] as const : undefined,
    chainId: currentBotChainId,
    query: { enabled: !isDemoMode && safeParseCaAmount() > 0n }
  });

  // 6. Uniswap V3 Pool slot0 read (for real-time high liquidity pool quotes)
  const { data: rawV3PoolSlot0, refetch: refetchV3PoolSlot0 } = useReadContract({
    address: contracts.usdtBotPoolV3 as `0x${string}`,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: 'slot0',
    chainId: currentBotChainId,
    query: { enabled: !isDemoMode }
  });

  // 7. Uniswap V3 Pool fee read
  const { data: rawV3PoolFee, refetch: refetchV3PoolFee } = useReadContract({
    address: contracts.usdtBotPoolV3 as `0x${string}`,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: 'fee',
    chainId: currentBotChainId,
    query: { enabled: !isDemoMode }
  });

  const { data: rawLiveCaToBotQuote, refetch: refetchLiveCaToBotQuote } = useReadContract({
    address: contracts.caSwapRouter as `0x${string}`,
    abi: CASWAP_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [1000000000000000000n, [contracts.caToken as `0x${string}`, contracts.caWbot as `0x${string}`] as const] as const,
    chainId: currentBotChainId,
    query: { enabled: !isDemoMode }
  });

  // Refetch balances helper
  const refreshAllBalances = async () => {
    refetchBotBalance();
    refetchBnbBalance();
    refetchCaBalance();
    refetchUsdtBotBalance();
    refetchUsdtBnbBalance();
    refetchCaAllowance();
    refetchUsdtBotSwapAllowance();
    refetchUsdtBotBridgeAllowance();
    refetchUsdtBnbBridgeAllowance();
    try {
      refetchCaToBotQuote();
      refetchV3PoolSlot0();
      refetchV3PoolFee();
      refetchLiveCaToBotQuote();
    } catch (e) {
      // safe fallback
    }
  };

  useEffect(() => {
    if (isConnected) {
      refreshAllBalances();
    }
  }, [address, isConnected, isMainnet]);

  // Save session to localStorage when it changes
  useEffect(() => {
    saveLocalSession(session);
  }, [session]);

  const updateSession = async (updates: Partial<RouteSession>) => {
    const newSession = { ...session, ...updates };
    setSession(newSession);
  };

  const handleConnect = async () => {
    // Open the step-by-step secure google + wallet authentication dialog
    setIsConnectGuideOpen(true);
  };

  const handleDisconnect = async () => {
    disconnect();
    try {
      if (googleUser) {
        await handleGoogleLogout();
      }
    } catch (err) {
      console.error("Auto Google logout on disconnect error:", err);
    }
  };

  const handleToggleMainnet = () => {
    setIsMainnet(prev => !prev);
    setErrorMessage(null);
  };

  const handleToggleDemoMode = () => {
    setIsDemoMode(prev => !prev);
    setErrorMessage(null);
  };

  const handleToggleCaBot = () => {
    setCaToBotDirection(prev => prev === 'CA_TO_BOT' ? 'BOT_TO_CA' : 'CA_TO_BOT');
    setCaAmount('');
    setErrorMessage(null);
  };

  const handleToggleBotUsdt = () => {
    setBotToUsdtDirection(prev => prev === 'BOT_TO_USDT' ? 'USDT_TO_BOT' : 'BOT_TO_USDT');
    setBotAmount('');
    setErrorMessage(null);
  };

  const handleToggleDynamicSwap = () => {
    setIsPairReversed(prev => !prev);
    // Keep contract-side direction in sync with UI for the BOT/USDT pair
    setBotToUsdtDirection(prev => prev === 'BOT_TO_USDT' ? 'USDT_TO_BOT' : 'BOT_TO_USDT');
    setBotAmount('');
    setErrorMessage(null);
  };

  const handleToggleBridge = () => {
    setBridgeDirection(prev => prev === 'BOT_TO_BNB' ? 'BNB_TO_BOT' : 'BOT_TO_BNB');
    setUsdtAmount('');
    setErrorMessage(null);
  };

  const resetStep1 = () => {
    const updated = {
      ...session,
      step1: { step_id: 'ca_bot', status: 'pending' as const }
    };
    setSession(updated);
    saveLocalSession(updated);
    setCaAmount('');
    setErrorMessage(null);
  };

  const resetStep2 = () => {
    const updated = {
      ...session,
      step2: { step_id: 'bot_usdt', status: 'pending' as const }
    };
    setSession(updated);
    saveLocalSession(updated);
    setBotAmount('');
    setErrorMessage(null);
  };

  const resetStep3 = () => {
    const updated = {
      ...session,
      step3: { step_id: 'bridge_usdt', status: 'pending' as const }
    };
    setSession(updated);
    saveLocalSession(updated);
    setUsdtAmount('');
    setErrorMessage(null);
  };

  const resetAllSteps = () => {
    const updated = {
      step1: { step_id: 'ca_bot', status: 'pending' as const },
      step2: { step_id: 'bot_usdt', status: 'pending' as const },
      step3: { step_id: 'bridge_usdt', status: 'pending' as const }
    };
    setSession(updated);
    saveLocalSession(updated);
    setCaAmount('');
    setBotAmount('');
    setUsdtAmount('');
    setErrorMessage(null);
  };

  // Determine needed chain based on active screen and directions
  const targetChainIdForTab = (): number => {
    if (activeTab === 'CA/BOT' || activeTab === 'BOT/USDT' || activeTab === 'LIMIT') {
      return isMainnet ? 677 : 968; // BOT Chain
    } else {
      // BRIDGE tab
      return bridgeDirection === 'BOT_TO_BNB'
        ? (isMainnet ? 677 : 968) // BOT Chain
        : (isMainnet ? 56 : 97);  // BNB Chain
    }
  };

  const getChainForId = (chainId: number) => {
    if (chainId === 677) return botMainnet;
    if (chainId === 968) return botTestnet;
    if (chainId === 56) return bscMainnet;
    return bscTestnet;
  };

  const getExplorerPrefixForChain = (chainId: number) => {
    if (chainId === 677) return 'https://scan.botchain.ai/tx/';
    if (chainId === 968) return 'https://scan.bohr.life/tx/';
    if (chainId === 56) return 'https://bscscan.com/tx/';
    return 'https://testnet.bscscan.com/tx/';
  };

  const waitForFinalReceipt = async (txHash: `0x${string}`, chainId: number) => {
    const client = createPublicClient({
      chain: getChainForId(chainId),
      transport: http()
    });
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      pollingInterval: 2_000,
      timeout: 120_000
    });
    if (receipt.status !== 'success') {
      const finalError = new Error('Final blockchain confirmation failed: the transaction was mined but reverted.');
      (finalError as any).finalReceiptStatus = 'failed';
      throw finalError;
    }
    return receipt;
  };

  const confirmAndShowReceipt = async (
    txHash: `0x${string}`,
    chainId: number,
    txType: 'swap' | 'bridge'
  ) => {
    setActionStep('confirming_chain');
    setReceiptTxHash(txHash);
    setReceiptUrlPrefix(getExplorerPrefixForChain(chainId));
    setReceiptTxType(txType);
    try {
      await waitForFinalReceipt(txHash, chainId);
      setReceiptStatus('success');
      setIsWaitingModalOpen(false);
      setIsReceiptModalOpen(true);
      return true;
    } catch (err: any) {
      if (err?.finalReceiptStatus === 'failed') {
        setReceiptStatus('failed');
        setIsWaitingModalOpen(false);
        setIsReceiptModalOpen(true);
        return false;
      }
      throw err;
    }
  };

  const isNetworkCorrect = !isConnected || currentChainId === targetChainIdForTab();

  const handleSwitchNetwork = async () => {
    try {
      setErrorMessage(null);
      await switchChain({ chainId: targetChainIdForTab() });
    } catch (err: any) {
      setErrorMessage(`Failed to switch network: ${err.message || err}`);
    }
  };

  // Helper to safely clean up and format on-chain errors
  const cleanError = (err: any): string => {
    if (!err) return "An unknown on-chain error occurred.";
    if (typeof err === 'string') return err;
    
    // Check various common error parameters safely to prevent TypeError
    const rawMsg = err.shortMessage || err.message || "";
    
    // If we have gas limit warnings or zero gas returns
    if (rawMsg.includes("gasLimit") || rawMsg.includes("gas limit") || rawMsg.includes("given 0")) {
      return "Transaction failed because the wallet's gas estimation failed (need at least 22952 gas). This usually means you have insufficient native BOT/BNB gas to pay for transaction fees, or the slippage limit was triggered. Try swapping a smaller/standard amount, or click 'Switch to Sandbox Simulation' to test risk-free.";
    }
    
    if (rawMsg.includes("user rejected") || rawMsg.includes("User rejected") || rawMsg.includes("User denied")) {
      return "The transaction request was rejected in your wallet.";
    }

    if (rawMsg.includes("TRANSFER_FROM_FAILED")) {
      return "Swap failed on-chain because the router could not pull the token amount. I tightened Max to use the exact wallet balance instead of the rounded display balance; try Max again after balances refresh.";
    }

    // Strip any nested JSON string messages that cause messy displays
    try {
      if (rawMsg.includes('{"error":')) {
        const matches = rawMsg.match(/{"error":\s*"(.*?)"}/);
        if (matches && matches[1]) {
          return `Signer Error: ${matches[1]}`;
        }
      }
    } catch (e) {
      // safe fallback
    }

    return rawMsg;
  };

  // Live and simulated swap step logic
  const completeStep1 = async () => {
    setErrorMessage(null);
    const amountVal = parseFloat(caAmount);
    if (!amountVal || amountVal <= 0) return;

    if (isDemoMode) {
      // Simulation mode
      setActionStep('approving_ca');
      setIsActionLoading(true);
      await new Promise(r => setTimeout(r, 1200));
      setActionStep('swapping_ca');
      await new Promise(r => setTimeout(r, 1600));
      const simulatedHash = `0x${Math.random().toString(16).slice(2, 42)}`;
      await updateSession({
        step1: { ...session.step1, status: 'done', tx_hash: simulatedHash, timestamp: Date.now() }
      });
      logTransactionToDb('SWAP', caToBotDirection, caAmount, botAmount || '0', simulatedHash, 'SUCCESS');
      setIsActionLoading(false);
      
      // Open Success Notification Modal
      setReceiptTxHash(simulatedHash);
      setReceiptUrlPrefix(isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/');
      setIsWaitingModalOpen(false);
      setReceiptTxType('swap');
      setReceiptStatus('success');
      setIsReceiptModalOpen(true);
    } else {
      // Real Blockchain Mode
      try {
        setIsActionLoading(true);
        const parsedAmount = parseUnits(caAmount, 18);

        if (caToBotDirection === 'CA_TO_BOT') {
          // 1. Check Allowance
          const allowance = rawCaAllowance ? BigInt(rawCaAllowance.toString()) : 0n;
          if (allowance < parsedAmount) {
            setActionStep('approving_ca');
            await writeContractAsync({
              address: contracts.caToken as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [contracts.caSwapRouter as `0x${string}`, parsedAmount],
              chainId: targetChainIdForTab(),
              gas: 150000n // Bypass zero gas limit estimation errors
            } as any);
            await new Promise(r => setTimeout(r, 3000)); // wait for propagation
            refetchCaAllowance();
          }

          // 2. Execute Swap CA -> BOT (Direct CaryPact swap)
          setActionStep('swapping_ca');
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          const txSwap = await writeContractAsync({
            address: contracts.caSwapRouter as `0x${string}`,
            abi: CASWAP_ROUTER_ABI,
            functionName: 'swapExactTokensForETH',
            args: [
              parsedAmount, 
              0n, // amountOutMin
              [contracts.caToken as `0x${string}`, contracts.caWbot as `0x${string}`], 
              address as `0x${string}`, 
              deadline
            ],
            chainId: targetChainIdForTab(),
            gas: 350000n // Ensure higher gas limit for swaps
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txSwap, targetChainIdForTab(), 'swap');
          if (!finalConfirmed) return;

          await updateSession({
            step1: { ...session.step1, status: 'done', tx_hash: txSwap, timestamp: Date.now() }
          });
          logTransactionToDb('SWAP', caToBotDirection, caAmount, botAmount || '0', txSwap, 'SUCCESS');
        } else {
          // Swap BOT -> CA: Native BOT is sent (requires no approvals)
          setActionStep('swapping_ca');
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          const txSwap = await writeContractAsync({
            address: contracts.caSwapRouter as `0x${string}`,
            abi: CASWAP_ROUTER_ABI,
            functionName: 'swapExactETHForTokens',
            args: [
              0n, // amountOutMin
              [contracts.caWbot as `0x${string}`, contracts.caToken as `0x${string}`], 
              address as `0x${string}`, 
              deadline
            ],
            value: parsedAmount,
            chainId: targetChainIdForTab(),
            gas: 350000n
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txSwap, targetChainIdForTab(), 'swap');
          if (!finalConfirmed) return;

          await updateSession({
            step1: { ...session.step1, status: 'done', tx_hash: txSwap, timestamp: Date.now() }
          });
          logTransactionToDb('SWAP', caToBotDirection, caAmount, botAmount || '0', txSwap, 'SUCCESS');
        }
      } catch (err: any) {
        setErrorMessage(cleanError(err));
        setIsWaitingModalOpen(false);
      } finally {
        setIsActionLoading(false);
        refreshAllBalances();
      }
    }
  };

  const completeStep2 = async () => {
    setErrorMessage(null);
    const amountVal = parseFloat(botAmount);
    if (!amountVal || amountVal <= 0) return;

    if (isDemoMode || selectedPair !== 'BOT/USDT') {
      setActionStep('swapping_bot');
      setIsActionLoading(true);
      await new Promise(r => setTimeout(r, 1800));
      const simulatedHash = `0x${Math.random().toString(16).slice(2, 42)}`;
      await updateSession({
        step2: { ...session.step2, status: 'done', tx_hash: simulatedHash, timestamp: Date.now() }
      });
      
      const receiveAmt = getActiveSwapQuote();
      logTransactionToDb('SWAP', `${paySymbol}_TO_${recSymbol}`, botAmount, receiveAmt || '0', simulatedHash, 'SUCCESS');
      setIsActionLoading(false);
      
      // TRIGGER RECEIPT
      setReceiptTxHash(simulatedHash);
      setReceiptUrlPrefix(isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/');
      setIsWaitingModalOpen(false);
      setReceiptTxType('swap');
      setReceiptStatus('success');
      setIsReceiptModalOpen(true);
      
      // Fetch fresh points instantly
      setTimeout(() => {
        fetchUserIncentivesInApp();
      }, 1000);
    } else {
      try {
        setIsActionLoading(true);
        setActionStep('swapping_bot');
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        const feePool = rawV3PoolFee ? Number(rawV3PoolFee) : 3000;

        if (botToUsdtDirection === 'BOT_TO_USDT') {
          // Native BOT -> USDT (Uniswap V3 swap via bdexRouter Universal Router execute)
          const parsedAmount = parseUnits(botAmount, 18);
          const path = encodePacked(
            ['address', 'uint24', 'address'],
            [contracts.wbot as `0x${string}`, feePool, contracts.usdtBot as `0x${string}`]
          );

          const wrapInput = encodeAbiParameters(
            [{ type: 'address' }, { type: 'uint256' }],
            ['0x0000000000000000000000000000000000000002', parsedAmount]
          );

          const swapInput = encodeAbiParameters(
            [
              { type: 'address' },
              { type: 'uint256' },
              { type: 'uint256' },
              { type: 'bytes' },
              { type: 'bool' }
            ],
            [
              address as `0x${string}`,
              parsedAmount,
              0n,
              path,
              false
            ]
          );

          setActionStep('swapping_bot');
          const txSwap = await writeContractAsync({
            address: contracts.bdexRouter as `0x${string}`,
            abi: UNIVERSAL_ROUTER_ABI,
            functionName: 'execute',
            args: [
              '0x0b00', // WRAP_ETH then V3_SWAP_EXACT_IN
              [wrapInput, swapInput],
              deadline
            ],
            value: parsedAmount,
            chainId: targetChainIdForTab(),
            gas: 350000n
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txSwap, targetChainIdForTab(), 'swap');
          if (!finalConfirmed) return;

          await updateSession({
            step2: { ...session.step2, status: 'done', tx_hash: txSwap, timestamp: Date.now() }
          });
          logTransactionToDb('SWAP', botToUsdtDirection, botAmount, usdtAmount || '0', txSwap, 'SUCCESS');
        } else {
          // USDT -> BOT Swapping (Uniswap V3 swap via bdexRouter Universal Router execute)
          const parsedAmount = parseUnits(botAmount, 6); // USDT on BOT chain is 6 decimals

          // Check allowance
          const allowance = rawUsdtBotSwapAllowance ? BigInt(rawUsdtBotSwapAllowance.toString()) : 0n;
          if (allowance < parsedAmount) {
            setActionStep('approving_bot');
            const txApprove = await writeContractAsync({
              address: contracts.usdtBot as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [contracts.bdexRouter as `0x${string}`, parsedAmount],
              chainId: targetChainIdForTab(),
              gas: 150000n
            } as any);
            await waitForFinalReceipt(txApprove, targetChainIdForTab());
            refetchUsdtBotSwapAllowance();
          }

          const path = encodePacked(
            ['address', 'uint24', 'address'],
            [contracts.usdtBot as `0x${string}`, feePool, contracts.wbot as `0x${string}`]
          );

          const swapInput = encodeAbiParameters(
            [
              { type: 'address' },
              { type: 'uint256' },
              { type: 'uint256' },
              { type: 'bytes' },
              { type: 'bool' }
            ],
            [
              '0x0000000000000000000000000000000000000002' as `0x${string}`,
              parsedAmount,
              0n,
              path,
              true
            ]
          );

          const unwrapInput = encodeAbiParameters(
            [
              { type: 'address' },
              { type: 'uint256' }
            ],
            [
              address as `0x${string}`,
              0n
            ]
          );

          setActionStep('swapping_bot');
          const txSwap = await writeContractAsync({
            address: contracts.bdexRouter as `0x${string}`,
            abi: UNIVERSAL_ROUTER_ABI,
            functionName: 'execute',
            args: [
              '0x000c', // V3_SWAP_EXACT_IN then UNWRAP_WETH
              [swapInput, unwrapInput],
              deadline
            ],
            chainId: targetChainIdForTab(),
            gas: 350000n
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txSwap, targetChainIdForTab(), 'swap');
          if (!finalConfirmed) return;

          await updateSession({
            step2: { ...session.step2, status: 'done', tx_hash: txSwap, timestamp: Date.now() }
          });
          logTransactionToDb('SWAP', botToUsdtDirection, botAmount, usdtAmount || '0', txSwap, 'SUCCESS');
        }
      } catch (err: any) {
        setErrorMessage(cleanError(err));
        setIsWaitingModalOpen(false);
      } finally {
        setIsActionLoading(false);
        refreshAllBalances();
      }
    }
  };

  const completeStep3 = async (recipientParam?: string) => {
    setErrorMessage(null);
    const amountVal = parseFloat(usdtAmount);
    if (!amountVal || amountVal <= 0) return;

    const recipientAddr = recipientParam || customDestinationAddress || address || "";

    if (isDemoMode) {
      setActionStep('approving_usdt');
      setIsActionLoading(true);
      await new Promise(r => setTimeout(r, 1200));
      setActionStep('bridging_usdt');
      await new Promise(r => setTimeout(r, 2000));
      const simulatedHash = `0x${Math.random().toString(16).slice(2, 42)}`;
      await updateSession({
        step3: { ...session.step3, status: 'submitted', tx_hash: simulatedHash, timestamp: Date.now() }
      });
      logTransactionToDb('BRIDGE', bridgeDirection, usdtAmount, usdtAmount, simulatedHash, 'SUCCESS');
      setIsActionLoading(false);

      // TRIGGER RECEIPT
      setReceiptTxHash(simulatedHash);
      setReceiptUrlPrefix(bridgeDirection === 'BOT_TO_BNB' 
        ? (isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/')
        : (isMainnet ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/'));
      setIsWaitingModalOpen(false);
      setReceiptTxType('bridge');
      setReceiptStatus('success');
      setIsReceiptModalOpen(true);
    } else {
      try {
        setIsActionLoading(true);
        
        if (bridgeDirection === 'BOT_TO_BNB') {
          // USDT BOT -> USDT BNB
          // SAFETY: Always route through the direct BotBridge `deposit` so we can
          // pass an explicit `recipient` on the destination chain. FlowBridgeRouter
          // v3 `bridgeWithFee(bridgeId, token, amount)` does NOT accept a recipient
          // arg — BotBridge would see msg.sender = router contract and mint the
          // pegged USDT on BSC to the router address (unrecoverable). Re-enable the
          // v3 path only after the contract exposes a recipient parameter.
          const parsedAmount = parseUnits(usdtAmount, 6);

          const allowance = rawUsdtBotBridgeAllowance ? BigInt(rawUsdtBotBridgeAllowance.toString()) : 0n;
          if (allowance < parsedAmount) {
            setActionStep('approving_usdt');
            await writeContractAsync({
              address: contracts.usdtBot as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [contracts.botBridgeProxy as `0x${string}`, parsedAmount],
              chainId: targetChainIdForTab(),
              gas: 150000n
            } as any);
            await new Promise(r => setTimeout(r, 3000));
            refetchUsdtBotBridgeAllowance();
          }

          setActionStep('bridging_usdt');
          const resourceId = "0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d";
          const destChainIdForBridge = isMainnet ? 56n : 97n;

          const txBridge = await writeContractAsync({
            address: contracts.botBridgeProxy as `0x${string}`,
            abi: [
              {
                inputs: [
                  { internalType: "uint256", name: "destinationChainId", type: "uint256" },
                  { internalType: "bytes32", name: "resourceId", type: "bytes32" },
                  { internalType: "address", name: "recipient", type: "address" },
                  { internalType: "uint256", name: "amount", type: "uint256" }
                ],
                name: "deposit",
                outputs: [],
                stateMutability: "payable",
                type: "function"
              }
            ],
            functionName: 'deposit',
            args: [
              destChainIdForBridge,
              resourceId as `0x${string}`,
              recipientAddr as `0x${string}`,
              parsedAmount
            ],
            chainId: targetChainIdForTab(),
            gas: 1000000n
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txBridge, targetChainIdForTab(), 'bridge');
          if (!finalConfirmed) return;

          await updateSession({
            step3: { ...session.step3, status: 'submitted', tx_hash: txBridge, timestamp: Date.now() }
          });
          logTransactionToDb('BRIDGE', bridgeDirection, usdtAmount, usdtAmount, txBridge, 'SUCCESS');

        } else {
          // USDT BNB -> USDT BOT (Call deposit function on BotBridge proxy)
          const parsedAmount = parseUnits(usdtAmount, 18); // standard 18 on BSC

          // Check allowance of usdtBnb for bnbBridgeProxy
          const allowance = rawUsdtBnbBridgeAllowance ? BigInt(rawUsdtBnbBridgeAllowance.toString()) : 0n;
          if (allowance < parsedAmount) {
            setActionStep('approving_usdt');
            await writeContractAsync({
              address: contracts.usdtBnb as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [contracts.bnbBridgeProxy as `0x${string}`, parsedAmount],
              chainId: targetChainIdForTab(),
              gas: 150000n
            } as any);
            await new Promise(r => setTimeout(r, 3000));
            refetchUsdtBnbBridgeAllowance();
          }

          setActionStep('bridging_usdt');
          
          // In standard ChainBridge architectures for Bohr, custom registered tokens have a 32-byte resource ID.
          // The main stablecoin USDT maps to resource ID '0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d'
          const resourceId = "0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d";
          const destChainIdForBridge = isMainnet ? 677n : 968n;

          const txBridge = await writeContractAsync({
            address: contracts.bnbBridgeProxy as `0x${string}`,
            abi: [
              {
                inputs: [
                  { internalType: "uint256", name: "destinationChainId", type: "uint256" },
                  { internalType: "bytes32", name: "resourceId", type: "bytes32" },
                  { internalType: "address", name: "recipient", type: "address" },
                  { internalType: "uint256", name: "amount", type: "uint256" }
                ],
                name: "deposit",
                outputs: [],
                stateMutability: "payable",
                type: "function"
              }
            ],
            functionName: 'deposit',
            args: [
              destChainIdForBridge,
              resourceId as `0x${string}`,
              recipientAddr as `0x${string}`,
              parsedAmount
            ],
            chainId: targetChainIdForTab(),
            gas: 1000000n // plenty of gas to satisfy reentrancy sentry and handler subcalls
          } as any);

          const finalConfirmed = await confirmAndShowReceipt(txBridge, targetChainIdForTab(), 'bridge');
          if (!finalConfirmed) return;

          await updateSession({
            step3: { ...session.step3, status: 'submitted', tx_hash: txBridge, timestamp: Date.now() }
          });
          logTransactionToDb('BRIDGE', bridgeDirection, usdtAmount, usdtAmount, txBridge, 'SUCCESS');
        }
      } catch (err: any) {
        setErrorMessage(cleanError(err));
        setIsWaitingModalOpen(false);
      } finally {
        setIsActionLoading(false);
        refreshAllBalances();
      }
    }
  };

  // Determine button displays and loading templates
  const caPaySymbol = caToBotDirection === 'CA_TO_BOT' ? 'CA' : 'BOT';
  const caRecSymbol = caToBotDirection === 'CA_TO_BOT' ? 'BOT' : 'CA';
  let caButtonLabel = "Enter amount";
  if (!isConnected) caButtonLabel = "Connect Wallet";
  else if (!isNetworkCorrect) caButtonLabel = "Switch Chain to BOT Chain";
  else if (isActionLoading && (actionStep === 'approving_ca' || actionStep === 'swapping_ca' || actionStep === 'confirming_chain' || actionStep === 'sending_fee')) {
    caButtonLabel = actionStep === 'approving_ca' ? `Approving ${caPaySymbol}...` : actionStep === 'confirming_chain' ? 'Confirming on-chain...' : actionStep === 'sending_fee' ? 'Sending Fee (0.08%)...' : `Swapping ${caPaySymbol} to ${caRecSymbol}...`;
  }
  else if (session.step1.status === 'done' && !caAmount) caButtonLabel = "✅ Step 1 Complete - Next →";
  else if (caAmount && !isDemoMode && caToBotDirection === 'CA_TO_BOT' && rawCaAllowance !== undefined && BigInt(rawCaAllowance.toString()) < parseUnits(caAmount, 18)) {
    caButtonLabel = `Approve ${caPaySymbol}`;
  }
  else if (caAmount) caButtonLabel = `Swap ${caPaySymbol} to ${caRecSymbol}`;
  let caButtonDisabled = isActionLoading || (isConnected && !caAmount && session.step1.status !== 'done');
  
  const botPaySymbol = botToUsdtDirection === 'BOT_TO_USDT' ? 'BOT' : 'USDT';
  const botRecSymbol = botToUsdtDirection === 'BOT_TO_USDT' ? 'USDT' : 'BOT';
  let botButtonLabel = "Enter amount";
  if (!isConnected) botButtonLabel = "Connect Wallet";
  else if (!isNetworkCorrect) botButtonLabel = "Switch Chain to BOT Chain";
  else if (isActionLoading && (actionStep === 'swapping_bot' || actionStep === 'approving_bot' || actionStep === 'confirming_chain' || actionStep === 'sending_fee')) {
    botButtonLabel = actionStep === 'approving_bot' ? `Approving ${botPaySymbol}...` : actionStep === 'confirming_chain' ? 'Confirming on-chain...' : actionStep === 'sending_fee' ? 'Sending Fee (0.08%)...' : `Swapping ${botPaySymbol} to ${botRecSymbol}...`;
  }
  else if (session.step2.status === 'done' && !botAmount) botButtonLabel = "✅ Step 2 Complete - Next →";
  else if (botAmount && !isDemoMode && botToUsdtDirection === 'USDT_TO_BOT' && rawUsdtBotSwapAllowance !== undefined && BigInt(rawUsdtBotSwapAllowance.toString()) < parseUnits(botAmount, 6)) {
    botButtonLabel = `Approve ${botPaySymbol}`;
  }
  else if (botAmount) botButtonLabel = `Swap ${botPaySymbol} to ${botRecSymbol}`;
  let botButtonDisabled = isActionLoading || (isConnected && !botAmount && session.step2.status !== 'done');
  
  const bridgeFromName = bridgeDirection === 'BOT_TO_BNB' ? "BOT Chain" : "BNB Chain";
  const bridgeToName = bridgeDirection === 'BOT_TO_BNB' ? "BNB Chain" : "BOT Chain";
  let bridgeButtonLabel = "Enter amount";
  const usdtDecs = bridgeDirection === 'BOT_TO_BNB' ? 6 : 18;
  const activeBridgeAllowance = bridgeDirection === 'BOT_TO_BNB' ? rawUsdtBotBridgeAllowance : rawUsdtBnbBridgeAllowance;
  const isApprovedForBridge = isDemoMode || !usdtAmount ? true : (() => {
    if (activeBridgeAllowance === undefined) return false;
    try {
      const parsed = parseUnits(usdtAmount, usdtDecs);
      return BigInt(activeBridgeAllowance.toString()) >= parsed;
    } catch {
      return false;
    }
  })();

  if (!isConnected) bridgeButtonLabel = "Connect Wallet";
  else if (!isNetworkCorrect) bridgeButtonLabel = `Switch Chain to ${bridgeFromName}`;
  else if (isActionLoading && (actionStep === 'approving_usdt' || actionStep === 'bridging_usdt' || actionStep === 'confirming_chain' || actionStep === 'sending_fee')) {
    bridgeButtonLabel = actionStep === 'approving_usdt' ? "Approving USDT..." : actionStep === 'confirming_chain' ? 'Confirming on-chain...' : actionStep === 'sending_fee' ? 'Sending Fee (0.08%)...' : `Submitting Bridge to ${bridgeToName}...`;
  }
  else if (session.step3.status === 'submitted') bridgeButtonLabel = `Bridge Submitted ↗`;
  else if (usdtAmount && !isApprovedForBridge) bridgeButtonLabel = "Approve USDT";
  else if (usdtAmount) bridgeButtonLabel = `Bridge to ${bridgeToName}`;
  let bridgeButtonDisabled = isActionLoading || (isConnected && !usdtAmount && session.step3.status !== 'submitted');

  // Dynamic formatting for real and mock balances
  const formatBalance = (raw: any, decimals = 18) => {
    if (!raw) return "0.00";
    return parseFloat(formatUnits(BigInt(raw.toString()), decimals)).toFixed(4);
  };

  const getBalanceDisplay = (type: 'CA' | 'BOT' | 'USDT_BOT' | 'USDT_BNB') => {
    if (isDemoMode) {
      if (type === 'CA') return "100.0000";
      if (type === 'BOT') return botBalance ? parseFloat(formatUnits(botBalance.value, botBalance.decimals)).toFixed(4) : "50.0000";
      if (type === 'USDT_BOT') return "250.00";
      return "1000.00";
    }

    if (type === 'CA') return rawCaBalance ? formatBalance(rawCaBalance, 18) : "0.00";
    if (type === 'BOT') return botBalance ? parseFloat(formatUnits(botBalance.value, botBalance.decimals)).toFixed(4) : "0.00";
    if (type === 'USDT_BOT') return rawUsdtBotBalance ? formatBalance(rawUsdtBotBalance, 6) : "0.00";
    return rawUsdtBnbBalance ? formatBalance(rawUsdtBnbBalance, 18) : "0.00";
  };

  const getExactBalanceAmount = (type: 'CA' | 'BOT' | 'USDT_BOT' | 'USDT_BNB') => {
    if (isDemoMode) return getBalanceDisplay(type).replace(/\s*FLOW$/, '');
    try {
      if (type === 'CA' && rawCaBalance) return formatUnits(BigInt(rawCaBalance.toString()), 18);
      if (type === 'BOT' && botBalance) return formatUnits(botBalance.value, botBalance.decimals);
      if (type === 'USDT_BOT' && rawUsdtBotBalance) return formatUnits(BigInt(rawUsdtBotBalance.toString()), 6);
      if (type === 'USDT_BNB' && rawUsdtBnbBalance) return formatUnits(BigInt(rawUsdtBnbBalance.toString()), 18);
    } catch {
      return getBalanceDisplay(type);
    }
    return getBalanceDisplay(type);
  };

  const getLiveBotPrice = () => {
    if (isDemoMode) return 9.7482;
    // Prefer authoritative BDEX price API when available (mainnet).
    const apiPrice = marketPrices[contracts.wbot.toLowerCase()];
    if (apiPrice && isFinite(apiPrice) && apiPrice > 0) return apiPrice;
    if (rawV3PoolSlot0) {
      try {
        let sqrtPriceX96: bigint | undefined;
        if (Array.isArray(rawV3PoolSlot0)) {
          sqrtPriceX96 = BigInt(rawV3PoolSlot0[0].toString());
        } else if (typeof rawV3PoolSlot0 === 'object') {
          const slotObj = rawV3PoolSlot0 as any;
          if (slotObj.sqrtPriceX96 !== undefined) {
            sqrtPriceX96 = BigInt(slotObj.sqrtPriceX96.toString());
          } else if (slotObj[0] !== undefined) {
            sqrtPriceX96 = BigInt(slotObj[0].toString());
          }
        }
        
        if (sqrtPriceX96 && sqrtPriceX96 > 0n) {
          const numerator = (1n << 192n) * 1000000000000n * 1000000n;
          const denominator = sqrtPriceX96 * sqrtPriceX96;
          if (denominator > 0n) {
            const scaledPrice = numerator / denominator;
            return Number(scaledPrice) / 1000000;
          }
        }
      } catch (err) {
        console.error("V3 price calculation error:", err);
      }
    }
    return 9.7482;
  };

  const getLiveCaPrice = () => {
    const botPrice = getLiveBotPrice();
    if (isDemoMode) {
      return 3.12405 * botPrice;
    }
    // Prefer authoritative BDEX price API (routes CA→BOT→USDT internally).
    const apiPrice = marketPrices[contracts.caToken.toLowerCase()];
    if (apiPrice && isFinite(apiPrice) && apiPrice > 0) return apiPrice;
    if (rawLiveCaToBotQuote && Array.isArray(rawLiveCaToBotQuote) && rawLiveCaToBotQuote.length >= 2) {
      const outVal = BigInt(rawLiveCaToBotQuote[rawLiveCaToBotQuote.length - 1].toString());
      const caToBotRate = parseFloat(formatUnits(outVal, 18));
      return caToBotRate * botPrice;
    }
    return 3.12405 * botPrice;
  };


  const getCaToBotDisplayQuote = () => {
    if (!caAmount || isNaN(parseFloat(caAmount)) || parseFloat(caAmount) <= 0) return "";
    
    let rawQuoteStr = "0";
    if (isDemoMode) {
      // Sandbox fallback calculations matching CaryPact exact rate
      rawQuoteStr = caToBotDirection === 'CA_TO_BOT'
        ? (parseFloat(caAmount) * 3.12405).toString()
        : (parseFloat(caAmount) / 3.12405).toString();
    } else if (rawCaToBotQuote && Array.isArray(rawCaToBotQuote) && rawCaToBotQuote.length >= 2) {
      // Live mode using readContract data if successful
      const outputBig = BigInt(rawCaToBotQuote[rawCaToBotQuote.length - 1].toString());
      rawQuoteStr = formatUnits(outputBig, 18).toString();
    } else {
      // Fallback to CaryPact exchange rate if RPC hasn't completed or is loading
      rawQuoteStr = caToBotDirection === 'CA_TO_BOT'
        ? (parseFloat(caAmount) * 3.12405).toString()
        : (parseFloat(caAmount) / 3.12405).toString();
    }

    // No Community Builder Fee
    const finalVal = parseFloat(rawQuoteStr);
    return finalVal.toFixed(8).toString();
  };

  const getBotToUsdtDisplayQuote = () => {
    if (!botAmount || isNaN(parseFloat(botAmount)) || parseFloat(botAmount) <= 0) return "";
    
    let rawQuoteStr = "0";
    const botPrice = getLiveBotPrice();
    
    rawQuoteStr = botToUsdtDirection === 'BOT_TO_USDT'
      ? (parseFloat(botAmount) * botPrice).toString()
      : (parseFloat(botAmount) / botPrice).toString();

    // No Community Builder Fee
    const finalVal = parseFloat(rawQuoteStr);
    return finalVal.toFixed(8).toString();
  };

  const calculateBridgeReceive = (amountStr: string) => {
    if (!amountStr || isNaN(parseFloat(amountStr))) return "";
    const amt = parseFloat(amountStr);
    if (amt <= 0) return "0.00000000";
    if (bridgeDirection === 'BOT_TO_BNB') {
      return amt > 1 ? (amt - 1).toFixed(8) : "0.00000000";
    } else {
      return amt.toFixed(8);
    }
  };

  const getCaToBotDisplayUsd = (isFromField: boolean) => {
    if (!caAmount || isNaN(parseFloat(caAmount)) || parseFloat(caAmount) <= 0) return "$0.00000";
    const caPrice = getLiveCaPrice();
    const botPrice = getLiveBotPrice();
    
    if (caToBotDirection === 'CA_TO_BOT') {
      if (isFromField) {
        return `$${(parseFloat(caAmount) * caPrice).toFixed(5)}`;
      } else {
        const received = getCaToBotDisplayQuote();
        if (!received) return "$0.00000";
        return `$${(parseFloat(received) * botPrice).toFixed(5)}`;
      }
    } else {
      if (isFromField) {
        return `$${(parseFloat(caAmount) * botPrice).toFixed(5)}`;
      } else {
        const received = getCaToBotDisplayQuote();
        if (!received) return "$0.00000";
        return `$${(parseFloat(received) * caPrice).toFixed(5)}`;
      }
    }
  };

  const getBotToUsdtDisplayUsd = (isFromField: boolean) => {
    if (!botAmount || isNaN(parseFloat(botAmount)) || parseFloat(botAmount) <= 0) return "$0.00000";
    const botPrice = getLiveBotPrice();
    const usdtPrice = 1.00;
    
    if (botToUsdtDirection === 'BOT_TO_USDT') {
      if (isFromField) {
        return `$${(parseFloat(botAmount) * botPrice).toFixed(5)}`;
      } else {
        const received = getBotToUsdtDisplayQuote();
        if (!received) return "$0.00000";
        return `$${(parseFloat(received) * usdtPrice).toFixed(5)}`;
      }
    } else {
      if (isFromField) {
        return `$${(parseFloat(botAmount) * usdtPrice).toFixed(5)}`;
      } else {
        const received = getBotToUsdtDisplayQuote();
        if (!received) return "$0.00000";
        return `$${(parseFloat(received) * botPrice).toFixed(5)}`;
      }
    }
  };

  const [leftToken, rightToken] = selectedPair.split('/');
  const paySymbol = !isPairReversed ? leftToken : rightToken;
  const recSymbol = !isPairReversed ? rightToken : leftToken;

  const getTokenUsdPrice = (symbol: string) => {
    if (symbol === 'BOT') return getLiveBotPrice();
    if (symbol === 'USDT') return 1.0;
    if (symbol === 'CA') return getLiveCaPrice();
    if (symbol === 'FLOW') return 1.0;
    return 0;
  };

  const getTokenBalance = (symbol: string) => {
    if (symbol === 'BOT') return getBalanceDisplay('BOT');
    if (symbol === 'USDT') return getBalanceDisplay('USDT_BOT');
    if (symbol === 'CA') return getBalanceDisplay('CA');
    if (symbol === 'FLOW') {
      return googleUser ? `${incentives?.claimedTokens ?? 0} FLOW` : "0 FLOW";
    }
    return "0.00";
  };

  const getTokenMaxAmount = (symbol: string) => {
    if (symbol === 'BOT') return getExactBalanceAmount('BOT');
    if (symbol === 'USDT') return getExactBalanceAmount('USDT_BOT');
    if (symbol === 'CA') return getExactBalanceAmount('CA');
    return getTokenBalance(symbol).replace(/\s*FLOW$/, '');
  };

  const payBalance = getTokenBalance(paySymbol);
  const recBalance = getTokenBalance(recSymbol);

  const getActiveSwapQuote = () => {
    if (!botAmount || isNaN(parseFloat(botAmount)) || parseFloat(botAmount) <= 0) return "";
    const payPrice = getTokenUsdPrice(paySymbol);
    const recPrice = getTokenUsdPrice(recSymbol);
    if (payPrice <= 0 || recPrice <= 0) return "0.00";
    const quoteAmt = (parseFloat(botAmount) * payPrice) / recPrice;
    return quoteAmt.toFixed(8).toString();
  };

  const getActiveSwapDisplayUsd = (isFromField: boolean) => {
    if (!botAmount || isNaN(parseFloat(botAmount)) || parseFloat(botAmount) <= 0) return "$0.00000";
    const payPrice = getTokenUsdPrice(paySymbol);
    const recPrice = getTokenUsdPrice(recSymbol);
    if (isFromField) {
      return `$${(parseFloat(botAmount) * payPrice).toFixed(5)}`;
    } else {
      const quote = getActiveSwapQuote();
      if (!quote) return "$0.00000";
      return `$${(parseFloat(quote) * recPrice).toFixed(5)}`;
    }
  };

  const isFlowUnlocked = globalTotalClaimed >= 1000000;
  const isTradeLocked = (paySymbol === 'FLOW' || recSymbol === 'FLOW') && !isFlowUnlocked;

  let activeSwapButtonLabel = "Enter amount";
  if (!isConnected) activeSwapButtonLabel = "Connect Wallet";
  else if (!isNetworkCorrect) activeSwapButtonLabel = "Switch Chain to BOT Chain";
  else if (isActionLoading && (actionStep === 'swapping_bot' || actionStep === 'approving_bot' || actionStep === 'confirming_chain' || actionStep === 'sending_fee')) {
    activeSwapButtonLabel = actionStep === 'approving_bot' ? `Approving ${paySymbol}...` : actionStep === 'confirming_chain' ? 'Confirming on-chain...' : actionStep === 'sending_fee' ? 'Sending Fee (0.08%)...' : `Swapping ${paySymbol} to ${recSymbol}...`;
  }
  else if (session.step2.status === 'done' && !botAmount) activeSwapButtonLabel = "✅ Step 2 Complete - Next →";
  else if (isTradeLocked) activeSwapButtonLabel = "🔒 FLOW Trading Locked";
  else if (botAmount) activeSwapButtonLabel = `Swap ${paySymbol} to ${recSymbol}`;

  const activeSwapButtonDisabled = isActionLoading || (isConnected && !botAmount && session.step2.status !== 'done') || isTradeLocked;

  const activeTxPrefix = bridgeDirection === 'BOT_TO_BNB' 
    ? (isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/')
    : (isMainnet ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/');

  return (
    <div className={`min-h-screen bg-[#010C1B] text-white flex flex-col items-center justify-center font-sans overflow-y-auto relative py-6 sm:py-8 gap-4 ${isPresentationMode ? 'presentation-mode' : ''}`}>
      
      {/* Background grid + ambient glow of Ecosurge specification */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none animate-pulse-slow" />
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#32FF8B]/5 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[65%] h-[65%] rounded-full bg-[#00D7B2]/5 blur-[120px] pointer-events-none" />

      {/* Styled Phone/DApp Frame container matching Ecosurge Tech-Forward theme */}
      <div className="w-full sm:w-[410px] h-[100dvh] sm:h-[780px] bg-[#010C1B] sm:rounded-[36px] sm:border-[8px] border-[#0D1C2A] shadow-[0_0_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col relative z-10">
        <AppHeader 
          isMainnet={isMainnet}
          walletAddress={address}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onToggleMainnet={handleToggleMainnet}
          isDemoMode={isDemoMode}
          onToggleDemoMode={handleToggleDemoMode}
          isPresentationMode={isPresentationMode}
          onTogglePresentationMode={handleTogglePresentationMode}
          onShowHistory={() => setIsHistoryModalOpen(true)}
          onDonateClick={() => {
            setDonateModalInitialTab('donate');
            setIsDonateModalOpen(true);
          }}
          onRewardsClick={() => {
            setDonateModalInitialTab('incentives');
            setIsDonateModalOpen(true);
          }}
          googleUser={googleUser}
          setGoogleUser={setGoogleUser}
        />
        
        <RouteTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showLimitTab={googleUser?.email?.toLowerCase() === 'kenezuartzlab@gmail.com'}
        />

        <main className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-[#010C1B] flex flex-col p-5 space-y-4 font-sans">
          
          {/* Dynamic FLOW Points Incentive Status Bar */}
          <div className="bg-[#030E1A]/40 border border-white/5 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "p-1.5 rounded-lg border shrink-0",
                !googleUser 
                  ? "bg-blue-500/5 border-blue-500/10 text-blue-400"
                  : !(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo)
                    ? "bg-amber-500/5 border-amber-500/10 text-amber-400"
                    : "bg-[#32FF8B]/5 border-[#32FF8B]/10 text-[#32FF8B]"
              )}>
                <Gift className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-0.5 font-mono">
                <div className="text-[10px] font-bold text-white uppercase tracking-wider">
                  {!googleUser 
                    ? "Guest Mode Active"
                    : !(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo)
                      ? "Verification Pending"
                      : "Earnings Activated"
                  }
                </div>
                <div className="text-[9px] text-[#C5C1B9] leading-tight">
                  {!googleUser 
                    ? "Verify email in REWARDS to earn FLOW rewards."
                    : !(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo)
                      ? "Points paused. Verify email to activate."
                      : "Swaps earn off-chain FLOW points."
                  }
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setDonateModalInitialTab('incentives');
                setIsDonateModalOpen(true);
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[9px] font-bold font-mono uppercase tracking-wider shrink-0 transition-all active:scale-95 cursor-pointer",
                !googleUser 
                  ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 border border-blue-500/10"
                  : !(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo)
                    ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 border border-amber-500/10"
                    : "bg-[#32FF8B]/10 text-[#32FF8B] hover:bg-[#32FF8B]/15 border border-[#32FF8B]/10"
              )}
            >
              {!googleUser 
                ? "Sign In"
                : !(googleUser.emailVerified || googleUser.email_verified || googleUser.isDemo)
                  ? "Verify"
                  : "View Perks"
              }
            </button>
          </div>
          
          {/* Detailed Error Warning and Simulation Toggle Helper */}
          {walletLinkNotice && walletLinkNotice.kind !== "linked" && (
            <div className="p-3.5 bg-[#32FF8B]/5 border border-[#32FF8B]/25 rounded-2xl space-y-2">
              <div className="text-[11px] text-white/90 leading-snug">
                {walletLinkNotice.kind === "signin-needed" ? (
                  <>
                    This wallet is already linked to{" "}
                    <span className="text-[#32FF8B] font-mono">{walletLinkNotice.emailHint}</span>.
                    Sign in to that account to keep earning FlowPoints and referrals on this address.
                  </>
                ) : (
                  <>
                    Heads up — this wallet is bound to a different account{" "}
                    <span className="text-[#F6BA00] font-mono">{walletLinkNotice.emailHint}</span>.
                    FlowPoints will accrue to that account, not the one you're signed into.
                  </>
                )}
              </div>
              <div className="flex gap-2 justify-end font-mono">
                {walletLinkNotice.kind === "signin-needed" && (
                  <button
                    onClick={() => setIsConnectGuideOpen(true)}
                    className="px-3 py-1.5 bg-[#32FF8B] hover:bg-[#32FF8B]/90 text-[#010C1B] rounded-xl text-[9px] font-black tracking-widest uppercase transition-colors"
                  >
                    Sign in to linked account
                  </button>
                )}
                <button
                  onClick={() => setWalletLinkNotice(null)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-[9px] font-black tracking-widest uppercase transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-red-950/20 border border-red-500/25 rounded-2xl space-y-2">
              <WarningPanel 
                type="error" 
                title="On-Chain Revert" 
                message={errorMessage} 
              />
              <div className="flex gap-2 justify-end font-mono">
                <button
                  onClick={() => {
                    setIsDemoMode(true);
                    setErrorMessage(null);
                  }}
                  className="px-3 py-1.5 bg-[#F6BA00] hover:bg-[#F6BA00]/90 text-[#010C1B] rounded-xl text-[9px] font-black tracking-widest uppercase transition-colors"
                >
                  Switch to Sandbox Simulation
                </button>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-[#FFFFFF] rounded-xl text-[9px] font-black tracking-widest uppercase transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Connected Network Warning / Auto-Switcher card */}
          {isConnected && !isNetworkCorrect && (
            <div className="p-4 bg-[#F6BA00]/10 border border-[#F6BA00]/25 rounded-2xl flex flex-col gap-2.5 items-center text-center font-sans">
              <span className="text-xs font-black uppercase tracking-widest text-amber-200 font-mono">
                Wrong Network Detected!
              </span>
              <p className="text-[11px] text-[#C5C1B9] leading-relaxed">
                Please switch to {targetChainIdForTab() === 97 || targetChainIdForTab() === 56 ? "BNB Chain" : "BOT Chain"} to proceed with Web3 operations.
              </p>
              <button
                onClick={handleSwitchNetwork}
                className="w-full py-2.5 bg-[#F6BA00] hover:bg-[#F6BA00]/90 text-[#010C1B] font-mono tracking-widest font-black rounded-xl text-[9px] uppercase transition-colors shadow-sm cursor-pointer"
              >
                Switch Network Automatically
              </button>
            </div>
          )}

          {activeTab === 'CA/BOT' && (
            <SwapCard
              fromSymbol={caPaySymbol}
              toSymbol={caRecSymbol}
              fromAmount={caAmount}
              toAmount={getCaToBotDisplayQuote()}
              fromUsdValue={getCaToBotDisplayUsd(true)}
              toUsdValue={getCaToBotDisplayUsd(false)}
              fromBalance={caToBotDirection === 'CA_TO_BOT' ? getBalanceDisplay('CA') : getBalanceDisplay('BOT')}
              toBalance={caToBotDirection === 'CA_TO_BOT' ? getBalanceDisplay('BOT') : getBalanceDisplay('CA')}
              fromMaxAmount={caToBotDirection === 'CA_TO_BOT' ? getExactBalanceAmount('CA') : getExactBalanceAmount('BOT')}
              onFromAmountChange={setCaAmount}
              onToggleDirection={handleToggleCaBot}
              buttonLabel={caButtonLabel}
              buttonDisabled={caButtonDisabled}
              onShowRoute={() => setActiveRouteModal({ from: caPaySymbol, to: caRecSymbol })}
              onSubmit={() => {
                if (!isConnected) return handleConnect();
                if (!isNetworkCorrect) return handleSwitchNetwork();
                if (caAmount) setActiveConfirmModal('CA/BOT');
              }}
              networkWarning={!isConnected ? "Please connect your wallet first." : undefined}
              successMessage={session.step1.status === 'done' ? 'Swap transaction was successfully executed in the Bohr VM.' : undefined}
              txHash={session.step1.status === 'done' ? session.step1.tx_hash : undefined}
              txUrlPrefix={isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}
              onReset={resetStep1}
              livePrice={getLiveBotPrice()}
            />
          )}

          {activeTab === 'BOT/USDT' && (
            <UniversalSwapCard
              isMainnet={isMainnet}
              isConnected={isConnected}
              onConnect={handleConnect}
              isNetworkCorrect={isNetworkCorrect}
              onSwitchNetwork={handleSwitchNetwork}
              txUrlPrefix={isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}
              getUsdPrice={(sym) => {
                const s = sym.toUpperCase();
                if (s === 'USDT') return 1;
                if (s === 'BOT' || s === 'WBOT') return getLiveBotPrice();
                if (s === 'CA') return getLiveCaPrice();
                return null;
              }}
              onSwapPhaseChange={(e) => {
                if (e.phase === 'approving' || e.phase === 'swapping') {
                  if (e.fromAmount && e.toAmount) {
                    setUniversalSwapInfo({
                      fromAmount: e.fromAmount,
                      fromSymbol: e.fromSymbol ?? '',
                      toAmount: e.toAmount,
                      toSymbol: e.toSymbol ?? '',
                    });
                  }
                  setIsWaitingModalOpen(true);
                } else if (e.phase === 'success') {
                  setIsWaitingModalOpen(false);
                  setReceiptTxHash(e.txHash);
                  setReceiptUrlPrefix(isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/');
                  setReceiptTxType('swap');
                  setReceiptStatus('success');
                  setIsReceiptModalOpen(true);
                } else if (e.phase === 'error') {
                  setIsWaitingModalOpen(false);
                }
              }}
              onSwapSuccess={({ fromSymbol, toSymbol, fromAmount, toAmount, txHash }) => {
                const isBotUsdt =
                  (fromSymbol === 'BOT' && toSymbol === 'USDT') ||
                  (fromSymbol === 'USDT' && toSymbol === 'BOT');
                if (isBotUsdt) {
                  updateSession({
                    step2: { ...session.step2, status: 'done', tx_hash: txHash, timestamp: Date.now() },
                  });
                }
                // Persist to Flow rewards ledger (eligibility checked server-side)
                logTransactionToDb(
                  'SWAP',
                  `${fromSymbol}_TO_${toSymbol}`,
                  fromAmount,
                  toAmount,
                  txHash,
                  'SUCCESS',
                );
              }}
            />
          )}

          {activeTab === 'LIMIT' && isLimitAdmin && (
            <LimitOrderCard
              isMainnet={isMainnet}
              isConnected={isConnected}
              onConnect={handleConnect}
              isNetworkCorrect={isNetworkCorrect}
              onSwitchNetwork={handleSwitchNetwork}
              txUrlPrefix={isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}
              getUsdPrice={(sym) => {
                const s = sym.toUpperCase();
                if (s === 'USDT') return 1;
                if (s === 'BOT' || s === 'WBOT' || s === 'CAWBOT') return getLiveBotPrice();
                if (s === 'CA') return getLiveCaPrice();
                return null;
              }}
            />
          )}

          {activeTab === 'BRIDGE' && (
            <BridgeCard
              amount={usdtAmount}
              onAmountChange={setUsdtAmount}
              fromChain={bridgeFromName}
              toChain={bridgeToName}
              symbol="USDT"
              balance={bridgeDirection === 'BOT_TO_BNB' ? getBalanceDisplay('USDT_BOT') : getBalanceDisplay('USDT_BNB')}
              estimatedReceive={calculateBridgeReceive(usdtAmount)}
              receiveAddress={customDestinationAddress || address || "Connect wallet to see address..."}
              onToggleDirection={handleToggleBridge}
              buttonLabel={bridgeButtonLabel}
              buttonDisabled={bridgeButtonDisabled}
              onSubmit={() => {
                if (!isConnected) return handleConnect();
                if (!isNetworkCorrect) return handleSwitchNetwork();
                if (session.step3.status === 'submitted') {
                  const explorePrefix = bridgeDirection === 'BOT_TO_BNB' 
                    ? (isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/')
                    : (isMainnet ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/');
                  return window.open(`${explorePrefix}${session.step3.tx_hash ?? 'pending'}`, '_blank');
                }
                if (usdtAmount) {
                  setIsConfirmDestinationOpen(true);
                }
              }}
              successMessage={session.step3.status === 'submitted' ? 'Your cross-chain bridge transaction was initiated successfully.' : undefined}
              txHash={session.step3.status === 'submitted' ? session.step3.tx_hash ?? undefined : undefined}
              txUrlPrefix={bridgeDirection === 'BOT_TO_BNB' ? (isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/') : (isMainnet ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/')}
              gasFeeLabel={bridgeDirection === 'BOT_TO_BNB' ? '≈ 0.095238 BOT' : '≈ 0.005 BNB'}
              bridgeDirection={bridgeDirection}
              onReset={resetStep3}
            />
          )}
        </main>
      </div>

      {/* Very tiny footer centered at bottom of layout */}
      <footer className="relative z-10 text-center py-5 select-none transition-opacity duration-300 flex flex-col items-center gap-2 font-mono uppercase">
        <button
          onClick={() => setIsDonateModalOpen(true)}
          className="text-[10px] tracking-[0.05em] text-[#32FF8B] hover:text-[#1FFF7D] font-black cursor-pointer transition-colors flex items-center justify-center gap-1.5 hover:underline bg-[#32FF8B]/5 hover:bg-[#32FF8B]/10 border border-[#32FF8B]/20 py-1 px-3.5 rounded-full shadow-sm active:scale-95"
          title="Support decentralized builders & request new ecosystem tools!"
        >
          <span className="inline-block animate-pulse">💖</span> Support FlowBridge & Request Features
        </button>
        <span className="text-[9px] text-[#C5C1B9]/70 tracking-[0.2em] font-medium">
          ⓒ 2026 FlowBridge. Built by Kenezu
        </span>
      </footer>

      {/* Cloud SQL Ledger History Modal Overlay */}
      {isHistoryModalOpen && (
        <LedgerHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          transactions={dbTransactions}
          isMainnet={isMainnet}
          email={googleUser?.email}
        />
      )}

      {/* Guided Connect Account Setup Modal Overlay */}
      {isConnectGuideOpen && (
        <ConnectGuideModal
          isOpen={isConnectGuideOpen}
          onClose={() => setIsConnectGuideOpen(false)}
          googleUser={googleUser}
          isAuthLoading={isAuthLoading}
          onGoogleSignIn={handleGoogleSignIn}
          onSandboxSignIn={handleSandboxSignIn}
          isWalletConnected={isConnected}
          onConnectWallet={() => connect({ connector: injected() })}
        />
      )}

      {/* Premium Confirm Modal Overlay */}
      {activeConfirmModal && (
        <ConfirmSwapModal
          isOpen={activeConfirmModal !== null}
          onClose={() => setActiveConfirmModal(null)}
          onConfirm={async () => {
            const step = activeConfirmModal;
            setActiveConfirmModal(null);
            setIsWaitingModalOpen(true);
            if (step === 'CA/BOT') await completeStep1();
            else if (step === 'BOT/USDT') await completeStep2();
            else if (step === 'BRIDGE') await completeStep3();
          }}
          fromAmount={
            activeConfirmModal === 'CA/BOT' ? caAmount :
            activeConfirmModal === 'BOT/USDT' ? botAmount :
            usdtAmount
          }
          fromSymbol={
             activeConfirmModal === 'CA/BOT' ? caPaySymbol :
             activeConfirmModal === 'BOT/USDT' ? paySymbol :
             "USDT"
          }
          toAmount={
             activeConfirmModal === 'CA/BOT' ? getCaToBotDisplayQuote() :
             activeConfirmModal === 'BOT/USDT' ? getActiveSwapQuote() :
             (usdtAmount ? parseFloat(calculateBridgeReceive(usdtAmount)).toFixed(6) : "0.00")
          }
          toSymbol={
             activeConfirmModal === 'CA/BOT' ? caRecSymbol :
             activeConfirmModal === 'BOT/USDT' ? recSymbol :
             "USDT"
          }
          priceRate={
             activeConfirmModal === 'CA/BOT' ? `1 ${caPaySymbol} ≈ ${(parseFloat(getCaToBotDisplayQuote()) / (parseFloat(caAmount) || 1)).toFixed(6)} ${caRecSymbol}` :
             activeConfirmModal === 'BOT/USDT' ? `1 ${paySymbol} ≈ ${(parseFloat(getActiveSwapQuote()) / (parseFloat(botAmount) || 1)).toFixed(6)} ${recSymbol}` :
             `1.00 USDT`
          }
          priceImpact={
             activeConfirmModal === 'CA/BOT' ? "0.30%" :
             activeConfirmModal === 'BOT/USDT' ? "0.45%" :
             "0.00%"
          }
          slippageTolerance={
             activeConfirmModal === 'BRIDGE' ? "N/A" : "Auto:0.50%"
          }
          minimumReceived={
             activeConfirmModal === 'CA/BOT' ? (parseFloat(getCaToBotDisplayQuote()) * 0.995).toFixed(6) : 
             activeConfirmModal === 'BOT/USDT' ? (parseFloat(getActiveSwapQuote()) * 0.995).toFixed(6) : 
             (usdtAmount ? parseFloat(calculateBridgeReceive(usdtAmount)).toFixed(6) : "0.00")
          }
          tradingFee={
             activeConfirmModal === 'CA/BOT' ? "0.30%" :
             activeConfirmModal === 'BOT/USDT' ? "0.30%" :
             (bridgeDirection === 'BOT_TO_BNB' ? "1 USDT" : "0 USDT")
          }
          isBridge={activeConfirmModal === 'BRIDGE'}
          fromChain={bridgeFromName}
          toChain={bridgeToName}
        />
      )}

      {/* Premium Waiting/Spinner Modal Overlay */}
      {isWaitingModalOpen && (
        <WaitingModal
          isOpen={isWaitingModalOpen}
          onClose={() => setIsWaitingModalOpen(false)}
          fromAmount={
            activeTab === 'CA/BOT' ? caAmount :
            activeTab === 'BOT/USDT' ? (universalSwapInfo?.fromAmount ?? botAmount) :
            usdtAmount
          }
          fromSymbol={
            activeTab === 'CA/BOT' ? caPaySymbol :
            activeTab === 'BOT/USDT' ? (universalSwapInfo?.fromSymbol ?? paySymbol) :
            "USDT"
          }
          toAmount={
            activeTab === 'CA/BOT' ? getCaToBotDisplayQuote() :
            activeTab === 'BOT/USDT' ? (universalSwapInfo?.toAmount ?? getActiveSwapQuote()) :
            (usdtAmount ? parseFloat(calculateBridgeReceive(usdtAmount)).toFixed(6) : "0.00")
          }
          toSymbol={
            activeTab === 'CA/BOT' ? caRecSymbol :
            activeTab === 'BOT/USDT' ? (universalSwapInfo?.toSymbol ?? recSymbol) :
            "USDT"
          }
          isBridge={activeTab === 'BRIDGE'}
          fromChain={bridgeFromName}
          toChain={bridgeToName}
        />
      )}

      {/* Premium Successful Receipt Modal Overlay */}
      {isReceiptModalOpen && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          txHash={receiptTxHash}
          txUrlPrefix={receiptUrlPrefix}
          onDonateClick={() => setIsDonateModalOpen(true)}
          txType={receiptTxType}
          status={receiptStatus}
        />
      )}

      {/* Premium Path Routing Modal Overlay */}
      {activeRouteModal && (
        <RouteModal
          isOpen={activeRouteModal !== null}
          onClose={() => setActiveRouteModal(null)}
          fromSymbol={activeRouteModal.from}
          toSymbol={activeRouteModal.to}
          poolFee={activeRouteModal.from === 'BOT' || activeRouteModal.to === 'BOT' ? "0.30%" : "0.05%"}
        />
      )}

      {/* Premium Custom Destination Address Confirmation Modal Overlay */}
      {isConfirmDestinationOpen && (
        <ConfirmDestinationModal
          isOpen={isConfirmDestinationOpen}
          onClose={() => setIsConfirmDestinationOpen(false)}
          initialAddress={customDestinationAddress || address || ''}
          onConfirm={async (confirmedAddress) => {
            setCustomDestinationAddress(confirmedAddress);
            setTrackerRecipientAddress(confirmedAddress);
            setIsConfirmDestinationOpen(false);
            setIsRealtimeTrackerOpen(true);
            await completeStep3(confirmedAddress);
          }}
        />
      )}

      {/* Premium Realtime Multi-Stage Transaction Tracker Modal Overlay */}
      {isRealtimeTrackerOpen && (
        <RealtimeBridgeTrackerModal
          isOpen={isRealtimeTrackerOpen}
          onClose={() => setIsRealtimeTrackerOpen(false)}
          fromChain={bridgeFromName}
          toChain={bridgeToName}
          amount={usdtAmount}
          symbol="USDT"
          recipientAddress={trackerRecipientAddress || customDestinationAddress || address || ''}
          txHash={receiptTxHash || undefined}
          txUrlPrefix={bridgeDirection === 'BOT_TO_BNB' 
            ? (isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/')
            : (isMainnet ? 'https://bscscan.com/tx/' : 'https://testnet.bscscan.com/tx/')}
          onReset={() => {
            resetStep3();
            setIsRealtimeTrackerOpen(false);
          }}
          onDonateClick={() => setIsDonateModalOpen(true)}
        />
      )}

      {/* Premium Dynamic Donation & Suggestions Panel Modal Overlay */}
      {isDonateModalOpen && (
        <DonateModal
          isOpen={isDonateModalOpen}
          onClose={() => setIsDonateModalOpen(false)}
          googleUser={googleUser}
          getEffectiveIdToken={getEffectiveIdToken}
          initialTab={donateModalInitialTab}
          onGoogleSignIn={handleGoogleSignIn}
          setGoogleUser={setGoogleUser}
        />
      )}
    </div>
  );
}
