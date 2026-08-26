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
  console.log(`${label.padEnd(31)} ${await c.getAddress()}`);
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
  throw new Error(`Expected Hardhat local chain 31337, got ${network.chainId}`);
}

const owner = await provider.getSigner(0);
const feeSigner = await provider.getSigner(1);
const guardian = await provider.getSigner(2);

const ownerAddress = await owner.getAddress();
const feeAddress = await feeSigner.getAddress();
const guardianAddress = await guardian.getAddress();

const TokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockUSDT.json",
  owner
);
const GatewayF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockAdversarialGateway.json",
  owner
);
const AdapterF = factoryFrom(
  "artifacts/contracts/FlowBridgeBridgeAdapterV1.sol/FlowBridgeBridgeAdapterV1.json",
  owner
);

console.log("\nFlowBridge BridgeAdapter V1.4.1 — GATEWAY REENTRANCY EVIDENCE");
console.log("Chain ID:                        ", network.chainId.toString());
console.log("No public-chain transactions are used.\n");

const token = await deploy("Mock USDT", TokenF);
const gateway = await deploy("Adversarial Gateway", GatewayF, [
  await token.getAddress(),
  RESOURCE_ID,
  feeAddress,
  10,
  1
]);

const adapter = await deploy("Bridge Adapter", AdapterF, [
  ownerAddress,
  guardianAddress,
  await gateway.getAddress(),
  await token.getAddress(),
  RESOURCE_ID,
  968,
  false
]);

const adapterAddress = await adapter.getAddress();
const gatewayAddress = await gateway.getAddress();

await (await token.mint(ownerAddress, ethers.parseUnits("100", 6))).wait();

const amount = ethers.parseUnits("12", 6);
const refundable = ethers.parseUnits("11", 6);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

// ---------------------------------------------------------------------------
// A. Exact gateway external-call reentrancy path.
// ---------------------------------------------------------------------------
console.log("A/2 Gateway callback reentrancy");

await (
  await gateway.configureAttack(
    adapterAddress,
    ownerAddress,
    true,
    0
  )
).wait();

await (await token.approve(adapterAddress, amount)).wait();

await (
  await adapter.bridge(
    ownerAddress,
    ownerAddress,
    amount,
    refundable,
    deadline
  )
).wait();

if (!(await gateway.claimReentrancyGuardObserved())) {
  throw new Error("Gateway -> claimRefund reentrancy was not blocked by ReentrancyGuard");
}

if (!(await gateway.bridgeReentrancyGuardObserved())) {
  throw new Error("Gateway -> bridge reentrancy was not blocked by ReentrancyGuard");
}

if ((await token.balanceOf(adapterAddress)) !== 0n) {
  throw new Error("Adapter retained route-token residue after reentrancy test");
}

if ((await token.allowance(adapterAddress, gatewayAddress)) !== 0n) {
  throw new Error("Adapter -> gateway allowance remained after reentrancy test");
}

const req1 = await adapter.getRequest(1);
if (req1.payer.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error("Request #1 payer attribution changed during gateway callback");
}

console.log("PASS: gateway -> claimRefund callback blocked");
console.log("PASS: gateway -> bridge callback blocked");
console.log("PASS: normal outer bridge transaction remained correct");
console.log("PASS: zero Adapter residue and gateway allowance");

// ---------------------------------------------------------------------------
// B. Balance mutation during gateway call must fail closed atomically.
// ---------------------------------------------------------------------------
console.log("\nB/2 Gateway balance-mutation fail-closed");

// Give gateway one micro-USDT that it will try to inject into Adapter while
// Adapter is inside the official gateway call.
await (await token.mint(gatewayAddress, 1n)).wait();

await (
  await gateway.configureAttack(
    adapterAddress,
    ownerAddress,
    false,
    1n
  )
).wait();

await (await token.approve(adapterAddress, amount)).wait();

const userBefore = await token.balanceOf(ownerAddress);
const adapterBefore = await token.balanceOf(adapterAddress);
const gatewayBefore = await token.balanceOf(gatewayAddress);
const feeBefore = await token.balanceOf(feeAddress);
const nonceBefore = await gateway.localNonce();

await expectRevert(
  "unexpected gateway balance mutation rejected",
  () =>
    adapter.bridge.staticCall(
      ownerAddress,
      ownerAddress,
      amount,
      refundable,
      deadline
    )
);

// Send a real tx path too. Depending on provider estimation, this may reject
// before broadcast; either way there must be no committed state transition.
await expectRevert(
  "real bridge path fails closed on balance mutation",
  async () => {
    const tx = await adapter.bridge(
      ownerAddress,
      ownerAddress,
      amount,
      refundable,
      deadline
    );
    await tx.wait();
  }
);

const userAfter = await token.balanceOf(ownerAddress);
const adapterAfter = await token.balanceOf(adapterAddress);
const gatewayAfter = await token.balanceOf(gatewayAddress);
const feeAfter = await token.balanceOf(feeAddress);
const nonceAfter = await gateway.localNonce();

if (userAfter !== userBefore) {
  throw new Error("Failed bridge changed user token balance");
}
if (adapterAfter !== adapterBefore) {
  throw new Error("Failed bridge changed Adapter token balance");
}
if (gatewayAfter !== gatewayBefore) {
  throw new Error("Failed bridge changed gateway token balance");
}
if (feeAfter !== feeBefore) {
  throw new Error("Failed bridge changed fee sink balance");
}
if (nonceAfter !== nonceBefore) {
  throw new Error("Failed bridge committed a gateway nonce");
}
if ((await token.allowance(adapterAddress, gatewayAddress)) !== 0n) {
  throw new Error("Failed bridge left Adapter -> gateway allowance");
}

console.log("PASS: balance invariant rejected upstream mutation");
console.log("PASS: source transaction rolled back atomically");
console.log("PASS: payer/Adapter/gateway/fee balances unchanged");
console.log("PASS: gateway nonce unchanged");
console.log("PASS: no Adapter -> gateway allowance remained");

console.log(
  "\nPASS: FlowBridge BridgeAdapter V1.4.1 gateway reentrancy/balance evidence completed."
);
