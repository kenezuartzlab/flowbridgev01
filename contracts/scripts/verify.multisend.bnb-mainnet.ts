/**
 * FlowBridge MultiSend V1 — BscScan (BNB Mainnet, chain 56) source verification.
 *
 * Submits the exact self-contained Standard-JSON bundle that produced the
 * deployed bytecode. No flattening, no rebuild, no source change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(
  readFileSync(join(REPO, "contracts/config/multisend-bnb-mainnet.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(join(REPO, "contracts/deployments/multisend-bnb-mainnet.json"), "utf8"),
);
const artifact = JSON.parse(
  readFileSync(
    join(REPO, "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json"),
    "utf8",
  ),
);
const bundle = readFileSync(join(REPO, artifact.bundle.path), "utf8");
const apiKey = process.env["BSCSCAN_API_KEY"];
if (!apiKey) throw new Error("BSCSCAN_API_KEY_MISSING");
const api = `${config.explorerApiUrl}?chainid=56`;

const post = async (params: Record<string, string>) => {
  const body = new URLSearchParams({ apikey: apiKey, ...params });
  const res = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await res.json()) as { status: string; message: string; result: string };
};

const status = async (guid: string) =>
  (await (
    await fetch(
      `${api}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`,
    )
  ).json()) as { status: string; result: string };

let guid: string | null = null;
if (!process.argv.includes("--status-only")) {
  const submit = await post({
    module: "contract",
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    contractaddress: manifest.address,
    sourceCode: bundle,
    contractname: artifact.contractTarget,
    compilerversion: artifact.compiler.version,
    constructorArguements: manifest.constructorArguments.abiEncoded.replace(/^0x/, ""),
    licenseType: "3",
  });
  console.log("submit:", JSON.stringify(submit));
  if (submit.status === "1") guid = submit.result;
  else if (/already verified/i.test(submit.result)) guid = null;
  else throw new Error(`SUBMISSION_REJECTED:${submit.result}`);
}

if (guid) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await status(guid);
    console.log("status:", JSON.stringify(s));
    if (/pending/i.test(s.result)) continue;
    if (s.status === "1" || /already verified/i.test(s.result)) break;
    throw new Error(`VERIFICATION_FAILED:${s.result}`);
  }
}

const published = (await (
  await fetch(
    `${api}&module=contract&action=getsourcecode&address=${manifest.address}&apikey=${apiKey}`,
  )
).json()) as { result: Array<Record<string, string>> };
const row = published.result?.[0] ?? {};
const verified = Boolean(row["SourceCode"]);
const record = {
  explorer: config.explorerUrl,
  api: config.explorerApiUrl,
  verifiedAt: new Date().toISOString(),
  verified,
  compilerVersion: row["CompilerVersion"],
  optimizationUsed: row["OptimizationUsed"],
  runs: row["Runs"],
  evmVersion: row["EVMVersion"],
  licenseType: row["LicenseType"],
  publishedConstructorArgs: row["ConstructorArguments"],
  constructorArgsMatch:
    (row["ConstructorArguments"] ?? "").toLowerCase() ===
    manifest.constructorArguments.abiEncoded.replace(/^0x/, "").toLowerCase(),
  contractName: row["ContractName"],
};
console.log(JSON.stringify({ verdict: verified ? "BNB MAINNET SOURCE VERIFICATION PASS" : "BNB MAINNET SOURCE VERIFICATION FAIL", record }, null, 2));
if (verified) {
  manifest.explorerVerified = true;
  manifest.explorerVerification = record;
  writeFileSync(
    join(REPO, "contracts/deployments/multisend-bnb-mainnet.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} else {
  process.exit(1);
}
