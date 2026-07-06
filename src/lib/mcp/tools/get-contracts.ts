import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { MAINNET_CONTRACTS, TESTNET_CONTRACTS } from "@/lib/contracts";

export default defineTool({
  name: "get_contracts",
  title: "Get FlowBridge contracts",
  description:
    "Return FlowBridge's on-chain contract addresses on BOT Chain (routers, bridge proxies, tokens, WBOT, USDT pools). Choose 'mainnet' or 'testnet'.",
  inputSchema: {
    network: z
      .enum(["mainnet", "testnet"])
      .describe("Which BOT Chain network to return contracts for."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ network }) => {
    const contracts = network === "mainnet" ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
    return {
      content: [{ type: "text", text: JSON.stringify(contracts, null, 2) }],
      structuredContent: { network, contracts },
    };
  },
});
