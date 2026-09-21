/**
 * FlowBridge MultiSend V1 — dedicated destination.
 *
 * Wrapped in the same Wagmi provider as Trade so wallet connection, network
 * switching and signing behave identically. Every source wallet authorizes its
 * own transaction; FlowBridge never holds a signing key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { SafeAreaPage } from "@/components/ui-kit/primitives";
import { MultiSendWorkspace } from "@/components/multisend/MultiSendWorkspace";

export const Route = createFileRoute("/multisend")({
  head: () => ({
    meta: [
      { title: "MultiSend — FlowBridge" },
      {
        name: "description",
        content:
          "Send, consolidate, or organize multiple wallet transfers on BOT Chain and BNB Chain in one reviewed session.",
      },
      { property: "og:title", content: "MultiSend — FlowBridge" },
      {
        property: "og:description",
        content:
          "Batch transfers from one or many wallets with exact amounts, a clear fee, CSV and QR input, and one grouped receipt.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/multisend" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/multisend" }],
  }),
  component: MultiSendPage,
});

function MultiSendPage() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <SafeAreaPage>
        <MultiSendWorkspace />
      </SafeAreaPage>
    </WagmiProvider>
  );
}
