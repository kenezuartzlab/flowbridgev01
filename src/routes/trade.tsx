/**
 * FlowBridge V9 — canonical Trade destination.
 *
 * Swap and Bridge live under one Trade route. This renders the exact same
 * execution workspace as the legacy `/` route (unchanged component, unchanged
 * providers, unchanged execution ordering) so every existing deep link,
 * campaign CTA and `#bridge` hash keeps working from either URL.
 */
import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import App from "@/App";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade — Swap & Bridge on FlowBridge" },
      {
        name: "description",
        content:
          "One FlowBridge workspace for swapping BOT, CA and USDT on BOT Chain and bridging USDT to BNB Chain, with live quotes and verified activity.",
      },
      { property: "og:title", content: "Trade — Swap & Bridge on FlowBridge" },
      {
        property: "og:description",
        content:
          "Swap and bridge in one place: live quotes, protocol fee, minimum received and verified campaign activity.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/trade" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/trade" }],
  }),
  component: TradePage,
});

function TradePage() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <App />
    </WagmiProvider>
  );
}
