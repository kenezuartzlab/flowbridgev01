// hardhat verify wrapper — no keys required, read-only against the explorer.
const args = require("../constructor-args.js");

async function main() {
  const hre = require("hardhat");
  await hre.run("verify:verify", {
    address: "0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8",
    contract: "contracts/FlowStakingVaultV2.sol:FlowStakingVaultV2",
    constructorArguments: args,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
