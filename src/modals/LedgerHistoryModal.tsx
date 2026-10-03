import { X, Database, CheckCircle2, ArrowRight } from 'lucide-react';
import { ModalPortal } from './ModalPortal';

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
    <ModalPortal>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-background/92 backdrop-blur-md animate-fade-in font-sans">
      <div
        id="ledger_history_modal"
        className="bg-card border border-hairline text-foreground rounded-[20px] sm:rounded-[24px] w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain max-w-[400px] p-4 sm:p-5 shadow-2xl relative flex flex-col animate-scale-up border-b-[5px] border-b-primary"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-foreground/5 font-mono">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-primary/10 text-primary rounded-lg shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-foreground uppercase tracking-wider">
                Swap / Bridge History
              </h3>
              {email && (
                <p className="text-[13px] text-accent font-semibold truncate" title={email}>
                  {email}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close activity history"
            className="p-1.5 hover:bg-foreground/5 rounded-xl text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-2.5 mt-2 scrollbar-thin">
          {transactions.length === 0 ? (
            <div className="text-center py-10 bg-background/55 border border-hairline rounded-2xl">
              <p className="text-base font-semibold text-foreground">No activity yet.</p>
              <p className="text-sm text-muted mt-2.5 max-w-[240px] mx-auto leading-relaxed">
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
                   className="p-3 bg-background/40 border border-hairline hover:bg-background/80 transition-colors rounded-xl flex items-center justify-between"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className={`px-1.5 py-0.5 text-[11px] font-black rounded ${
                        type === 'BRIDGE'
                          ? 'bg-accent/10 text-accent border border-accent/25'
                          : 'bg-primary/10 text-primary border border-primary/25'
                      }`}>
                        {type}
                      </span>
                      <span className="font-bold text-foreground truncate text-[14px] uppercase tracking-wide">
                        {formatDirection(direction)}
                      </span>
                    </div>
                    <div className="text-[14px] text-muted mt-2 flex items-center gap-1.5 font-mono">
                      <span className="font-bold text-foreground">{fromAmount}</span>
                      <ArrowRight className="w-3 h-3 text-primary" />
                      <span className="font-bold text-foreground">{toAmount}</span>
                    </div>
                    {txHash && (
                      <a
                        href={`${isMainnet ? 'https://scan.botchain.ai/tx/' : 'https://scan.bohr.life/tx/'}${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-mono text-[12px] mt-1.5 truncate max-w-[180px] inline-flex items-center gap-0.5"
                      >
                        Tx: {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 6)}
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5 font-mono">
                    <span className="text-[12px] text-muted block">
                      {formatTime(createdAt)}
                    </span>
                    <div className="flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary px-1.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                      {status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-hairline text-center text-[12px] text-muted-soft leading-normal font-mono">
          Your activity is safely saved.
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
