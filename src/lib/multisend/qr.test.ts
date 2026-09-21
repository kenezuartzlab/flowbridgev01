import { describe, expect, it } from "vitest";
import { parseQrPayload, shortAddress } from "./qr";

const A = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("MultiSend QR policy", () => {
  it("accepts a raw EVM address", () => {
    const r = parseQrPayload(` ${A} `, 677);
    expect(r).toMatchObject({ ok: true, address: A, amountText: null });
  });

  it("accepts an EIP-681 URI on the selected network and can prefill an amount", () => {
    const r = parseQrPayload(`ethereum:${A}@677?value=1.25`, 677);
    expect(r).toMatchObject({ ok: true, address: A, amountText: "1.25", chainId: 677 });
  });

  it("blocks an EIP-681 URI for another network", () => {
    const r = parseQrPayload(`ethereum:${A}@56`, 677);
    expect(r.ok).toBe(false);
  });

  it("never accepts the zero address", () => {
    expect(parseQrPayload(ZERO, 677).ok).toBe(false);
    expect(parseQrPayload(`ethereum:${ZERO}@677`, 677).ok).toBe(false);
  });

  it("rejects malformed payloads and unreadable amounts", () => {
    expect(parseQrPayload("", 677).ok).toBe(false);
    expect(parseQrPayload("hello world", 677).ok).toBe(false);
    expect(parseQrPayload("ethereum:0x1234@677", 677).ok).toBe(false);
    expect(parseQrPayload(`ethereum:${A}@677?value=free`, 677).ok).toBe(false);
  });

  it("only ever extracts an address — it never carries an instruction", () => {
    const r = parseQrPayload(`ethereum:${A}@677/transfer?address=${A}&uint256=1e18`, 677);
    expect(r).toMatchObject({ ok: true, address: A });
    const wrapped = parseQrPayload(`https://example.com/send?to=${A}&approve=all`, 677);
    expect(wrapped).toMatchObject({ ok: true, address: A, amountText: null });
  });

  it("shortens addresses for display", () => {
    expect(shortAddress(A)).toBe("0x1111…1111");
  });
});
