require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
      evmVersion: "cancun",
      metadata: {
        bytecodeHash: "ipfs",
        appendCBOR: true,
      },
    },
  },

  paths: {
    sources: ".",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  networks: {
    botMainnet: {
      url: process.env.BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai",
      chainId: 677,
    },
  },

  etherscan: {
    apiKey: {
      botMainnet: "blockscout",
    },

    customChains: [
      {
        network: "botMainnet",
        chainId: 677,
        urls: {
          apiURL: "https://scan.botchain.ai/api",
          browserURL: "https://scan.botchain.ai",
        },
      },
    ],
  },

  sourcify: {
    enabled: false,
  },
};