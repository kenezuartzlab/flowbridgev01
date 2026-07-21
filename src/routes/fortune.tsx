import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/fortune")({
  head: () => ({
    meta: [
      { title: "Flow Fortune Wheel — Coming Soon | FlowBridge" },
      { name: "description", content: "Spin daily for FLOW points. 2 free spins per day. Jackpot up to 50 FLOW." },
    ],
  }),
  component: () => (
    <SoonPage
      title="Flow Fortune Wheel"
      tagline="2 Free Spins Daily · Jackpot 50 FLOW"
      lines={[
        "8-slot spinning wheel with prizes: 2 / 5 / 10 / 20 / 25 / 50 FLOW, +1 extra spin, or better luck next time.",
        "Server-authoritative RNG · anti-bot rate limits · verified email + bound wallet required.",
        "Launching this week.",
      ]}
    />
  ),
});

export function SoonPage({ title, tagline, lines }: { title: string; tagline: string; lines: string[] }) {
  return (
    <div className="min-h-screen bg-[#010C1B] text-white font-mono flex flex-col">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-2 text-[#C5C1B9] hover:text-[#32FF8B] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">Back</span>
        </Link>
        <span className="text-[10px] px-2 py-1 rounded bg-[#32FF8B]/15 border border-[#32FF8B]/30 text-[#32FF8B] font-black uppercase tracking-widest">
          Soon
        </span>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#32FF8B]/10 border border-[#32FF8B]/30 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[#32FF8B]" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest">{title}</h1>
          <p className="text-[#32FF8B] text-xs font-black uppercase tracking-widest">{tagline}</p>
          <div className="space-y-2 pt-2">
            {lines.map((l, i) => (
              <p key={i} className="text-sm text-[#C5C1B9] leading-relaxed">
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
