// TEMPORARY preview harness for V36.9 layout verification — delete after checks.
import { createFileRoute } from "@tanstack/react-router";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { BudgetControlsTab } from "@/components/ops/BudgetControlsTab";

const qc = new QueryClient();

export const Route = createFileRoute("/budget-preview")({
  component: () => (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <div className="mx-auto max-w-3xl p-4">
          <BudgetControlsTab wallet="0x3d8a7fa490f9db09dd8006b74688213ace9c0164" />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  ),
});
