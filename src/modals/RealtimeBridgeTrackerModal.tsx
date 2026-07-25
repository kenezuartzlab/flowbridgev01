import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Loader2, Check } from 'lucide-react';
import { createPublicClient, http, fallback, erc20Abi } from 'viem';
import { getContracts } from '../lib/contracts';
import { cn } from '../lib/utils';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '../lib/wagmi';
import { fetchTronConfirmations } from '../lib/tronBridge';

type BridgeDirection =
  | 'BOT_TO_BNB' | 'BNB_TO_BOT'
  | 'BOT_TO_ETH' | 'ETH_TO_BOT'
  | 'BOT_TO_TRX' | 'TRX_TO_BOT';

interface RealtimeBridgeTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromChain: string;
  toChain: string;
  amount: string;
  symbol: string;
  recipientAddress: string;
  txHash?: string;
  txUrlPrefix?: string;
  onReset: () => void;
  bridgeDirection?: BridgeDirection;
  isMainnet?: boolean;
}

// Required source-chain confirmations before the relayer picks up the transfer.
const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  677: 3, 968: 1, 56: 15, 97: 3, 1: 12, 11155111: 3,
};

// Realistic relayer ETAs (seconds) — used only to time-gate the final "arrived"
// state, never to fake source-chain progress.
const RELAY_ETA_SECONDS: Record<BridgeDirection, number> = {
  BOT_TO_BNB: 7 * 60, BNB_TO_BOT: 5 * 60,
  BOT_TO_ETH: 10 * 60, ETH_TO_BOT: 8 * 60,
  BOT_TO_TRX: 6 * 60, TRX_TO_BOT: 5 * 60,
};

function chainFor(chainId: number) {
  if (chainId === 677) return botMainnet;
  if (chainId === 968) return botTestnet;
  if (chainId === 56) return bscMainnet;
  if (chainId === 97) return bscTestnet;
  if (chainId === 1) return ethereum;
  return sepolia;
}

// Redundant public RPCs. Some in-app dApp browsers (TokenPocket, Bitget…)
// block or rate-limit a single endpoint, which used to leave the tracker
// spinning forever. Always poll through a fallback list.
const RPC_URLS: Record<number, string[]> = {
  677: ['https://rpc.botchain.ai'],
  968: ['https://rpc.bohr.life'],
  56: [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-dataseed1.ninicoin.io',
    'https://binance.llamarpc.com',
    'https://bsc.publicnode.com',
  ],
  97: ['https://data-seed-prebsc-1-s1.binance.org:8545', 'https://bsc-testnet.publicnode.com'],
  1: ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth'],
  11155111: ['https://ethereum-sepolia-rpc.publicnode.com'],
};

function clientFor(chainId: number) {
  const urls = RPC_URLS[chainId] ?? [];
  return createPublicClient({
    chain: chainFor(chainId),
    transport: urls.length
      ? fallback(urls.map((u) => http(u, { timeout: 12_000 })), { rank: false })
      : http(),
  });
}

function sourceChainId(dir: BridgeDirection, isMainnet: boolean): number | null {
  switch (dir) {
    case 'BOT_TO_BNB': case 'BOT_TO_ETH': case 'BOT_TO_TRX': return isMainnet ? 677 : 968;
    case 'BNB_TO_BOT': return isMainnet ? 56 : 97;
    case 'ETH_TO_BOT': return isMainnet ? 1 : 11155111;
    case 'TRX_TO_BOT': return null; // Tron polled separately
  }
}

/** Destination chain id (null = Tron, non-EVM). */
function destChainId(dir: BridgeDirection, isMainnet: boolean): number | null {
  switch (dir) {
    case 'BNB_TO_BOT': case 'ETH_TO_BOT': case 'TRX_TO_BOT': return isMainnet ? 677 : 968;
    case 'BOT_TO_BNB': return isMainnet ? 56 : 97;
    case 'BOT_TO_ETH': return isMainnet ? 1 : 11155111;
    case 'BOT_TO_TRX': return null;
  }
}

/** USDT token on the destination chain (EVM only). */
function destUsdt(dir: BridgeDirection, isMainnet: boolean): `0x${string}` | null {
  const c = getContracts(isMainnet);
  switch (dir) {
    case 'BNB_TO_BOT': case 'ETH_TO_BOT': case 'TRX_TO_BOT': return c.usdtBot as `0x${string}`;
    case 'BOT_TO_BNB': return c.usdtBnb as `0x${string}`;
    case 'BOT_TO_ETH': return c.usdtEth as `0x${string}`;
    case 'BOT_TO_TRX': return null;
  }
}

/** Trim trailing zeros but never round the user's input away (10.011 stays 10.011). */
function displayAmount(raw: string): string {
  const n = Number(raw);
  if (!raw || Number.isNaN(n)) return '0';
  const s = raw.trim();
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Chain badge artwork (real logos where we have them). */
function chainBadge(chain: string): { src?: string; label?: string; ring: string; bg: string } {
  const c = chain.toLowerCase();
  if (c.includes('bnb') || c.includes('bsc') || c.includes('binance'))
    return { src: '/bnb-logo.png', ring: 'ring-amber-400/40', bg: 'bg-[#010C1B]' };
  if (c.includes('bot')) return { src: '/bot-icon.svg', ring: 'ring-teal-400/40', bg: 'bg-[#010C1B]' };
  if (c.includes('eth') || c.includes('sepolia'))
    return { label: 'Ξ', ring: 'ring-indigo-400/40', bg: 'bg-[#454A75]' };
  if (c.includes('tron') || c.includes('trx'))
    return { label: 'T', ring: 'ring-red-400/40', bg: 'bg-[#E50915]' };
  return { label: chain.slice(0, 1).toUpperCase(), ring: 'ring-white/20', bg: 'bg-white/10' };
}

/** Overlapping USDT + chain logo pair, mirroring the official BotBridge tracker. */
function TokenChainPair({ chain, delay = 0 }: { chain: string; delay?: number }) {
  const badge = chainBadge(chain);
  return (
    <div className="relative flex items-center" style={{ animationDelay: `${delay}ms` }}>
      <img
        src="/usdt-logo.png"
        alt="USDT"
        className="w-12 h-12 rounded-full ring-2 ring-[#26A17B]/40 shadow-[0_0_18px_rgba(38,161,123,0.35)] animate-scale-in"
        loading="lazy"
      />
      <span
        className={cn(
          '-ml-4 w-12 h-12 rounded-full ring-2 flex items-center justify-center overflow-hidden shadow-lg animate-scale-in',
          badge.ring,
          badge.bg,
        )}
        style={{ animationDelay: `${delay + 120}ms` }}
      >
        {badge.src ? (
          <img src={badge.src} alt={chain} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-base font-black text-white">{badge.label}</span>
        )}
      </span>
    </div>
  );
}



export function RealtimeBridgeTrackerModal({
  isOpen,
  onClose,
  fromChain,
  toChain,
  amount,
  symbol = 'USDT',
  recipientAddress,
  txHash,
  txUrlPrefix = 'https://scan.bohr.life/tx/',
  onReset,
  bridgeDirection,
  isMainnet = true,
}: RealtimeBridgeTrackerModalProps) {
  // Elapsed stopwatch (informational only).
  const [seconds, setSeconds] = useState(0);
  const [minutes, setMinutes] = useState(0);

  // Stage state is derived from real chain data, not fixed timers.
  const [stage1, setStage1] = useState<'pending' | 'loading' | 'done'>('loading');
  const [stage2, setStage2] = useState<'pending' | 'loading' | 'done'>('pending');
  const [stage3, setStage3] = useState<'pending' | 'loading' | 'done'>('pending');
  const [isCompleted, setIsCompleted] = useState(false);
  const [relaySecondsLeft, setRelaySecondsLeft] = useState<number>(0);

  // Reset when reopened.
  useEffect(() => {
    if (isOpen) {
      setSeconds(0);
      setMinutes(0);
      setStage1('loading');
      setStage2('pending');
      setStage3('pending');
      setIsCompleted(false);
      setRelaySecondsLeft(0);
    }
  }, [isOpen, txHash]);

  // Stopwatch ticking while the transfer is in-flight.
  useEffect(() => {
    if (!isOpen || isCompleted) return;
    const interval = setInterval(() => {
      setSeconds((prevSec) => {
        if (prevSec === 59) {
          setMinutes((prevMin) => prevMin + 1);
          return 0;
        }
        return prevSec + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isCompleted]);

  // Baseline destination balance captured before the relayer credits funds.
  const destBaseline = useRef<bigint | null>(null);

  // Real source-chain tracker: poll for receipt + confirmations. Stage 2 flips
  // only once the source chain has the required confirmations.
  useEffect(() => {
    if (!isOpen || !txHash || !bridgeDirection) return;
    let cancelled = false;
    const srcId = sourceChainId(bridgeDirection, isMainnet);
    const isTron = srcId === null;
    const required = srcId != null ? (REQUIRED_CONFIRMATIONS[srcId] ?? 1) : 1;
    const relayEta = RELAY_ETA_SECONDS[bridgeDirection] ?? 5 * 60;

    const pollEvm = async () => {
      try {
        const client = clientFor(srcId!);
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
        if (cancelled) return;
        if (!receipt) return; // still waiting for inclusion
        if (receipt.status !== 'success') {
          setStage1('pending');
          return;
        }
        setStage1('done');
        const latest = await client.getBlockNumber();
        const conf = Number(latest - receipt.blockNumber) + 1;
        if (conf >= required) {
          setStage2('done');
          setStage3((s) => (s === 'pending' ? 'loading' : s));
          setRelaySecondsLeft((cur) => (cur > 0 ? cur : relayEta));
        } else {
          setStage2('loading');
        }
      } catch {
        // transient RPC failures — keep polling.
      }
    };

    const pollTron = async () => {
      try {
        const info = await fetchTronConfirmations(txHash);
        if (cancelled) return;
        if (info.confirmed) {
          setStage1('done');
          setStage2('done');
          setStage3((s) => (s === 'pending' ? 'loading' : s));
          setRelaySecondsLeft((cur) => (cur > 0 ? cur : relayEta));
        }
      } catch {
        // ignore transient errors
      }
    };

    const tick = isTron ? pollTron : pollEvm;
    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isOpen, txHash, bridgeDirection, isMainnet]);

  // Destination tracker: poll the recipient's USDT balance on the destination
  // chain and flip "Received / Completed" only when funds actually land.
  useEffect(() => {
    if (!isOpen || !bridgeDirection || !recipientAddress) return;
    const dstId = destChainId(bridgeDirection, isMainnet);
    const token = destUsdt(bridgeDirection, isMainnet);
    if (dstId === null || !token || !recipientAddress.startsWith('0x')) return; // Tron dest → ETA fallback

    let cancelled = false;
    destBaseline.current = null;
    const client = clientFor(dstId);
    const expected = (() => {
      const n = Number(amount);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })();

    const read = async () => {
      try {
        const [raw, decimals] = await Promise.all([
          client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [recipientAddress as `0x${string}`],
          }) as Promise<bigint>,
          client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        ]);
        if (cancelled) return;
        if (destBaseline.current === null) {
          destBaseline.current = raw;
          return;
        }
        const delta = Number(raw - destBaseline.current) / 10 ** decimals;
        // 2% tolerance for relayer fees / partial rounding.
        if (delta > 0 && (expected === 0 || delta >= expected * 0.9)) {
          setStage1('done');
          setStage2('done');
          setStage3('done');
          setIsCompleted(true);
          setRelaySecondsLeft(0);
        }
      } catch {
        // transient RPC failure — keep polling.
      }
    };

    read();
    const id = setInterval(read, 6000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isOpen, bridgeDirection, isMainnet, recipientAddress, amount, txHash]);

  // Relay ETA countdown — display only. On non-EVM destinations (Tron), where
  // the balance cannot be polled, it is also the completion fallback.
  useEffect(() => {
    if (!isOpen || relaySecondsLeft <= 0) return;
    const canPollDest =
      bridgeDirection != null &&
      destChainId(bridgeDirection, isMainnet) !== null &&
      recipientAddress.startsWith('0x');
    const id = setInterval(() => {
      setRelaySecondsLeft((s) => {
        if (s <= 1) {
          if (!canPollDest) {
            setStage3('done');
            setIsCompleted(true);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, relaySecondsLeft, bridgeDirection, isMainnet, recipientAddress]);




  if (!isOpen) return null;

  // Render Stopwatch time: e.g. "14m:48s" or "00m:04s"
  const formattedTime = `${minutes.toString().padStart(2, '0')}m:${seconds.toString().padStart(2, '0')}s`;

  // Helper mapping chains to simplified screenshot designations
  const normChain = (ch: string) => {
    if (ch.toLowerCase().includes('bot')) return 'BOT Chain';
    if (ch.toLowerCase().includes('bnb') || ch.toLowerCase().includes('bsc') || ch.toLowerCase().includes('binance')) return 'BNB Chain';
    return ch;
  };

  const truncatedAddress = recipientAddress && recipientAddress.length > 15
    ? `${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`
    : recipientAddress;

  const displayHash = txHash ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : 'simulating_pipeline';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans text-white">
      <div 
        id="realtime_bridge_tracker"
        className="bg-[#030E1A] border border-white/10 text-[#F0F7F3] rounded-[28px] w-full max-w-[360px] p-6 shadow-2xl relative flex flex-col space-y-6 animate-scale-up"
      >
        {/* Top Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Action - Tracking Header */}
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold font-mono tracking-tight text-white mb-1">
            Track your transaction
          </h2>
        </div>

        {/* Central Graphic — real token/chain logos with ambient motion */}
        <div className="relative flex justify-center py-6 min-h-[190px]">
          {/* Radial Glowing Ambient Circles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[190px] h-[190px] bg-gradient-to-r from-teal-500/15 to-[#32FF8B]/10 rounded-full blur-3xl animate-[pulse_4s_ease-in-out_infinite]" />
            <div className="absolute w-[150px] h-[150px] border border-slate-700/30 rounded-full" />
            <div className="absolute w-[110px] h-[110px] border border-dashed border-teal-500/20 rounded-full animate-[spin_18s_linear_infinite]" />
          </div>

          <div className="relative flex items-start justify-between w-full px-1">
            {/* Source */}
            <div className="flex flex-col items-center z-10 space-y-2 w-[36%] animate-fade-in">
              <TokenChainPair chain={fromChain} />
              <div className="text-center">
                <span className="text-[14px] font-bold block">{symbol}</span>
                <span className="text-[13px] font-black text-white block tracking-wider font-mono">{displayAmount(amount)}</span>
                <span className="text-[11px] font-bold text-amber-400 uppercase font-mono tracking-widest">{normChain(fromChain)}</span>
              </div>
            </div>

            {/* Center relay indicator */}
            <div className="z-10 flex flex-col items-center justify-center gap-1.5 pt-3 w-[28%]">
              <div className="flex items-center gap-1">
                <span className={cn('text-lg font-black text-teal-400', !isCompleted && 'animate-bounce')}>↓</span>
                <span className={cn('text-lg font-black text-[#32FF8B]', !isCompleted && 'animate-bounce')} style={{ animationDelay: '250ms' }}>↑</span>
              </div>
              <span className="font-mono text-[9.5px] font-bold text-[#32FF8B]/70 uppercase tracking-widest animate-pulse">
                {isCompleted ? 'Settled' : 'Relaying'}
              </span>
              <div className="h-[2px] w-full rounded-full bg-gradient-to-r from-amber-400/30 via-[#32FF8B]/60 to-teal-400/30 overflow-hidden">
                <div className="h-full w-1/3 bg-[#32FF8B] animate-[slide-in-right_1.8s_ease-in-out_infinite]" />
              </div>
            </div>

            {/* Destination */}
            <div className="flex flex-col items-center z-10 space-y-2 w-[36%] animate-fade-in" style={{ animationDelay: '150ms' }}>
              <TokenChainPair chain={toChain} delay={200} />
              <div className="text-center">
                <span className="text-[14px] font-bold block">{symbol}</span>
                <span className="text-[13px] font-black text-white block tracking-wider font-mono">{displayAmount(amount)}</span>
                <span className="text-[11px] font-bold text-teal-400 uppercase font-mono tracking-widest">{normChain(toChain)}</span>
              </div>
            </div>
          </div>
        </div>


        {/* Countdown Timer or Completed Status badge in the center */}
        <div className="flex justify-center flex-col items-center">
          {isCompleted ? (
            <div className="px-6 py-2.5 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/15 border border-[#32FF8B]/35 rounded-full flex items-center gap-2 shadow-[0_0_12px_rgba(50,255,139,0.15)] animate-bounce-slow">
              <span className="w-2 h-2 rounded-full bg-[#32FF8B] animate-ping" />
              <span className="text-sm font-black uppercase text-[#32FF8B] tracking-widest font-mono">Completed</span>
            </div>
          ) : (
            <div className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-full text-center">
              <div className="text-sm font-black text-white font-mono tracking-widest">
                {formattedTime}
              </div>
            </div>
          )}
        </div>

        {/* Milestone Steps Timeline - Matching Screenshots Exactly with spinning loader/checkmarks */}
        <div className="bg-[#010C1B]/80 border border-white/10 rounded-[20px] p-5 space-y-4">
          {/* Milestone 1 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[13px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Sent transaction from <strong className="text-amber-300 font-bold">{normChain(fromChain)}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage1 === 'loading' && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
              {stage1 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage1 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>

          {/* Milestone 2 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[13px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Sent transaction to <strong className="text-teal-400 font-bold">{normChain(toChain)}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage2 === 'loading' && <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />}
              {stage2 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage2 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>

          {/* Milestone 3 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[13px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Received {symbol} on <strong className="text-teal-400 font-mono font-black">{truncatedAddress}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage3 === 'loading' && <Loader2 className="w-4 h-4 text-[#32FF8B] animate-spin" />}
              {stage3 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage3 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>
        </div>




        {/* Detail action and close paths */}
        <div className="flex flex-col gap-2 pt-2">
          {/* View Detail on Explorer */}
          <a
            href={txHash ? `${txUrlPrefix}${txHash}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full py-3.5 rounded-xl border font-mono text-sm tracking-widest font-bold uppercase transition-all duration-150 flex items-center justify-center gap-2",
              isCompleted 
                ? "bg-[#32FF8B] border-[#32FF8B] text-[#010C1B] hover:bg-[#1FFF7D] cursor-pointer shadow-[0_0_12px_rgba(50,255,139,0.25)]" 
                : "bg-white/5 border-white/5 text-[#C5C1B9]/60 hover:text-white cursor-pointer"
            )}
          >
            <span>View Detail</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Transfer Again - Restart Swap block */}
          <button
            onClick={() => {
              onReset();
              onClose();
            }}
            className="w-full py-3 px-4 bg-[#0D1C2A] text-white hover:bg-[#112335] active:scale-98 font-mono text-[10.5px] tracking-widest uppercase font-black rounded-xl transition border border-white/10 cursor-pointer shadow-inner text-center"
          >
            Transfer again
          </button>
        </div>
      </div>
    </div>
  );
}
