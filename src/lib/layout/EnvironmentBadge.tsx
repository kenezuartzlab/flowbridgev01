import { cn } from '../../lib/utils';

interface EnvironmentBadgeProps {
  isMainnet?: boolean;
}

export function EnvironmentBadge({ isMainnet = false }: EnvironmentBadgeProps) {
  return (
    <div className="flex items-center gap-2 mt-0.5 font-mono">
      <span className={cn(
        "text-[11px] px-2 py-0.5 rounded font-black tracking-widest uppercase transition-all",
        isMainnet 
          ? "bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/30" 
          : "bg-[#00D7B2]/10 text-[#00D7B2] border border-[#00D7B2]/30"
      )}>
        {isMainnet ? 'Mainnet' : 'Testnet'}
      </span>
    </div>
  );
}
