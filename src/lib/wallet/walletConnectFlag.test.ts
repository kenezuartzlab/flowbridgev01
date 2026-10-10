import { describe, expect, it } from "vitest";
import { resolveWalletConnectEnabled } from "./walletConnectFlag";
import { buildWalletChoices } from "./connectorChoices";

describe("WalletConnect preview-only gate", () => {
  it("is ON on the preview host with no env flag", () => {
    expect(resolveWalletConnectEnabled(undefined, "id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app")).toBe(true);
  });
  it("stays OFF on every production host without explicit env", () => {
    for (const h of ["flowbridge.space", "www.flowbridge.space", "notify.flowbridge.space", "flowbridgev01.lovable.app"])
      expect(resolveWalletConnectEnabled(undefined, h)).toBe(false);
  });
  it("explicit OFF kill switch wins on preview", () => {
    expect(resolveWalletConnectEnabled("false", "localhost:8080")).toBe(false);
  });
  it("is OFF during SSR (no host)", () => {
    expect(resolveWalletConnectEnabled("true", null)).toBe(false);
  });
  it("adds WalletConnect without replacing installed wallets", () => {
    const c = [
      { id: "io.metamask", name: "MetaMask", type: "injected" },
      { id: "walletConnect", name: "WalletConnect", type: "walletConnect" },
    ];
    expect(buildWalletChoices(c, true).map((x) => x.label)).toEqual(["MetaMask", "WalletConnect"]);
    expect(buildWalletChoices(c, false).map((x) => x.label)).toEqual(["MetaMask"]);
  });
});
