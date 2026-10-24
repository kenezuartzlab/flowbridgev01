import { describe, expect, it } from "vitest";
import { spreadsheetCell, spreadsheetDecimal, spreadsheetRow } from "./spreadsheetExport";

describe("spreadsheet export security", () => {
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1", "\r=1", "\n=1", " \t=1", "\uFEFF=1", "\u200B=1", "＝1", "＋1", "－1", "＠SUM(A1)", "\u22121", "\u2028=1"])("neutralizes %j as literal text", (value) => {
    const cell = spreadsheetCell(value);
    const decoded = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
    expect(decoded).toBe(`'${value}`);
  });
  it("escapes separators, quotes and embedded newlines in one cell", () => {
    expect(spreadsheetRow(['safe",=1;@SUM(A1)\n+2', "next"])).toBe('"safe"",=1;@SUM(A1)\n+2",next');
    expect(spreadsheetCell("safe;=1")).toBe('"safe;=1"');
  });
  it("preserves ordinary titles and numeric financial values", () => {
    expect(spreadsheetRow(["BOT rewards", 1122, -74, 1.25, 0, 1122000000000000000000n])).toBe("BOT rewards,1122,-74,1.25,0,1122000000000000000000");
    expect(spreadsheetDecimal("1122.000000000000000001")).toBe("1122.000000000000000001");
    expect(spreadsheetDecimal("-74.00")).toBe("-74.00");
    expect(spreadsheetDecimal("=1+1")).toBe("'=1+1");
    expect(spreadsheetCell("-74")).toBe("'-74");
  });
  it("rejects nonfinite numeric values instead of corrupting reports", () => {
    expect(() => spreadsheetCell(NaN)).toThrow();
    expect(() => spreadsheetCell(Infinity)).toThrow();
  });
});