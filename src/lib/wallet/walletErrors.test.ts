import { describe, expect, it } from "vitest";
import { safeErrorReason } from "./walletErrors";

describe("safeErrorReason", () => {
  it("removes addresses, URIs and long tokens", () => {
    const r = safeErrorReason({
      name: "Error",
      message: "Failed for 0xce42b27d5e5b8c2545ddabea204d776e658d9dd5 at wc:abc@2?relay=x https://relay.walletconnect.org/?auth=eyJhbGciOiJFZERTQSIsInR5cCI6",
    });
    expect(r).not.toMatch(/0xce42|wc:abc|relay\.walletconnect|eyJhbGci/);
  });
  it("keeps the error name and a short message", () => {
    expect(safeErrorReason({ name: "ConnectorNotFoundError", message: "Connector not found." })).toBe(
      "ConnectorNotFoundError: Connector not found.",
    );
  });
});
