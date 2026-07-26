import { useEffect, useMemo, useState } from "react";
import { X, Search, Plus, AlertTriangle } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import {
  addImportedToken,
  getCuratedTokens,
  getImportedTokens,
  type Token,
} from "@/lib/swap/tokenRegistry";
import { fetchTokenMetadata } from "@/lib/swap/erc20";
import { hasAnyLiquidity } from "@/lib/swap/quoter";
import { useAppConfig } from "@/lib/config/appConfig";


interface TokenPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (t: Token) => void;
  isMainnet: boolean;
  excludeAddress?: string;
  title: string;
}

export function TokenPickerModal({
  isOpen,
  onClose,
  onSelect,
  isMainnet,
  excludeAddress,
  title,
}: TokenPickerModalProps) {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // re-read imported tokens after import

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setImportError(null);
    }
  }, [isOpen]);

  const config = useAppConfig(); // admin-published tokens land here
  const curated = useMemo(() => getCuratedTokens(isMainnet), [isMainnet, config]);
  const imported = useMemo(() => getImportedTokens(isMainnet), [isMainnet, tick]);


  const list = useMemo(() => {
    const all = [...curated, ...imported];
    const q = query.trim().toLowerCase();
    const filtered = all.filter((t) => {
      if (excludeAddress && t.address.toLowerCase() === excludeAddress.toLowerCase()) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });
    return filtered;
  }, [curated, imported, query, excludeAddress]);

  const queryLooksLikeAddress =
    query.trim().startsWith("0x") && query.trim().length === 42;
  const isUnknownAddress =
    queryLooksLikeAddress &&
    !list.some((t) => t.address.toLowerCase() === query.trim().toLowerCase());

  const handleImport = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const addr = query.trim();
      const meta = await fetchTokenMetadata(addr, isMainnet);
      if (!meta) {
        setImportError("Not a valid ERC-20 contract on BOT Chain.");
        return;
      }
      const liquid = await hasAnyLiquidity(meta.address, isMainnet);
      if (!liquid) {
        setImportError("No tradable liquidity found on any active BOT Chain router against BOT, USDT or CA.");
        return;
      }
      addImportedToken(isMainnet, meta);
      setTick((n) => n + 1);
      setQuery("");
      onSelect(meta);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fb-vv-overlay fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div className="fb-vv-sheet bg-[#0D1C2A] border border-white/10 rounded-t-[24px] sm:rounded-[24px] w-full max-w-[400px] p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl flex flex-col gap-3 sm:gap-4 animate-scale-up border-b-[5px] border-b-[#32FF8B] overflow-hidden">
        <div className="flex justify-between items-center font-mono">
          <h3 className="text-white font-black uppercase tracking-wider text-sm">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[#010C1B] border border-white/15 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-[#C5C1B9] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or paste 0x address…"
            className="bg-transparent text-white text-sm flex-1 focus:outline-none placeholder:text-[#C5C1B9]/60 font-mono"
          />
        </div>

        {importError && (
          <div className="flex items-center gap-2 text-[12px] text-amber-400 font-mono bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {isUnknownAddress && !importError && (
          <button
            type="button"
            disabled={importing}
            onClick={handleImport}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#32FF8B]/10 border border-[#32FF8B]/30 text-[#32FF8B] text-[13px] font-black uppercase tracking-widest cursor-pointer hover:bg-[#32FF8B]/20 transition-colors font-mono disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {importing ? "Verifying liquidity…" : "Import token"}
          </button>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 space-y-1.5">
          {list.length === 0 && !isUnknownAddress && (
            <div className="text-center text-[13px] text-[#C5C1B9] py-8 font-mono">
              No tokens match.
            </div>
          )}
          {list.map((t) => (
            <button
              key={t.address}
              type="button"
              onClick={() => onSelect(t)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#010C1B]/60 hover:bg-[#32FF8B]/5 border border-white/5 hover:border-[#32FF8B]/25 cursor-pointer transition-colors text-left"
            >
              <TokenIcon symbol={t.symbol} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-black tracking-wider font-mono">
                  {t.symbol}
                  {t.imported && (
                    <span className="ml-2 text-[10px] text-[#32FF8B] font-bold uppercase tracking-widest">
                      imported
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[#C5C1B9] truncate font-mono">
                  {t.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
