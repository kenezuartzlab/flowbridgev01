// Submits the preserved Standard-JSON input to the explorer from YOUR machine.
// The bundle is sent verbatim, so the explorer compiles exactly what was
// deployed. Read-only with respect to the chain: no key, no transaction.
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ADDRESS = "0xa80d8740f378989F649ca14C54e4B4a42E68753c";
const EXPLORER = process.env.BOT_EXPLORER_URL || "https://scan.botchain.ai";
const bundle = readFileSync(path.join(__dirname, "..", "standard-input.json"), "utf8");

async function main() {
  const form = new FormData();
  form.append("compiler_version", "v0.8.20+commit.a1b79de6");
  form.append("license_type", "mit");
  form.append("autodetect_constructor_args", "false");
  form.append("constructor_args", "0x00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507000000000000000000000000fa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e470000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef");
  form.append(
    "files[0]",
    new Blob([bundle], { type: "application/json" }),
    "standard-input.json",
  );

  const url = `${EXPLORER}/api/v2/smart-contracts/${ADDRESS}/verification/via/standard-input`;
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  console.log("submit", res.status, text.slice(0, 400));
  if (!res.ok) {
    console.error(
      "\nIf this is an HTML Cloudflare page, use the browser fallback described in README.md.",
    );
    process.exitCode = 1;
    return;
  }
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await fetch(`${EXPLORER}/api/v2/smart-contracts/${ADDRESS}`).then((r) => r.json());
    console.log("status", s.is_verified ? "VERIFIED" : "pending", s.name || "");
    if (s.is_verified) return;
  }
  console.error("still not verified after polling; check the explorer page");
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
