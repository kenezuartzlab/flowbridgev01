import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const RPC = process.env.LOCAL_RPC || "http://127.0.0.1:8545";

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
  console.log(`${label.padEnd(28)} ${await c.getAddress()}`);
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
const guardianSigner = await provider.getSigner(2);
const automationSigner = await provider.getSigner(3);

const ownerAddress = await owner.getAddress();
const feeAddress = await feeSigner.getAddress();
const guardianAddress = await guardianSigner.getAddress();
const automationAddress = await automationSigner.getAddress();

const TokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockUSDT.json",
  owner
);
const OtherF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockOtherToken.json",
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

const RESOURCE_ID =
  "0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d";

console.log("\nFlowBridge BridgeAdapter V1 — INSTITUTIONAL LOCAL SMOKE");
console.log("Chain ID:                   ", network.chainId.toString());
console.log("Owner:                      ", ownerAddress);
console.log("Guardian:                   ", guardianAddress);
console.log("Automation trigger:         ", automationAddress);
console.log("No public-chain transaction is used.\n");

const usdt = await deploy("Mock USDT", TokenF);
const other = await deploy("Mock Other Token", OtherF);

const gateway = await deploy("Mock BOT Gateway", GatewayF, [
  await usdt.getAddress(),
  RESOURCE_ID,
  feeAddress,
  10, // 0.10%
  1   // 1-USDT minimum fee
]);

const adapter = await deploy("FlowBridgeBridgeAdapterV1", AdapterF, [
  ownerAddress,
  guardianAddress,
  await gateway.getAddress(),
  await usdt.getAddress(),
  RESOURCE_ID,
  968,
  false // institutional production profile: BOT-gas mode disabled
]);

const adapterAddress = await adapter.getAddress();
const gatewayAddress = await gateway.getAddress();
const usdtAddress = await usdt.getAddress();

await (await usdt.mint(ownerAddress, ethers.parseUnits("250", 6))).wait();

const preview = await adapter.previewSource(ethers.parseUnits("12", 6));
if (preview[0] !== ethers.parseUnits("1", 6)) {
  throw new Error("Preview official fee mismatch");
}
if (preview[1] !== ethers.parseUnits("11", 6)) {
  throw new Error("Preview refundable amount mismatch");
}
console.log("\nPreview fee accounting:     PASS");

const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const amount = ethers.parseUnits("12", 6);
const minRefundable = ethers.parseUnits("11", 6);

await (await usdt.approve(adapterAddress, amount)).wait();

const staticNonce = await adapter.bridge.staticCall(
  ownerAddress,
  ownerAddress,
  amount,
  minRefundable,
  deadline
);
if (staticNonce !== 1n) throw new Error("Unexpected static gateway nonce");
console.log("Static bridge simulation:   PASS");

const ownerBefore = await usdt.balanceOf(ownerAddress);

const tx = await adapter.bridge(
  ownerAddress,
  ownerAddress,
  amount,
  minRefundable,
  deadline
);
const rc = await tx.wait();

const ownerAfter = await usdt.balanceOf(ownerAddress);
if (ownerBefore - ownerAfter !== amount) {
  throw new Error("Exact payer debit failed");
}

const request = await adapter.getRequest(1);
if (request.payer.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error("Request payer mismatch");
}
if (request.refundRecipient.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error("Refund recipient mismatch");
}
if (request.refundableAmount !== ethers.parseUnits("11", 6)) {
  throw new Error("Request refundable amount mismatch");
}
if (request.officialFeeAmount !== ethers.parseUnits("1", 6)) {
  throw new Error("Request official fee mismatch");
}

const record = await gateway.depositRecords(1);
if (record.sender.toLowerCase() !== adapterAddress.toLowerCase()) {
  throw new Error("Official gateway did not record Adapter as sender");
}
if (record.recipient.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error("Official gateway destination recipient mismatch");
}

const refundData = await gateway.refundDatas(1);
if (refundData.sender.toLowerCase() !== adapterAddress.toLowerCase()) {
  throw new Error("Official refund sender attribution mismatch");
}

if ((await usdt.balanceOf(adapterAddress)) !== 0n) {
  throw new Error("Adapter route-token residue after deposit");
}
if ((await usdt.allowance(adapterAddress, gatewayAddress)) !== 0n) {
  throw new Error("Adapter -> gateway allowance not cleared");
}
if ((await usdt.allowance(ownerAddress, adapterAddress)) !== 0n) {
  throw new Error("Payer -> adapter allowance not consumed");
}

console.log("Exact source custody:       PASS");
console.log("Official sender=Adapter:    PASS");
console.log("Destination recipient:      PASS");
console.log("Allowance cleanup:          PASS");
console.log("Zero route-token residue:   PASS");

await expectRevert(
  "BOT-gas mode disabled in institutional profile",
  () =>
    adapter.bridgeWithBotGas.staticCall(
      ownerAddress,
      ownerAddress,
      amount,
      minRefundable,
      deadline
    )
);

// User minimum protection: 11.000001 required while official result is 11.
await (await usdt.approve(adapterAddress, amount)).wait();
await expectRevert(
  "post-gateway refundable bound",
  () =>
    adapter.bridge.staticCall(
      ownerAddress,
      ownerAddress,
      amount,
      ethers.parseUnits("11.000001", 6),
      deadline
    )
);
await (await usdt.approve(adapterAddress, 0)).wait();

await expectRevert(
  "expired deadline",
  () =>
    adapter.bridge.staticCall(
      ownerAddress,
      ownerAddress,
      amount,
      minRefundable,
      1
    )
);

// Simulate official bridge refund.
await (await gateway.simulateRefund(1)).wait();

if ((await adapter.requestState(1)) !== 3n) {
  throw new Error("Expected RefundAvailable state");
}
if (!(await adapter.canClaimRefund(1))) {
  throw new Error("Refund should be claimable");
}

const refundRecipientBefore = await usdt.balanceOf(ownerAddress);

// A third party triggers the claim; payout is still fixed to owner/refund recipient.
const adapterAutomation = adapter.connect(automationSigner);
await (await adapterAutomation.claimRefund(1)).wait();

const refundRecipientAfter = await usdt.balanceOf(ownerAddress);
if (
  refundRecipientAfter - refundRecipientBefore !==
  ethers.parseUnits("11", 6)
) {
  throw new Error("Exact refund delivery failed");
}

if ((await adapter.requestState(1)) !== 4n) {
  throw new Error("Expected RefundClaimed state");
}
if ((await usdt.balanceOf(adapterAddress)) !== 0n) {
  throw new Error("Adapter residue after refund claim");
}

console.log("Official refund detected:   PASS");
console.log("Permissionless claim trigger: PASS");
console.log("Fixed refund recipient:     PASS");
console.log("Exact refund delivery:      PASS");
console.log("Zero residue after claim:   PASS");

await expectRevert(
  "double refund claim blocked",
  () => adapterAutomation.claimRefund.staticCall(1)
);

// Second request: execution confirmation prevents official mock refund.
await (await usdt.approve(adapterAddress, amount)).wait();
await (
  await adapter.bridge(
    ownerAddress,
    ownerAddress,
    amount,
    minRefundable,
    deadline
  )
).wait();

await (await gateway.markExecutionConfirmed(2)).wait();

if ((await adapter.requestState(2)) !== 2n) {
  throw new Error("Expected Executed state");
}

await expectRevert(
  "refund after execution confirmation blocked by official gateway",
  () => gateway.simulateRefund.staticCall(2)
);

// Guardian can pause deposits, but cannot unpause.
await (await adapter.connect(guardianSigner).pauseDeposits()).wait();

await expectRevert(
  "new deposits blocked while paused",
  () =>
    adapter.bridge.staticCall(
      ownerAddress,
      ownerAddress,
      amount,
      minRefundable,
      deadline
    )
);

await expectRevert(
  "guardian cannot unpause",
  () => adapter.connect(guardianSigner).unpauseDeposits.staticCall()
);

await (await adapter.unpauseDeposits()).wait();
console.log("Guardian pause / owner unpause: PASS");

await expectRevert(
  "guardian cannot be set to zero",
  () => adapter.setGuardian.staticCall(ethers.ZeroAddress)
);
console.log("Guardian zero-address protection: PASS");


// Governance cannot sweep the protected route token.
await expectRevert(
  "route token cannot be swept by governance",
  () => adapter.sweepNonRouteToken.staticCall(usdtAddress, ownerAddress, 1)
);

// Non-route accidental token can be recovered.
await (await other.mint(adapterAddress, ethers.parseEther("1"))).wait();
await (
  await adapter.sweepNonRouteToken(
    await other.getAddress(),
    ownerAddress,
    ethers.parseEther("1")
  )
).wait();

if ((await other.balanceOf(adapterAddress)) !== 0n) {
  throw new Error("Non-route token sweep failed");
}
console.log("Protected route-token custody: PASS");
console.log("Non-route token recovery:      PASS");

await expectRevert(
  "ownership renounce disabled",
  () => adapter.renounceOwnership.staticCall()
);

let bridgeRequested = false;
for (const log of rc.logs) {
  try {
    const parsed = adapter.interface.parseLog(log);
    if (parsed?.name === "BridgeRequested") bridgeRequested = true;
  } catch {}
}
if (!bridgeRequested) throw new Error("BridgeRequested event missing");

console.log("BridgeRequested event:      PASS");
console.log("\nPASS: FlowBridgeBridgeAdapterV1 institutional local smoke completed.");
