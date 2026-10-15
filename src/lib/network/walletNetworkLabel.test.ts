import { describe, expect, it } from "vitest";
import { headerNetworkLabel } from "./walletNetworkLabel";

describe("headerNetworkLabel", () => {
  it("never shows BOT Mainnet while the wallet is on BNB", () => {
    expect(headerNetworkLabel({ selectedMainnet: true, walletChainId: 56 })).toEqual({ label: "BNB Chain", isBot: false, mismatch: true });
  });
  it("shows Ethereum when wallet is on chain 1", () => {
    expect(headerNetworkLabel({ selectedMainnet: true, walletChainId: 1 }).label).toBe("Ethereum");
  });
  it("shows Tron for a Tron-only connection", () => {
    expect(headerNetworkLabel({ selectedMainnet: true, walletChainId: null, tronConnected: true }).label).toBe("Tron");
  });
  it("falls back to the selected network with no wallet", () => {
    expect(headerNetworkLabel({ selectedMainnet: false, walletChainId: null })).toEqual({ label: "BOT Testnet", isBot: true, mismatch: false });
  });
  it("flags testnet wallet while Mainnet selected", () => {
    expect(headerNetworkLabel({ selectedMainnet: true, walletChainId: 968 }).mismatch).toBe(true);
  });
});
