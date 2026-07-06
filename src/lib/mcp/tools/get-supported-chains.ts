import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_supported_chains",
  title: "Get supported chains",
  description:
    "List the blockchains FlowBridge supports for swapping and bridging, including chain IDs, native currencies, RPC URLs, and block explorers.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const chains = [
      {
        id: 677,
        name: "BOT Chain Mainnet",
        nativeCurrency: "BOT",
        rpc: "https://rpc.botchain.ai",
        explorer: "https://scan.botchain.ai",
        testnet: false,
      },
      {
        id: 968,
        name: "BOT Chain Testnet",
        nativeCurrency: "tBOT",
        rpc: "https://rpc.bohr.life",
        explorer: "https://scan.bohr.life",
        testnet: true,
      },
      {
        id: 56,
        name: "BNB Smart Chain",
        nativeCurrency: "BNB",
        rpc: "https://bsc-dataseed.binance.org/",
        explorer: "https://bscscan.com",
        testnet: false,
      },
      {
        id: 97,
        name: "BNB Smart Chain Testnet",
        nativeCurrency: "tBNB",
        rpc: "https://data-seed-prebsc-1-s1.binance.org:8545",
        explorer: "https://testnet.bscscan.com",
        testnet: true,
      },
    ];
    return {
      content: [{ type: "text", text: JSON.stringify(chains, null, 2) }],
      structuredContent: { chains },
    };
  },
});
