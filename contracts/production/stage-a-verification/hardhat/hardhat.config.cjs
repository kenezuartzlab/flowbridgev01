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
  paths: { sources: "." },
  networks: { botmainnet: { url: "https://rpc.botchain.ai", chainId: 677 } },
  etherscan: {
    apiKey: { botmainnet: "botchain" },
    customChains: [
      { network: "botmainnet", chainId: 677,
        urls: { apiURL: "https://scan.botchain.ai/api", browserURL: "https://scan.botchain.ai" } },
    ],
  },
  sourcify: { enabled: false },
};
