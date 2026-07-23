import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import App from "@/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowBridge" },
      { name: "description", content: "FlowBridge — guided swap & cross-chain bridge for BOT and BNB chains." },
    ],
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
