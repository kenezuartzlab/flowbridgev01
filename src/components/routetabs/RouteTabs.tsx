import { Link } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { cn } from '../../lib/utils';


export type TabId = 'CA/BOT' | 'BOT/USDT' | 'BRIDGE';

interface RouteTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * V9.2 — one primary mode selector only: Swap | Bridge.
 *
 * CA/BOT is no longer a peer of Swap and Bridge; it is a pair/route selector
 * that appears inside the Swap workspace. The redundant "swap mode · on-chain
 * routing" caption is gone because the selected tab and the route card already
 * communicate it.
 */
const MODES: { id: 'SWAP' | 'BRIDGE'; label: string }[] = [
  { id: 'SWAP', label: 'SWAP' },
  { id: 'BRIDGE', label: 'BRIDGE' },
];

const PAIRS: { id: TabId; label: string }[] = [
  { id: 'BOT/USDT', label: 'Any pair' },
  { id: 'CA/BOT', label: 'CA / BOT' },
];

export function RouteTabs({ activeTab, onTabChange }: RouteTabsProps) {
  const mode: 'SWAP' | 'BRIDGE' = activeTab === 'BRIDGE' ? 'BRIDGE' : 'SWAP';

  return (
    <div className="w-full space-y-2 px-2.5 pb-2.5 pt-2.5 sm:px-3">
      <nav className="fb-segment-track font-mono" role="tablist" aria-label="Trade mode">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(m.id === 'BRIDGE' ? 'BRIDGE' : 'BOT/USDT')}
              className={cn(
                'fb-segment min-h-[38px] cursor-pointer truncate px-1.5 py-2 text-[11px] font-black uppercase tracking-[0.1em] outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:text-[12px]',
                !active && 'text-muted hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          );
        })}
      </nav>

      {/*
        Strategic MultiSend shortcut. It is deliberately NOT a trade mode tab:
        MultiSend is a separate destination, so this is a plain navigation link
        that never changes the active swap/bridge mode or touches execution.
      */}
      <div className="flex items-center justify-end px-0.5">
        <Link
          to="/multisend"
          data-testid="trade-multisend-link"
          className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <Send className="h-3 w-3" aria-hidden="true" />
          MultiSend
        </Link>
      </div>



      {mode === 'SWAP' && (
        <div
          role="group"
          aria-label="Swap pair"
          className="flex flex-wrap items-center gap-1.5 px-0.5"
        >
          <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
            Pair
          </span>
          {PAIRS.map((p) => {
            const active = activeTab === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onTabChange(p.id)}
                className={cn(
                  'min-h-[30px] cursor-pointer rounded-full border px-2.5 font-mono text-[9.5px] font-black uppercase tracking-[0.1em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
                  active
                    ? 'border-primary/45 bg-primary/12 text-primary'
                    : 'border-hairline text-muted hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
