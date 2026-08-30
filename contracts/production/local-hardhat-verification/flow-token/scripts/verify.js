// hardhat verify wrapper — no keys required, read-only against the explorer.
const args = require("../constructor-args.js");

async function main() {
  const hre = require("hardhat");
  await hre.run("verify:verify", {
    address: "0x535ddda826142ac42ce288154e9595f080940ae9",
    contract: "contracts/FlowToken.sol:FlowToken",
    constructorArguments: args,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
