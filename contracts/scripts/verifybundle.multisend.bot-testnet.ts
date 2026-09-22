/**
 * MultiSend V1 — BOT Testnet explorer verification bundle (read-only).
 *
 * Recompiles the FROZEN standard JSON input with pinned solc 0.8.20 and proves
 * the published source reproduces the bytecode that is live on chain 968 before
 * verification can be marked complete. Records every field an explorer needs:
 * compiler version, optimizer, EVM target, constructor arguments, source,
 * creation bytecode, runtime bytecode, ABI, deployment transaction and address.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, encodeAbiParameters, getAddress, http } from "viem";

const require = createRequire(import.meta.url);
const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const PACKAGE = join(REPO, "contracts/production/multisend-v1");
const config = JSON.parse(readFileSync(join(REPO, "contracts/config/multisend-bot-testnet.json"), "utf8"));
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-testnet.json");
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (config.chainId !== 968) throw new Error("TESTNET_ONLY");

const standardInputPath = join(PACKAGE, "verification/standard-input.json");
const input = JSON.parse(readFileSync(standardInputPath, "utf8"));

function readImport(path: string): { contents: string } | { error: string } {
  for (const candidate of [join(PACKAGE, path), join(REPO, "node_modules", path)]) {
    if (existsSync(candidate)) return { contents: readFileSync(candidate, "utf8") };
  }
  return { error: `not found: ${path}` };
}

const solc = require("solc-0.8.20");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
if ((output.errors ?? []).some((issue: { severity: string }) => issue.severity === "error")) {
  throw new Error("VERIFICATION_RECOMPILE_FAILED");
}
const compiled = output.contracts?.["FlowBridgeMultiSend.sol"]?.FlowBridgeMultiSend;
if (!compiled) throw new Error("CONTRACT_MISSING_FROM_RECOMPILE");

const creationBytecode = `0x${compiled.evm.bytecode.object}`;
const runtimeBytecode = `0x${compiled.evm.deployedBytecode.object}`;

const rpc = process.env["BOT_TESTNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 968) throw new Error("RPC_CHAIN_MISMATCH");

const address = getAddress(manifest.address);
const onChainRuntime = (await publicClient.getCode({ address })) ?? "0x";
/** Solidity appends a metadata hash; compare the executable prefix and the whole blob. */
const stripMetadata = (code: string) => {
  const marker = code.lastIndexOf("a264697066735822");
  return marker > 0 ? code.slice(0, marker) : code;
};
const exactMatch = onChainRuntime.toLowerCase() === runtimeBytecode.toLowerCase();
const executableMatch = stripMetadata(onChainRuntime.toLowerCase()) === stripMetadata(runtimeBytecode.toLowerCase());

const constructorArgs = [getAddress(config.initialOwner), getAddress(manifest.owner ?? config.initialOwner)];
/** The deployment used the owner as the ORIGINAL fee recipient; read it from the creation calldata. */
const deployTx = await publicClient.getTransaction({ hash: manifest.deployTxHash as `0x${string}` });
const creationCalldata = deployTx.input;
const encodedArgs = creationCalldata.slice(creationBytecode.length) as string;
const decodedOwner = `0x${encodedArgs.slice(24, 64)}`;
const decodedFeeRecipient = `0x${encodedArgs.slice(88, 128)}`;
const reEncoded = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }],
  [getAddress(decodedOwner), getAddress(decodedFeeRecipient)],
).slice(2);
const constructorArgsMatch = reEncoded.toLowerCase() === encodedArgs.toLowerCase();
const creationMatch = creationCalldata.toLowerCase().startsWith(creationBytecode.toLowerCase());

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const verdict = exactMatch && creationMatch && constructorArgsMatch ? "SOURCE_REPRODUCES_DEPLOYED_BYTECODE" : "MISMATCH";

const bundle = {
  gate: "MULTISEND_V1_BOT_TESTNET_SOURCE_REPRODUCTION",
  verdict,
  chainId: 968,
  network: "BOT Chain Testnet",
  explorer: config.explorerUrl,
  contractAddress: address,
  contractName: "FlowBridgeMultiSend",
  deploymentTransaction: manifest.deployTxHash,
  deploymentBlock: manifest.blockNumber,
  deployer: manifest.deployer,
  compiler: {
    version: "v0.8.20+commit.a1b79de6",
    language: "Solidity",
    optimizer: { enabled: input.settings.optimizer.enabled, runs: input.settings.optimizer.runs },
    viaIR: input.settings.viaIR === true,
    evmVersion: input.settings.evmVersion,
    metadataBytecodeHash: input.settings.metadata?.bytecodeHash ?? "ipfs",
    licence: "MIT",
  },
  constructorArguments: {
    types: ["address initialOwner", "address initialFeeRecipient"],
    values: [getAddress(decodedOwner), getAddress(decodedFeeRecipient)],
    abiEncoded: `0x${encodedArgs}`,
    reEncodedMatchesDeployment: constructorArgsMatch,
    note: "initialFeeRecipient was later changed on chain by the owner; see feeRecipientUpdates in the deployment manifest.",
  },
  reproduction: {
    standardJsonInput: "contracts/production/multisend-v1/verification/standard-input.json",
    recompiledRuntimeSha256: sha256(runtimeBytecode),
    onChainRuntimeSha256: sha256(onChainRuntime),
    runtimeBytes: (onChainRuntime.length - 2) / 2,
    exactRuntimeMatch: exactMatch,
    executableRuntimeMatchIgnoringMetadata: executableMatch,
    creationCalldataStartsWithRecompiledCreationBytecode: creationMatch,
    creationBytecodeSha256: sha256(creationBytecode),
    abiSha256: sha256(JSON.stringify(compiled.abi)),
    sourceSha256: sha256(readFileSync(join(PACKAGE, "FlowBridgeMultiSend.sol"), "utf8")),
  },
  submission: {
    method: "Standard JSON input (single-file verification)",
    files: {
      standardJson: "contracts/production/multisend-v1/verification/standard-input.json",
      flattenedSource: "contracts/production/multisend-v1/verification/FlowBridgeMultiSend.flat.sol",
      abi: "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json",
    },
    explorerVerified: manifest.explorerVerified === true,
    note: "scan.bohr.life exposes no public verification API; submit the frozen standard JSON through the explorer UI.",
  },
  producedAt: new Date().toISOString(),
};

writeFileSync(
  join(PACKAGE, "release/bot-testnet-source-reproduction.json"),
  JSON.stringify(bundle, null, 2) + "\n",
);
console.log(JSON.stringify(bundle, null, 2));
if (verdict !== "SOURCE_REPRODUCES_DEPLOYED_BYTECODE") throw new Error(verdict);
