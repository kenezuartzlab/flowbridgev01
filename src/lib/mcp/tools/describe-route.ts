import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "describe_route",
  title: "Describe FlowBridge route",
  description:
    "Describe the guided FlowBridge cross-chain swap pipeline (CA → BOT → USDT on BOT → USDT on BNB), including which routers and bridge are used at each hop and the community fee.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const route = {
      pipeline: [
        {
          step: 1,
          name: "CA → BOT",
          venue: "CaSwap V2 (via FlowBridgeRouter)",
          chain: "BOT Chain",
        },
        {
          step: 2,
          name: "BOT → USDT (BOT)",
          venue: "BDex V3 (via FlowBridgeRouter)",
          chain: "BOT Chain",
        },
        {
          step: 3,
          name: "USDT (BOT) → USDT (BNB)",
          venue: "Bohr atomic bridge proxy",
          chain: "BOT Chain → BNB Smart Chain",
        },
      ],
      communityFeeBps: 10,
      feeNote:
        "0.1% community fee is collected atomically inside each FlowBridgeRouter swap tx.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(route, null, 2) }],
      structuredContent: route,
    };
  },
});
