import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const RPC = process.env.LOCAL_RPC || "http://127.0.0.1:8545";
const RESOURCE_ID =
  "0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d";

function artifact(rel) {
  const p = path.resolve(rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing artifact: ${p}\nRun npm run compile first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function factoryFrom(rel, signer) {
  const a = artifact(rel);
  return new ethers.ContractFactory(a.abi, a.bytecode, signer);
}

async function deploy(label, factory, args = []) {
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  console.log(`${label.padEnd(30)} ${await c.getAddress()}`);
  return c;
}

async function expectRevert(label, fn) {
  try {
    await fn();
    throw new Error(`${label}: unexpectedly succeeded`);
  } catch (e) {
    if (String(e?.message ?? "").includes("unexpectedly succeeded")) throw e;
    console.log(`PASS: ${label}`);
  }
}

const provider = new ethers.JsonRpcProvider(RPC);
const network = await provider.getNetwork();
if (network.chainId !== 31337n) {
  throw new Error(`Expected local chain 31337; got ${network.chainId}`);
}

const owner = await provider.getSigner(0);
const feeSigner = await provider.getSigner(1);
const guardian = await provider.getSigner(2);
const attacker = await provider.getSigner(3);

const ownerAddress = await owner.getAddress();
const feeAddress = await feeSigner.getAddress();
const guardianAddress = await guardian.getAddress();

const StandardTokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockUSDT.json",
  owner
);
const FeeTokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockFeeOnTransferUSDT.json",
  owner
);
const ReentrantTokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockReentrantUSDT.json",
  owner
);
const GatewayF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockBotBridgeGatewayRefund.json",
  owner
);
const AdapterF = factoryFrom(
  "artifacts/contracts/FlowBridgeBridgeAdapterV1.sol/FlowBridgeBridgeAdapterV1.json",
  owner
);

async function deployRoute(token, botGasAllowed = false) {
  const gateway = await deploy("Mock BOT Gateway", GatewayF, [
    await token.getAddress(),
    RESOURCE_ID,
    feeAddress,
    10, // 0.10%
    1   // 1 USDT minimum fee
  ]);

  const adapter = await deploy("Bridge Adapter", AdapterF, [
    ownerAddress,
    guardianAddress,
    await gateway.getAddress(),
    await token.getAddress(),
    RESOURCE_ID,
    968,
    botGasAllowed
  ]);

  return { gateway, adapter };
}

console.log("\nFlowBridge BridgeAdapter V1.4.0 — ADVERSARIAL SECURITY");
console.log("Chain ID:                      ", network.chainId.toString());
console.log("No public-chain transactions are used.\n");

// 1. Fee-on-transfer source token must fail exact input accounting.
console.log("1/5 Fee-on-transfer rejection");
const feeToken = await deploy("Fee-on-transfer token", FeeTokenF, [100]); // 1%
const feeRoute = await deployRoute(feeToken, false);
const feeAdapterAddr = await feeRoute.adapter.getAddress();

await (await feeToken.mint(ownerAddress, ethers.parseUnits("100", 6))).wait();
await (await feeToken.approve(feeAdapterAddr, ethers.parseUnits("12", 6))).wait();

await expectRevert(
  "fee-on-transfer token rejected",
  () =>
    feeRoute.adapter.bridge.staticCall(
      ownerAddress,
      ownerAddress,
      ethers.parseUnits("12", 6),
      ethers.parseUnits("11", 6),
      BigInt(Math.floor(Date.now() / 1000) + 3600)
    )
);

if ((await feeToken.balanceOf(feeAdapterAddr)) !== 0n) {
  throw new Error("Fee-token static rejection left Adapter balance");
}
console.log("PASS: exact-input invariant survives fee token");

// 2. Reentrant ERC20 tries to enter claimRefund during transferFrom.
console.log("\n2/5 ERC20 reentrancy attempt");
const reToken = await deploy("Reentrant token", ReentrantTokenF);
const reRoute = await deployRoute(reToken, false);
const reAdapterAddr = await reRoute.adapter.getAddress();

await (await reToken.mint(ownerAddress, ethers.parseUnits("100", 6))).wait();
await (await reToken.configureAttack(reAdapterAddr, true)).wait();
await (await reToken.approve(reAdapterAddr, ethers.parseUnits("12", 6))).wait();

const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
await (
  await reRoute.adapter.bridge(
    ownerAddress,
    ownerAddress,
    ethers.parseUnits("12", 6),
    ethers.parseUnits("11", 6),
    deadline
  )
).wait();

if (!(await reToken.reentrancyGuardObserved())) {
  throw new Error("Reentrancy attempt did not observe ReentrancyGuard rejection");
}
console.log("PASS: ReentrancyGuard blocked token callback");

// 3. Official-state inconsistency: refunded=true AND executionConfirmed=true.
// Adapter must identify it and refuse claim.
console.log("\n3/5 Inconsistent official state fail-closed");
const token = await deploy("Standard token", StandardTokenF);
const route = await deployRoute(token, false);
const adapterAddr = await route.adapter.getAddress();

await (await token.mint(ownerAddress, ethers.parseUnits("100", 6))).wait();
await (await token.approve(adapterAddr, ethers.parseUnits("12", 6))).wait();

await (
  await route.adapter.bridge(
    ownerAddress,
    ownerAddress,
    ethers.parseUnits("12", 6),
    ethers.parseUnits("11", 6),
    deadline
  )
).wait();

await (await route.gateway.simulateRefund(1)).wait();
// Deliberately manufacture an impossible upstream state AFTER refund.
await (await route.gateway.markExecutionConfirmed(1)).wait();

const inconsistentState = await route.adapter.requestState(1);
if (inconsistentState !== 5n) {
  throw new Error(`Expected Inconsistent state=5, got ${inconsistentState}`);
}
if (await route.adapter.canClaimRefund(1)) {
  throw new Error("Inconsistent official state must never be claimable");
}

await expectRevert(
  "claim fails closed on refunded+executed inconsistency",
  () => route.adapter.connect(attacker).claimRefund.staticCall(1)
);
console.log("PASS: corrupted official state does not release funds");

// 4. Pause must block new deposits but never valid refunds.
console.log("\n4/5 Pause does not censor refunds");

await (await token.approve(adapterAddr, ethers.parseUnits("12", 6))).wait();
await (
  await route.adapter.bridge(
    ownerAddress,
    ownerAddress,
    ethers.parseUnits("12", 6),
    ethers.parseUnits("11", 6),
    deadline
  )
).wait();

await (await route.gateway.simulateRefund(2)).wait();
await (await route.adapter.connect(guardian).pauseDeposits()).wait();

if (!(await route.adapter.canClaimRefund(2))) {
  throw new Error("Valid refund became unclaimable during pause");
}

const before = await token.balanceOf(ownerAddress);
await (await route.adapter.connect(attacker).claimRefund(2)).wait();
const after = await token.balanceOf(ownerAddress);

if (after - before !== ethers.parseUnits("11", 6)) {
  throw new Error("Paused-mode refund delivery mismatch");
}
console.log("PASS: claims remain live during emergency pause");

// 5. Governance cannot take route token even while refunds are pending.
console.log("\n5/5 Governance cannot confiscate refund asset");

// Request #1 deliberately created an impossible upstream state:
// refunded=true AND executionConfirmed=true. The mock gateway had already
// transferred that refund into the Adapter, and fail-closed logic correctly
// quarantines it. Therefore step 5 must test the *incremental* liability from
// refund #3 instead of assuming the Adapter starts from a zero token balance.
await (await route.adapter.unpauseDeposits()).wait();

const adapterBalanceBeforeRefund3 = await token.balanceOf(adapterAddr);

await (await token.approve(adapterAddr, ethers.parseUnits("12", 6))).wait();
await (
  await route.adapter.bridge(
    ownerAddress,
    ownerAddress,
    ethers.parseUnits("12", 6),
    ethers.parseUnits("11", 6),
    deadline
  )
).wait();

await (await route.gateway.simulateRefund(3)).wait();

const adapterBalanceAfterRefund3 = await token.balanceOf(adapterAddr);
const refund3Delta = adapterBalanceAfterRefund3 - adapterBalanceBeforeRefund3;

if (refund3Delta !== ethers.parseUnits("11", 6)) {
  throw new Error(
    `Expected refund #3 to add exactly 11 USDT to Adapter, got ${refund3Delta}`
  );
}

const protectedRouteToken = await token.getAddress();

await expectRevert(
  "owner cannot sweep protected route token",
  () =>
    route.adapter.sweepNonRouteToken.staticCall(
      protectedRouteToken,
      ownerAddress,
      ethers.parseUnits("11", 6)
    )
);

if (!(await route.adapter.canClaimRefund(3))) {
  throw new Error("Refund liability unexpectedly became unavailable");
}

console.log("PASS: governance cannot confiscate user refund liability");
console.log("\nPASS: FlowBridge BridgeAdapter V1.4.0 adversarial security suite completed.");
