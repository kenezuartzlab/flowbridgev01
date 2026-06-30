import { X, Database, CheckCircle2, ArrowRight } from 'lucide-react';

interface LedgerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  isMainnet: boolean;
  email?: string;
}

function formatDirection(direction: string) {
  if (!direction) return '';
  // Normalize patterns like "USDT_TO_BOT", "BOT_TO_BNB", "USDT_BNB" → "USDT → BOT"
  const cleaned = direction.replace(/_TO_/g, '_').replace(/^TO_/, '');
  const parts = cleaned.split('_').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} → ${parts[parts.length - 1]}`;
  return direction;
}

function formatTime(raw: any) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function LedgerHistoryModal({
  isOpen,
  onClose,
  transactions,
  isMainnet,
  email
}: LedgerHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div
        id="ledger_history_modal"
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[400px] p-5 shadow-2xl relative flex flex-col max-h-[540px] animate-scale-up border-b-[5px] border-b-[#32FF8B]"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-white/5 font-mono">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-[#32FF8B]/10 text-[#32FF8B] rounded-lg shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Swap / Bridge History
              </h3>
              {email && (
                <p className="text-[13px] text-[#00D7B2] font-semibold truncate" title={email}>
                  {email}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-2.5 mt-2 scrollbar-thin">
          {transactions.length === 0 ? (
            <div className="text-center py-10 bg-[#010C1B]/54 border border-white/5 rounded-2xl">
              <p className="text-base font-semibold text-[#F0F7F3]">No activity yet.</p>
              <p className="text-sm text-[#C5C1B9] mt-2.5 max-w-[240px] mx-auto leading-relaxed">
                Your swaps and bridges will show up here automatically.
              </p>
            </div>
          ) : (
            transactions.map((tx: any) => {
              const type = tx.tx_type ?? tx.txType ?? '';
              const direction = tx.direction ?? '';
              const fromAmount = tx.from_amount ?? tx.fromAmount ?? '';
              const toAmount = tx.to_amount ?? tx.toAmount ?? '';
              const txHash = tx.tx_hash ?? tx.txHash ?? '';
              const createdAt = tx.created_at ?? tx.createdAt;
              const status = tx.status ?? '';
              return (
                <div
                  key={tx.id}
                  className="p-3 bg-[#010C1B]/40 border border-white/5 hover:bg-[#010C1B]/80 transition-colors rounded-xl flex items-center justify-between"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className={`px-1.5 py-0.5 text-[11px] font-black rounded ${
                        type === 'BRIDGE'
                          ? 'bg-[#00D7B2]/10 text-[#00D7B2] border border-[#00D7B2]/25'
                          : 'bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/25'
                      }`}>
                        {type}
                      </span>
                      <span className="font-bold text-white truncate text-[14px] uppercase tracking-wide">
                        {formatDirection(direction)}
                      </span>
                    </div>
                    <div className="text-[14px] text-[#C5C1B9] mt-2 flex items-center gap-1.5 font-mono">
                      <span className="font-bold text-[#F0F7F3]">{fromAmount}</span>
                      <ArrowRight className="w-3 h-3 text-[#32FF8B]" />
                      <span className="font-bold text-[#F0F7F3]">{toAmount}</span>
                    </div>
                    {txHash && (
                      <a
                        href={`${isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#32FF8B] hover:underline font-mono text-[12px] mt-1.5 truncate max-w-[180px] inline-flex items-center gap-0.5"
                      >
                        Tx: {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 6)}
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5 font-mono">
                    <span className="text-[12px] text-[#C5C1B9] block">
                      {formatTime(createdAt)}
                    </span>
                    <div className="flex items-center gap-1 bg-[#32FF8B]/10 border border-[#32FF8B]/25 text-[#32FF8B] px-1.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3 text-[#32FF8B]" />
                      {status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/5 text-center text-[12px] text-[#C5C1B9]/70 leading-normal font-mono">
          Your activity is safely saved.
        </div>
      </div>
    </div>
  );
}
