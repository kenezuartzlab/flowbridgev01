import { describe, expect, it } from "vitest";
import { atomicFailureMessage, createRoutedSwapActivity } from "./swapLifecycle";

describe("swap lifecycle", () => {
  it("keeps atomic failures explicit and non-resubmitting", () => expect(atomicFailureMessage()).toBe("Transaction failed. Your route was not automatically resubmitted."));
  it("groups a routed swap before hashes exist without confirming it", () => {
    const a = createRoutedSwapActivity({ id: "x", chainId: 677, wallet: "0x1", pair: "BOT/FLOW", dex: "BDEX V3", amount: "1 BOT" });
    expect(a.kind).toBe("routed-swap");
    expect(a.txs).toEqual([]);
  });
});