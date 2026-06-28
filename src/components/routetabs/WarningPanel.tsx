import { AlertTriangle, Info, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

interface WarningPanelProps {
  type?: 'warning' | 'error' | 'info';
  title?: string;
  message: string;
  txHash?: string;
  txUrlPrefix?: string;
}

function truncateHash(hash: string) {
  if (!hash) return '';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function WarningPanel({ type = 'warning', title, message, txHash, txUrlPrefix }: WarningPanelProps) {
  return (
    <div className={cn(
      "border p-3.5 rounded-2xl flex gap-3 z-10 relative mb-4 items-start shadow-inner font-sans w-full overflow-hidden",
      type === 'warning' && "bg-[#F6BA00]/10 border-[#F6BA00]/25 text-amber-200",
      type === 'error' && "bg-[#FC4447]/10 border-[#FC4447]/25 text-red-200",
      type === 'info' && "bg-[#00D7B2]/10 border-[#00D7B2]/25 text-teal-200"
    )}>
      <div className="mt-0.5 flex-shrink-0">
        {type === 'warning' || type === 'error' ? (
          <AlertTriangle className={cn("w-4 h-4", type === 'error' ? "text-[#FC4447]" : "text-[#F6BA00]")} />
        ) : (
          <Info className="w-4 h-4 text-[#00D7B2]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {title && <span className="font-bold font-mono tracking-tight text-[#FFFFFF] block mb-1 text-sm uppercase">{title}</span>}
        <span className="text-[13px] font-medium leading-normal block break-words">{message}</span>
        
        {txHash && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[12px]">
            <span className="text-[#C5C1B9]/50 uppercase tracking-wider font-semibold">Tx Hash:</span>
            <a
              href={txUrlPrefix ? `${txUrlPrefix}${txHash}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 border border-[#32FF8B]/25 text-[#32FF8B] rounded-lg transition-colors hover:border-[#32FF8B]/40 active:scale-95 group font-bold font-mono"
            >
              <span>{truncateHash(txHash)}</span>
              <ExternalLink className="w-3 h-3 text-[#32FF8B] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

