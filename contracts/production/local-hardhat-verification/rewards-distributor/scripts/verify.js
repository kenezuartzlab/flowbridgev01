// hardhat verify wrapper — no keys required, read-only against the explorer.
const args = require("../constructor-args.js");

async function main() {
  const hre = require("hardhat");
  await hre.run("verify:verify", {
    address: "0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB",
    contract: "contracts/FlowRewardsMerkleDistributor.sol:FlowRewardsMerkleDistributor",
    constructorArguments: args,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
