// FlowBridge frozen verification config — FlowBridgeActivityRegistry
// Compiler settings are the exact deployment settings. DO NOT EDIT.
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
      evmVersion: "shanghai",
    },
  },
  networks: {
    bot: {
      url: process.env.BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai",
      chainId: 677,
    },
  },
  etherscan: {
    apiKey: { bot: process.env.BOT_EXPLORER_API_KEY || "empty" },
    customChains: [
      {
        network: "bot",
        chainId: 677,
        urls: { apiURL: "https://scan.botchain.ai/api", browserURL: "https://scan.botchain.ai" },
      },
    ],
  },
  sourcify: { enabled: false },
};
