import { describe, expect, it } from "vitest";
import { resolveWalletConnectEnabled, WALLETCONNECT_SECURITY_HOLD, PRODUCTION_WALLETCONNECT_ON } from "./walletConnectFlag";
import { buildWalletChoices } from "./connectorChoices";

const preview = "id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app";
const prod = ["flowbridge.space", "www.flowbridge.space", "notify.flowbridge.space", "flowbridgev01.lovable.app"];

describe("WalletConnect V1.14 security hold (zod@3.22.4 advisory)", () => {
  it("hold is active and production switch is off", () => {
    expect(WALLETCONNECT_SECURITY_HOLD).toBe(true);
    expect(PRODUCTION_WALLETCONNECT_ON).toBe(false);
  });
  it("is OFF on preview, localhost and every production host, even with env true", () => {
    for (const h of [preview, "localhost:8080", ...prod]) {
      expect(resolveWalletConnectEnabled(undefined, h)).toBe(false);
      expect(resolveWalletConnectEnabled("true", h)).toBe(false);
    }
  });
  it("is OFF during SSR", () => {
    expect(resolveWalletConnectEnabled("true", null)).toBe(false);
  });
});

describe("gate logic beneath the hold (only reachable if hold is lifted by code change)", () => {
  it("preview ON without env when hold lifted", () => {
    expect(resolveWalletConnectEnabled(undefined, preview, false, false)).toBe(true);
  });
  it("production requires switch or explicit env", () => {
    for (const h of prod) {
      expect(resolveWalletConnectEnabled(undefined, h, false, false)).toBe(false);
      expect(resolveWalletConnectEnabled(undefined, h, true, false)).toBe(true);
    }
  });
  it("explicit OFF wins", () => {
    expect(resolveWalletConnectEnabled("false", "localhost:8080", true, false)).toBe(false);
    expect(resolveWalletConnectEnabled("off", "flowbridge.space", true, false)).toBe(false);
  });
  it("installed wallets remain when WalletConnect is off", () => {
    const c = [
      { id: "io.metamask", name: "MetaMask", type: "injected" },
      { id: "walletConnect", name: "WalletConnect", type: "walletConnect" },
    ];
    expect(buildWalletChoices(c, true).map((x) => x.label)).toEqual(["MetaMask", "WalletConnect"]);
    expect(buildWalletChoices(c, false).map((x) => x.label)).toEqual(["MetaMask"]);
  });
});
