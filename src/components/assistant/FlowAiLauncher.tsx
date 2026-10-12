import { Link, useRouterState } from "@tanstack/react-router";
import { trackProductEvent } from "@/lib/ops/productEvents";
import { Bot } from "lucide-react";

/**
 * Global Flow AI entry point. Sits above the bottom nav on mobile and stays
 * out of the way on /assistant itself. Navigation only — no execution power.
 */
export function FlowAiLauncher() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/assistant")) return null;

  return (
    <Link
      to="/assistant"
      onClick={() => trackProductEvent("ai_opened", "ai")}
      aria-label="Open Flow AI assistant"
      className="fb-glow fixed bottom-[calc(70px+16px+min(env(safe-area-inset-bottom,0px),10px))] right-4 z-40 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground opacity-70 shadow-lg transition-[transform,opacity] hover:scale-105 hover:opacity-100 focus-visible:opacity-100 active:opacity-100 sm:bottom-6"
    >
      <Bot className="h-5 w-5" />
    </Link>
  );
}
