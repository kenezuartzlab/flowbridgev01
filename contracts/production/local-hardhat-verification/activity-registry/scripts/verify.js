// hardhat verify wrapper — no keys required, read-only against the explorer.
const args = require("../constructor-args.js");

async function main() {
  const hre = require("hardhat");
  await hre.run("verify:verify", {
    address: "0xa80d8740f378989F649ca14C54e4B4a42E68753c",
    contract: "FlowBridgeActivityRegistry.sol:FlowBridgeActivityRegistry",
    constructorArguments: args,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
