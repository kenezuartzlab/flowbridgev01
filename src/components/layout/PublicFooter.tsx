import { Link, useRouterState } from "@tanstack/react-router";
import flowbridgeLogo from "@/assets/flowbridge-logo.png";
import botLogo from "@/assets/bot-chain-official-wordmark.png.asset.json";

export function PublicFooter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (["/sets", "/admin", "/ops", "/api", "/lovable", "/.mcp", "/.well-known", "/reset-password"].some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <footer className="border-t border-hairline bg-background px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:pb-8" aria-label="FlowBridge ecosystem">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="flex items-center gap-2 font-bold text-foreground"><img src={flowbridgeLogo} alt="" className="h-6 w-6 object-contain" />FlowBridge</Link>
        <span className="border-l border-hairline pl-3">Built on BOT Chain</span>
        <a href="https://botchain.ai" target="_blank" rel="noreferrer" aria-label="BOT Chain website"><img src={botLogo.url} alt="BOT Chain" className="h-4 w-[82px] object-contain" /></a>
      </div>
      <nav aria-label="Ecosystem links" className="flex flex-wrap items-center gap-4">
        <Link to="/bot-chain" className="hover:text-primary">Ecosystem</Link>
        <a href="https://botchain.ai" target="_blank" rel="noreferrer" className="hover:text-primary">BOT Chain</a>
        <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer" className="hover:text-primary">Explorer</a>
      </nav>
    </div>
  </footer>;
}