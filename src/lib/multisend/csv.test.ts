import { describe, expect, it } from "vitest";
import { errorsCsv, importSummaryText, parseImport, receiptCsv } from "./csv";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("MultiSend import", () => {
  it("parses recipient,amount for Distribute and skips the header", () => {
    const p = parseImport({ mode: "one-to-many", text: `recipient,amount\n${A},1.5\n${B},2` });
    expect(p.headerSkipped).toBe(true);
    expect(p.valid).toHaveLength(2);
    expect(p.valid[0]).toMatchObject({ recipient: A, amountText: "1.5" });
  });

  it("parses source,amount for Consolidate and source,recipient,amount for Advanced", () => {
    expect(parseImport({ mode: "many-to-one", text: `${A},5` }).valid[0]).toMatchObject({ source: A, amountText: "5" });
    expect(parseImport({ mode: "many-to-many", text: `${A},${B},7` }).valid[0]).toMatchObject({
      source: A,
      recipient: B,
      amountText: "7",
    });
  });

  it("accepts spreadsheet tabs and semicolons", () => {
    expect(parseImport({ mode: "one-to-many", text: `${A}\t1\n${B};2` }).valid).toHaveLength(2);
  });

  it("flags duplicates, invalid addresses, zero address, self-sends and bad amounts", () => {
    const p = parseImport({
      mode: "many-to-many",
      text: [
        `${A},${B},1`,
        `${A},${B},1`, // duplicate
        `notanaddress,${B},1`,
        `${A},${ZERO},1`,
        `${A},${A},1`,
        `${A},${C},abc`,
        `${A},${C},0`,
      ].join("\n"),
    });
    expect(p.valid).toHaveLength(1);
    expect(p.duplicates).toHaveLength(1);
    expect(p.invalid).toHaveLength(3);
    expect(p.unsupportedAmount).toHaveLength(2);
    expect(importSummaryText(p)).toBe("1 valid · 1 duplicates · 3 invalid · 2 unsupported amount");
    expect(errorsCsv(p).split("\n")[0]).toBe("line,reason,row");
    expect(errorsCsv(p).split("\n")).toHaveLength(6);
  });

  it("treats rows already in the plan as duplicates", () => {
    const p = parseImport({ mode: "one-to-many", text: `${A},1`, existingKeys: [`>${A.toLowerCase()}`] });
    expect(p.valid).toHaveLength(0);
    expect(p.duplicates).toHaveLength(1);
  });

  it("rejects rows with missing columns", () => {
    expect(parseImport({ mode: "many-to-many", text: `${A}` }).invalid).toHaveLength(1);
  });

  it("accepts address-only rows so amounts can be filled in later", () => {
    const p = parseImport({ mode: "many-to-one", text: `${A}\n${B}` });
    expect(p.valid).toHaveLength(2);
    expect(p.valid[0].amountText).toBe("");
  });

  it("exports a receipt CSV", () => {
    const csv = receiptCsv({
      clientBatchId: "0xabc",
      tokenSymbol: "BOT",
      rows: [{ source: A, recipient: B, amount: "1", status: "confirmed", txHash: "0xdead" }],
    });
    expect(csv.split("\n")[0]).toBe("batchId,token,source,recipient,amount,status,txHash");
    expect(csv).toContain("0xabc,BOT");
  });
});
