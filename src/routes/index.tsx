import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import App from "@/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowBridge — Swap & Cross-Chain Bridge for BOT Chain" },
      {
        name: "description",
        content:
          "Swap BOT, CA and USDT on BOT Chain and bridge to BNB, Ethereum and TRON with live quotes, a 0.1% fee and FLOW point rewards.",
      },
      { property: "og:title", content: "FlowBridge — Swap & Cross-Chain Bridge for BOT Chain" },
      {
        property: "og:description",
        content:
          "Guided swaps on BOT Chain plus cross-chain USDT bridging to BNB, Ethereum and TRON — with live pricing and FLOW rewards.",
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
