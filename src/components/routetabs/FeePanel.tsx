import { ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FeeRow {
  label: string;
  value: string;
  isImportant?: boolean;
}

interface FeePanelProps {
  rows: FeeRow[];
  receiveAddress?: string;
}

export function FeePanel({ rows, receiveAddress }: FeePanelProps) {
  return (
    <div className="bg-card border border-dashed border-hairline-strong rounded-2xl p-4.5 space-y-2 text-sm z-10 relative font-sans shadow-sm">
      {receiveAddress && (
        <div className="flex justify-between items-center pb-2.5 border-b border-hairline mb-2.5">
          <span className="text-muted text-[13px] font-medium">Receive Address</span>
          <span className="text-primary text-[13px] font-bold flex items-center gap-1 font-mono">
            {receiveAddress.length > 12 ? `${receiveAddress.slice(0, 8)}...${receiveAddress.slice(-6)}` : receiveAddress}
            <ExternalLink className="w-3 h-3 text-primary/80" />
          </span>
        </div>
      )}
      
      {rows.map((row, idx) => (
        <div key={idx} className="flex justify-between items-center text-[13px] leading-relaxed">
          <span className="text-muted font-medium">
            {row.label}
          </span>
          <span className={cn("font-bold text-foreground font-mono", row.isImportant && "text-primary text-sm font-black")}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
