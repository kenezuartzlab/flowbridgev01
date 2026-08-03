import { cn } from '../../lib/utils';

export type TabId = 'CA/BOT' | 'BOT/USDT' | 'BRIDGE';

interface RouteTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'CA/BOT', label: 'CA / BOT' },
  { id: 'BOT/USDT', label: 'SWAP' },
  { id: 'BRIDGE', label: 'BRIDGE' },
];

/**
 * Redesign pass: the underlined tab strip becomes a recessed segmented
 * control, so the active route reads as a raised pill instead of a border.
 * Uses the shared .fb-segment-track / .fb-segment tokens.
 */
export function RouteTabs({ activeTab, onTabChange }: RouteTabsProps) {
  return (
    <div className="w-full px-2.5 pb-2.5 pt-2.5 sm:px-3">
      <nav className="fb-segment-track font-mono" role="tablist" aria-label="Trade route">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'fb-segment min-h-[38px] cursor-pointer truncate px-1.5 py-2 text-[11px] font-black uppercase tracking-[0.1em] outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:text-[12px]',
                !active && 'text-muted hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

