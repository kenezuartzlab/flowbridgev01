import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { z } from "zod";
import { wagmiConfig } from "@/lib/wagmi";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { LiquidityWorkspace } from "@/components/liquidity/LiquidityWorkspace";

const search = z.object({ tab: z.enum(["pools", "add", "create", "positions"]).optional() });

export const Route = createFileRoute("/liquidity")({
  validateSearch: (s) => search.parse(s),
  head: () => ({
    meta: [
      { title: "Liquidity — FlowBridge" },
      { name: "description", content: "Add and remove BDEX and CaSwap liquidity, create pools and manage V3 positions on BOT Chain." },
      { property: "og:title", content: "Liquidity — FlowBridge" },
      { property: "og:description", content: "Add and remove BDEX and CaSwap liquidity, create pools and manage V3 positions on BOT Chain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiquidityPage,
});

function LiquidityPage() {
  const { tab } = Route.useSearch();
  return (
    <WagmiProvider config={wagmiConfig}>
      <div className="min-h-screen bg-background text-foreground">
        <AppTopBar eyebrow="Trade" title="Liquidity" initial="L" />
        <main className="mx-auto w-full max-w-2xl space-y-3 px-3 pt-3" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
          <LiquidityWorkspace initialTab={tab ?? "pools"} />
        </main>
        <BottomNav />
      </div>
    </WagmiProvider>
  );
}
