import { CheckCircle2, Circle, Clock, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { RouteSession, StepStatus } from '../../store/routeSession';

interface RouteProgressProps {
  session: RouteSession;
  onStepClick: (tab: 'CA/BOT' | 'BOT/USDT' | 'BRIDGE') => void;
}

const STEP_MAP = [
  { id: 'ca_bot', label: 'CA/BOT', tab: 'CA/BOT' as const },
  { id: 'bot_usdt', label: 'SWAP', tab: 'BOT/USDT' as const },
  { id: 'bridge_usdt', label: 'BRIDGE', tab: 'BRIDGE' as const },
];

export function RouteProgress({ session, onStepClick }: RouteProgressProps) {
  const getStatus = (stepId: string): StepStatus => {
    if (stepId === 'ca_bot') return session.step1.status;
    if (stepId === 'bot_usdt') return session.step2.status;
    if (stepId === 'bridge_usdt') return session.step3.status;
    return 'pending';
  };

  return (
    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 z-10 relative shadow-sm">
      <div className="flex items-center justify-between">
        {STEP_MAP.map((step, idx) => {
          const status = getStatus(step.id);
          
          let circleClasses = "bg-slate-200 text-slate-500 shadow-inner";
          let textClasses = "text-slate-400";
          let icon = <span className="text-[10px] font-bold">{idx + 1}</span>;

          if (status === 'done') {
            circleClasses = "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20";
            textClasses = "text-slate-500";
            icon = <Check className="w-3.5 h-3.5" strokeWidth={3.5} />;
          } else if (status === 'submitted') {
            circleClasses = "bg-blue-600 text-white shadow-sm shadow-blue-500/20";
            textClasses = "text-blue-600";
            icon = <Clock className="w-3.5 h-3.5" strokeWidth={3.5} />;
          } else {
             const isCurrentPending = (idx === 0 && session.step1.status === 'pending') ||
                 (idx === 1 && session.step1.status === 'done' && session.step2.status === 'pending') ||
                 (idx === 2 && session.step2.status === 'done' && session.step3.status === 'pending');
             
             if (isCurrentPending) {
               circleClasses = "bg-blue-600 text-white shadow-sm shadow-blue-500/20";
               textClasses = "text-blue-600";
             }
          }

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <button 
                onClick={() => onStepClick(step.tab)}
                className="flex flex-col items-center gap-1 flex-1 cursor-pointer transition-transform hover:scale-105"
              >
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center transition-colors", circleClasses)}>
                  {icon}
                </div>
                <span className={cn("text-[8.5px] font-extrabold uppercase tracking-wider", textClasses)}>
                  {step.label}
                </span>
              </button>
              {idx < STEP_MAP.length - 1 && (
                <div className={cn(
                  "h-[1.5px] flex-grow mx-2 transition-colors",
                  status === 'done' ? "bg-emerald-500" : "bg-slate-200"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
