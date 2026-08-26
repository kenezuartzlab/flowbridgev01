import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const RPC = process.env.LOCAL_RPC || "http://127.0.0.1:8545";
const CASES = Number(process.env.ADAPTER_FUZZ_CASES || "40");
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

function makeRng(seed) {
  let x = BigInt(seed) & ((1n << 64n) - 1n);
  return () => {
    x =
      (6364136223846793005n * x + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    return x;
  };
}

function randInt(rng, min, max) {
  const span = BigInt(max - min + 1);
  return min + Number(rng() % span);
}

function expectedFee(amount, feeBps) {
  if (feeBps === 0) return 0n;
  const proportional = (amount * BigInt(feeBps)) / 10_000n;
  const minFee = ethers.parseUnits("1", 6);
  return proportional > minFee ? proportional : minFee;
}

const provider = new ethers.JsonRpcProvider(RPC);
const network = await provider.getNetwork();
if (network.chainId !== 31337n) {
  throw new Error(`Expected local chain 31337; got ${network.chainId}`);
}

if (!Number.isInteger(CASES) || CASES < 1 || CASES > 250) {
  throw new Error("ADAPTER_FUZZ_CASES must be 1..250");
}

const owner = await provider.getSigner(0);
const feeSigner = await provider.getSigner(1);
const recipientA = await provider.getSigner(2);
const recipientB = await provider.getSigner(3);
const automation = await provider.getSigner(4);

const ownerAddress = await owner.getAddress();
const feeAddress = await feeSigner.getAddress();
const recipientAddresses = [
  ownerAddress,
  await recipientA.getAddress(),
  await recipientB.getAddress()
];

const TokenF = factoryFrom(
  "artifacts/contracts/test/FlowBridgeBridgeAdapterMocks.sol/MockUSDT.json",
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

const token = await TokenF.deploy();
await token.waitForDeployment();

const gateway = await GatewayF.deploy(
  await token.getAddress(),
  RESOURCE_ID,
  feeAddress,
  0,
  1
);
await gateway.waitForDeployment();

const adapter = await AdapterF.deploy(
  ownerAddress,
  ownerAddress,
  await gateway.getAddress(),
  await token.getAddress(),
  RESOURCE_ID,
  968,
  false
);
await adapter.waitForDeployment();

const adapterAddress = await adapter.getAddress();
const gatewayAddress = await gateway.getAddress();
const coreAddress = await gateway.Bridge();

const core = new ethers.Contract(
  coreAddress,
  ["function setFee(uint256,bytes32,uint256)"],
  owner
);

await (await token.mint(ownerAddress, ethers.parseUnits("100000", 6))).wait();

const rng = makeRng(0xF10B1D63n);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);

let refunds = 0;
let executed = 0;

console.log("\nFlowBridge BridgeAdapter V1.4.0 — DETERMINISTIC RANDOMIZED PROPERTIES");
console.log("Cases:                         ", CASES);
console.log("Seed:                          0xF10B1D63");
console.log("No public-chain transactions are used.\n");

for (let i = 0; i < CASES; i++) {
  // 11.000000 .. 500.999999 USDT, safely above current test minimum.
  const whole = randInt(rng, 11, 500);
  const micros = randInt(rng, 0, 999999);
  const amount = BigInt(whole) * 1_000_000n + BigInt(micros);

  // Exercise 0..5% source bridge fees, including the 1-USDT minimum fee branch.
  const feeBps = randInt(rng, 0, 500);

  const destinationRecipient =
    recipientAddresses[randInt(rng, 0, recipientAddresses.length - 1)];
  const refundRecipient =
    recipientAddresses[randInt(rng, 0, recipientAddresses.length - 1)];

  await (await core.setFee(968, RESOURCE_ID, feeBps)).wait();

  const fee = expectedFee(amount, feeBps);
  if (amount <= fee) {
    throw new Error(`Generated invalid case ${i}: amount <= fee`);
  }
  const refundable = amount - fee;

  const preview = await adapter.previewSource(amount);
  if (preview[0] !== fee || preview[1] !== refundable) {
    throw new Error(
      `Case ${i}: preview mismatch expected fee=${fee} refundable=${refundable}, got fee=${preview[0]} refundable=${preview[1]}`
    );
  }

  const ownerBefore = await token.balanceOf(ownerAddress);

  await (await token.approve(adapterAddress, amount)).wait();

  const tx = await adapter.bridge(
    destinationRecipient,
    refundRecipient,
    amount,
    refundable,
    deadline
  );
  await tx.wait();

  const nonce = BigInt(i + 1);
  const ownerAfter = await token.balanceOf(ownerAddress);

  if (ownerBefore - ownerAfter !== amount) {
    throw new Error(`Case ${i}: exact payer debit invariant failed`);
  }

  const req = await adapter.getRequest(nonce);

  if (req.payer.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new Error(`Case ${i}: payer mismatch`);
  }
  if (
    req.destinationRecipient.toLowerCase() !==
    destinationRecipient.toLowerCase()
  ) {
    throw new Error(`Case ${i}: destination recipient mismatch`);
  }
  if (req.refundRecipient.toLowerCase() !== refundRecipient.toLowerCase()) {
    throw new Error(`Case ${i}: refund recipient mismatch`);
  }
  if (req.amountIn !== amount) {
    throw new Error(`Case ${i}: amount mismatch`);
  }
  if (req.refundableAmount !== refundable) {
    throw new Error(`Case ${i}: refundable mismatch`);
  }
  if (req.officialFeeAmount !== fee) {
    throw new Error(`Case ${i}: official fee mismatch`);
  }

  if ((await token.balanceOf(adapterAddress)) !== 0n) {
    throw new Error(`Case ${i}: unexpected Adapter route-token residue`);
  }
  if ((await token.allowance(adapterAddress, gatewayAddress)) !== 0n) {
    throw new Error(`Case ${i}: Adapter -> Gateway allowance residue`);
  }
  if ((await token.allowance(ownerAddress, adapterAddress)) !== 0n) {
    throw new Error(`Case ${i}: payer -> Adapter allowance residue`);
  }

  // Deterministic outcome coverage: alternate refund and execution-confirmed.


  // Randomness remains on amounts, fees, destination and refund recipients.


  const refundCase = (i % 2) === 0;

  if (refundCase) {
    await (await gateway.simulateRefund(nonce)).wait();

    if ((await adapter.requestState(nonce)) !== 3n) {
      throw new Error(`Case ${i}: expected RefundAvailable state`);
    }
    if (!(await adapter.canClaimRefund(nonce))) {
      throw new Error(`Case ${i}: refund should be claimable`);
    }

    const receiverBefore = await token.balanceOf(refundRecipient);
    await (await adapter.connect(automation).claimRefund(nonce)).wait();
    const receiverAfter = await token.balanceOf(refundRecipient);

    if (receiverAfter - receiverBefore !== refundable) {
      throw new Error(`Case ${i}: exact refund delivery invariant failed`);
    }

    if ((await adapter.requestState(nonce)) !== 4n) {
      throw new Error(`Case ${i}: expected RefundClaimed state`);
    }
    if ((await token.balanceOf(adapterAddress)) !== 0n) {
      throw new Error(`Case ${i}: Adapter residue after refund claim`);
    }

    refunds++;
  } else {
    await (await gateway.markExecutionConfirmed(nonce)).wait();

    if ((await adapter.requestState(nonce)) !== 2n) {
      throw new Error(`Case ${i}: expected Executed state`);
    }
    if (await adapter.canClaimRefund(nonce)) {
      throw new Error(`Case ${i}: executed request became claimable`);
    }

    executed++;
  }

  if ((i + 1) % 10 === 0 || i + 1 === CASES) {
    console.log(
      `Progress: ${String(i + 1).padStart(3)}/${CASES} | refunds=${refunds} executed=${executed}`
    );
  }
}

if (CASES >= 2 && (refunds === 0 || executed === 0)) {
  throw new Error(
    `Coverage failure: refunds=${refunds}, executed=${executed}. Both branches must execute.`
  );
}

if (CASES >= 2 && Math.abs(refunds - executed) > 1) {
  throw new Error(
    `Coverage imbalance: refunds=${refunds}, executed=${executed}`
  );
}

console.log(
  `\nOutcome coverage: refunds=${refunds}, executed=${executed} — PASS`
);

console.log("\nProperties checked across every case:");
console.log("  preview fee == official accounting");
console.log("  refundable + official fee == source amount");
console.log("  exact payer debit");
console.log("  immutable destination/refund attribution");
console.log("  zero Adapter route-token residue after submission");
console.log("  zero payer->Adapter allowance after submission");
console.log("  zero Adapter->Gateway allowance after submission");
console.log("  exact claim amount for refunded requests");
console.log("  no claimability after execution confirmation");
console.log("  zero Adapter residue after refund claim");

console.log(
  `\nPASS: ${CASES} deterministic randomized BridgeAdapter accounting cases completed with both refund and execution-confirmed branches.`
);
