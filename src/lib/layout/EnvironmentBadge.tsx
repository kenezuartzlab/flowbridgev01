import { cn } from '../../lib/utils';

interface EnvironmentBadgeProps {
  isMainnet?: boolean;
}

/**
 * Subtle, Apple-style network indicator: quiet by default on mainnet,
 * clearly warm-toned when the app is pointed anywhere else.
 */
export function EnvironmentBadge({ isMainnet = false }: EnvironmentBadgeProps) {
  return (
    <div className="mt-0.5 flex items-center font-mono">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
          isMainnet
            ? 'border-success/25 bg-success/10 text-success'
            : 'border-warning/30 bg-warning/10 text-warning',
        )}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-60',
              isMainnet ? 'animate-ping bg-success' : 'bg-warning',
            )}
          />
          <span
            className={cn(
              'relative inline-flex h-1.5 w-1.5 rounded-full',
              isMainnet ? 'bg-success' : 'bg-warning',
            )}
          />
        </span>
        {isMainnet ? 'Mainnet' : 'Testnet'}
      </span>
    </div>
  );
}
