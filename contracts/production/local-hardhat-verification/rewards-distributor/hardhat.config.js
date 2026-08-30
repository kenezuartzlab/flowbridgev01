// FlowBridge frozen verification config — FlowRewardsMerkleDistributor
// Compiler settings are the exact deployment settings. DO NOT EDIT.
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
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
