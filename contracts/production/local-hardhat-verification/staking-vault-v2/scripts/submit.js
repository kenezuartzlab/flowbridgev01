// Submits the preserved Standard-JSON input to the explorer from YOUR machine.
// The bundle is sent verbatim, so the explorer compiles exactly what was
// deployed. Read-only with respect to the chain: no key, no transaction.
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ADDRESS = "0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8";
const EXPLORER = process.env.BOT_EXPLORER_URL || "https://scan.botchain.ai";
const bundle = readFileSync(path.join(__dirname, "..", "standard-input.json"), "utf8");

async function main() {
  const form = new FormData();
  form.append("compiler_version", "v0.8.24+commit.e11b9ed9");
  form.append("license_type", "mit");
  form.append("autodetect_constructor_args", "false");
  form.append("constructor_args", "0x000000000000000000000000535ddda826142ac42ce288154e9595f080940ae90000000000000000000000005095ecc7226ad6decee99846bc83363ca41b52bf000000000000000000000000a861152ca3676bccf7b5fdafb9eb6a57b9d32d0e00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507");
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
