import { defineMcp } from "@lovable.dev/mcp-js";
import getSupportedChains from "./tools/get-supported-chains";
import getContracts from "./tools/get-contracts";
import describeRoute from "./tools/describe-route";

export default defineMcp({
  name: "flowbridge-mcp",
  title: "FlowBridge MCP",
  version: "0.1.0",
  instructions:
    "FlowBridge is a guided swap & cross-chain router on BOT Chain. Use these tools to inspect supported chains, on-chain contract addresses, and the multi-hop swap route pipeline.",
  tools: [getSupportedChains, getContracts, describeRoute],
});
