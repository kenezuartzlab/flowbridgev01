import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ClientApp = lazy(async () => {
  const [{ WagmiProvider }, { wagmiConfig }, { default: App }] = await Promise.all([
    import("wagmi"),
    import("@/lib/wagmi"),
    import("@/App"),
  ]);
  return {
    default: () => (
      <WagmiProvider config={wagmiConfig}>
        <App />
      </WagmiProvider>
    ),
  };
});

export const Route = createFileRoute("/")({
  ssr: false,
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
    <Suspense fallback={null}>
      <ClientApp />
    </Suspense>
  );
}
