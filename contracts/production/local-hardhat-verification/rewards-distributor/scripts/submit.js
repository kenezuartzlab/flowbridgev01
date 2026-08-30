// Submits the preserved Standard-JSON input to the explorer from YOUR machine.
// The bundle is sent verbatim, so the explorer compiles exactly what was
// deployed. Read-only with respect to the chain: no key, no transaction.
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ADDRESS = "0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB";
const EXPLORER = process.env.BOT_EXPLORER_URL || "https://scan.botchain.ai";
const bundle = readFileSync(path.join(__dirname, "..", "standard-input.json"), "utf8");

async function main() {
  const form = new FormData();
  form.append("compiler_version", "v0.8.24+commit.e11b9ed9");
  form.append("license_type", "mit");
  form.append("autodetect_constructor_args", "false");
  form.append("constructor_args", "0x000000000000000000000000535ddda826142ac42ce288154e9595f080940ae900000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce950700000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507000000000000000000000000971e7790fe6c8f77dc666bb05d4aeda362653f940000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef000000000000000000000000efc13d1a1dc30ba2da0bb005ba5a783c6b229ea40000000000000000000000000000000000000000000000000000000000015180");
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
