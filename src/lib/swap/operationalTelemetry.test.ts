import { describe, expect, it } from "vitest";
import { sanitizeFailureReason } from "./operationalTelemetry";

describe("trade telemetry privacy", () => {
  it("reduces errors to generic operational reasons", () => {
    expect(sanitizeFailureReason("user rejected request for 0x1234")).toBe("user_rejected");
    expect(sanitizeFailureReason("RPC transport timeout at secret host")).toBe("rpc_failure");
    expect(sanitizeFailureReason("arbitrary private metadata")).toBe("unknown_failure");
  });
});