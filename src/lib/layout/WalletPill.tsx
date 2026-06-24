import { LogOut, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';

interface WalletPillProps {
  address?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function WalletPill({ address, onConnect, onDisconnect }: WalletPillProps) {
  if (!address) {
    return (
      <button
        onClick={onConnect}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-150 font-mono",
          "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] text-xs font-black shadow-[0_0_12px_rgba(50,255,139,0.25)] hover:shadow-[0_0_16px_rgba(50,255,139,0.4)] cursor-pointer"
        )}
      >
        <Wallet className="w-3.5 h-3.5" />
        Connect
      </button>
    );
  }

  const shortened = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className="bg-[#0D1C2A]/80 border border-white/10 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-inner font-mono">
      <div className="w-2 h-2 rounded-full bg-[#32FF8B] animate-pulse shadow-[0_0_8px_#32FF8B]" />
      <span className="text-xs font-extrabold text-[#F0F7F3]">{shortened}</span>
      <button
        onClick={onDisconnect}
        className="p-1 -mr-1.5 hover:bg-white/5 disabled:opacity-50 rounded-lg text-[#C5C1B9] hover:text-[#32FF8B] transition-all cursor-pointer"
        title="Disconnect Wallet"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
