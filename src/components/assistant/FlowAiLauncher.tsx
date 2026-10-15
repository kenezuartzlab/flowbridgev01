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
      className="fb-glow fixed bottom-[calc(7px+min(env(safe-area-inset-bottom,0px),10px))] right-2 z-40 grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground opacity-70 shadow-lg transition-[transform,opacity] hover:scale-105 hover:opacity-100 focus-visible:opacity-100 active:opacity-100 md:bottom-6 md:right-4 md:h-12 md:w-12"
    >
      <Bot className="h-5 w-5" />
    </Link>
  );
}
