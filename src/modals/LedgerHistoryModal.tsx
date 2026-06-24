import { X, Database, CheckCircle2, ArrowRight } from 'lucide-react';

interface LedgerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
  isMainnet: boolean;
  email?: string;
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
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[380px] p-5 shadow-2xl relative flex flex-col max-h-[500px] animate-scale-up border-b-[5px] border-b-[#32FF8B]"
      >
        {/* Header container */}
        <div className="flex justify-between items-center pb-3 border-b border-white/5 font-mono">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#32FF8B]/10 text-[#32FF8B] rounded-lg">
              <Database className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Cloud Ledger</h3>
              {email && (
                <p className="text-[9px] text-[#00D7B2] font-semibold truncate max-w-[200px]" title={email}>
                  Logged in: {email}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transactions list */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-2.5 mt-2 scrollbar-thin">
          {transactions.length === 0 ? (
            <div className="text-center py-10 bg-[#010C1B]/54 border border-white/5 rounded-2xl">
              <p className="text-xs font-semibold text-[#F0F7F3]">No transactions logged yet.</p>
              <p className="text-[10px] text-[#C5C1B9] mt-2.5 max-w-[200px] mx-auto leading-relaxed">
                Your future swap or bridge transitions will automatically sync and persist in the PostgreSQL database!
              </p>
            </div>
          ) : (
            transactions.map((tx: any) => (
              <div 
                key={tx.id} 
                className="p-3 bg-[#010C1B]/40 border border-white/5 hover:bg-[#010C1B]/80 transition-colors rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className={`px-1.5 py-0.5 text-[8px] font-black rounded ${
                      tx.txType === 'BRIDGE' 
                        ? 'bg-[#00D7B2]/10 text-[#00D7B2] border border-[#00D7B2]/25' 
                        : 'bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/25'
                    }`}>
                      {tx.txType}
                    </span>
                    <span className="font-bold text-white truncate text-[10px] uppercase tracking-wide">
                      {tx.direction.replace('_', ' → ')}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#C5C1B9] mt-2 flex items-center gap-1 font-mono">
                    <span className="font-bold text-[#F0F7F3]">{tx.fromAmount}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-[#32FF8B]" />
                    <span className="font-bold text-[#F0F7F3]">{tx.toAmount}</span>
                  </div>
                  {tx.txHash && (
                    <a 
                      href={`${isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}${tx.txHash}`}
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[#32FF8B] hover:underline font-mono text-[9px] mt-1.5 truncate max-w-[150px] inline-flex items-center gap-0.5"
                    >
                      Tx: {tx.txHash.substring(0, 8)}...{tx.txHash.substring(tx.txHash.length - 8)}
                    </a>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5 font-mono">
                  <span className="text-[9px] text-[#C5C1B9] block">
                    {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-1 bg-[#32FF8B]/10 border border-[#32FF8B]/25 text-[#32FF8B] px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider">
                    <CheckCircle2 className="w-2.5 h-2.5 text-[#32FF8B]" />
                    {tx.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info banner */}
        <div className="pt-3 border-t border-white/5 text-center text-[9px] text-[#C5C1B9]/60 leading-normal font-mono uppercase tracking-widest">
          Synchronized to Cloud Ledger SQL
        </div>
      </div>
    </div>
  );
}
