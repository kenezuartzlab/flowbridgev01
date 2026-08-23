import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { MissionPanel } from "@/components/assistant/MissionPanel";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Flow Assistant — Ask Anything About FlowBridge" },
      {
        name: "description",
        content:
          "Ask the FlowBridge assistant how to swap on BOT Chain, bridge USDT to BNB, ETH or TRON, cut gas costs and earn FLOW points — plain answers, no jargon.",
      },
      { property: "og:title", content: "FlowBridge Flow Assistant" },
      {
        property: "og:description",
        content: "In-app guidance for swaps, bridging, fees, gas and FLOW points.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/assistant" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/assistant" }],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const router = useRouter();
  /**
   * V15.3J — Close the AI surface without redirecting or refreshing the app.
   * Going back preserves the user's previous page and navigation context.
   */
  const hide = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    }
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="truncate font-mono text-[13px] font-black uppercase tracking-[0.14em]">
            Assistant<span className="text-primary">.</span>
          </h1>
        </div>
      </header>

      {/* V15.3H §3 — bottom nav must never overlay the review CTA on mobile. */}
      <main className="mx-auto max-w-2xl space-y-3 p-3 pb-28 sm:p-4 sm:pb-28">
        {/* V17 — goal missions: plan and prepare only, never execute. */}
        <MissionPanel />
        <AssistantChat onHide={hide} />
      </main>

      <BottomNav />
    </div>
  );
}
