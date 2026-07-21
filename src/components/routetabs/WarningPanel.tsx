import { AlertTriangle, Info, CheckCircle2, ExternalLink, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

export type NotificationType = 'warning' | 'error' | 'info' | 'success';

interface WarningPanelProps {
  type?: NotificationType;
  title?: string;
  message: string;
  /** Optional plain-English checklist rendered below the message. */
  steps?: string[];
  /** Optional secondary action (e.g. "Configure threshold"). */
  actionLabel?: string;
  onAction?: () => void;
  txHash?: string;
  txUrlPrefix?: string;
}

function truncateHash(hash: string) {
  if (!hash) return '';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

const TYPE_STYLES: Record<NotificationType, { wrap: string; icon: string; iconColor: string; titleFallback: string }> = {
  warning: {
    wrap: 'bg-[#F6BA00]/10 border-[#F6BA00]/25 text-amber-200',
    icon: 'AlertTriangle',
    iconColor: 'text-[#F6BA00]',
    titleFallback: 'Heads up',
  },
  error: {
    wrap: 'bg-[#FC4447]/10 border-[#FC4447]/25 text-red-200',
    icon: 'AlertTriangle',
    iconColor: 'text-[#FC4447]',
    titleFallback: 'Something went wrong',
  },
  info: {
    wrap: 'bg-[#00D7B2]/10 border-[#00D7B2]/25 text-teal-200',
    icon: 'Info',
    iconColor: 'text-[#00D7B2]',
    titleFallback: 'Info',
  },
  success: {
    wrap: 'bg-[#32FF8B]/10 border-[#32FF8B]/25 text-emerald-200',
    icon: 'Check',
    iconColor: 'text-[#32FF8B]',
    titleFallback: 'Success',
  },
};

export function WarningPanel({
  type = 'warning',
  title,
  message,
  steps,
  actionLabel,
  onAction,
  txHash,
  txUrlPrefix,
}: WarningPanelProps) {
  const styles = TYPE_STYLES[type];
  const Icon = type === 'info' ? Info : type === 'success' ? CheckCircle2 : AlertTriangle;

  return (
    <div className={cn(
      'border p-3.5 rounded-2xl flex gap-3 z-10 relative mb-4 items-start shadow-inner font-sans w-full overflow-hidden',
      styles.wrap,
    )}>
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={cn('w-4 h-4', styles.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <span className="font-bold font-mono tracking-tight text-[#FFFFFF] block mb-1 text-sm uppercase">{title}</span>
        )}
        <span className="text-[13px] font-medium leading-normal block break-words">{message}</span>

        {steps && steps.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12.5px] leading-snug text-white/85">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn('mt-0.5 w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-black shrink-0', styles.iconColor, 'bg-white/10')}>
                  {i + 1}
                </span>
                <span className="break-words">{s}</span>
              </li>
            ))}
          </ul>
        )}

        {(actionLabel && onAction) && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg text-[11.5px] font-black tracking-widest uppercase text-white cursor-pointer transition-colors"
          >
            <Settings className="w-3 h-3" />
            <span>{actionLabel}</span>
          </button>
        )}

        {txHash && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[12px]">
            <span className="text-[#C5C1B9]/50 uppercase tracking-wider font-semibold">Tx Hash:</span>
            <a
              href={txUrlPrefix ? `${txUrlPrefix}${txHash}` : '#'}
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

/** Backwards-compatible alias so all notifications share one component. */
export const NotificationPanel = WarningPanel;
