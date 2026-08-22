import { describe, expect, it } from "vitest";
import { resolveWalletBinding } from "./walletBinding";

const BOUND = "0x3d8a7fa490f9db09dd8006b74688213ace9c0164";
const OTHER = "0x628e237b73c5a37ef3968527563fa1a26b32bb97";

describe("V15.3B wallet binding resolution", () => {
  it("reports no bound wallet only when the persisted binding is absent", () => {
    const r = resolveWalletBinding({ boundWallet: null, targetChainId: 968 });
    expect(r.status).toBe("NO_BOUND_WALLET");
    expect(r.canPrepare).toBe(false);
  });

  it("never reports unbound just because the wallet is on another network", () => {
    const r = resolveWalletBinding({
      boundWallet: BOUND,
      connectedWallet: BOUND,
      connectedChainId: 677,
      targetChainId: 968,
    });
    expect(r.status).toBe("BOUND_WRONG_NETWORK");
    expect(r.canPrepare).toBe(true);
    expect(r.boundWallet).toBe(BOUND);
    expect(r.message).toContain("BOT Testnet (968)");
  });

  it("flags a disconnected bound wallet but still allows preparation", () => {
    const r = resolveWalletBinding({ boundWallet: BOUND, targetChainId: 968 });
    expect(r.status).toBe("BOUND_WALLET_DISCONNECTED");
    expect(r.canPrepare).toBe(true);
  });

  it("flags a different connected wallet and keeps the bound wallet as the recipient", () => {
    const r = resolveWalletBinding({
      boundWallet: BOUND,
      connectedWallet: OTHER,
      connectedChainId: 968,
      targetChainId: 968,
    });
    expect(r.status).toBe("BOUND_WALLET_MISMATCH");
    expect(r.boundWallet).toBe(BOUND);
  });

  it("is ready when the bound wallet is connected on the target chain", () => {
    const r = resolveWalletBinding({
      boundWallet: BOUND.toUpperCase(),
      connectedWallet: BOUND,
      connectedChainId: 968,
      targetChainId: 968,
    });
    expect(r.status).toBe("BOUND_AND_READY");
    expect(r.needsUserWalletAction).toBe(false);
    expect(r.message).toBeNull();
  });

  it("ignores malformed addresses instead of treating them as bindings", () => {
    expect(resolveWalletBinding({ boundWallet: "not-an-address", targetChainId: 968 }).status).toBe(
      "NO_BOUND_WALLET",
    );
  });
});
