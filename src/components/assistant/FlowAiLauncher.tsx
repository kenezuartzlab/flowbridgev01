import { Link, useRouterState } from "@tanstack/react-router";
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
      aria-label="Open Flow AI assistant"
      className="fb-glow fixed bottom-20 right-4 z-40 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 sm:bottom-6"
    >
      <Bot className="h-5 w-5" />
    </Link>
  );
}
