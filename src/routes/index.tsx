import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import App from "@/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowBridge — Web3 Toolkit for BOT Chain" },
      {
        name: "description",
        content:
          "Swap, bridge, stake and earn on FlowBridge. The community Web3 toolkit for BOT Chain with cross-chain USDT transfers, verified campaigns, and AI-assisted trades.",
      },
      { property: "og:title", content: "FlowBridge — Web3 Toolkit for BOT Chain" },
      {
        property: "og:description",
        content:
          "Swap, bridge, stake and earn on FlowBridge. The community Web3 toolkit for BOT Chain with cross-chain USDT transfers, verified campaigns, and AI-assisted trades.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/" }],
  }),
  component: Index,
});


function Index() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <App />
    </WagmiProvider>
  );
}
