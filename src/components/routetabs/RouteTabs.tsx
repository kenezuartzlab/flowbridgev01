import { cn } from '../../lib/utils';

export type TabId = 'CA/BOT' | 'BOT/USDT' | 'LIMIT' | 'BRIDGE';

interface RouteTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showLimitTab?: boolean;
}

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'CA/BOT', label: 'CA / BOT' },
  { id: 'BOT/USDT', label: 'SWAP' },
  { id: 'LIMIT', label: 'LIMIT' },
  { id: 'BRIDGE', label: 'BRIDGE' },
];

export function RouteTabs({ activeTab, onTabChange, showLimitTab = false }: RouteTabsProps) {
  const TABS = ALL_TABS.filter((t) => t.id !== 'LIMIT' || showLimitTab);

  return (
    <nav className="flex bg-[#010C1B] border-b border-white/10 relative z-10 w-full mb-0 font-mono">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex-1 py-3.5 text-[12px] font-black tracking-widest transition-all border-b-2 uppercase cursor-pointer",
            activeTab === tab.id
              ? "text-[#32FF8B] border-[#32FF8B] bg-[#32FF8B]/5"
              : "text-[#C5C1B9] border-transparent hover:text-[#32FF8B] hover:bg-white/5"
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
