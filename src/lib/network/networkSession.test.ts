import { beforeEach, describe, expect, it } from "vitest";
import {
  BOT_MAINNET,
  BOT_TESTNET,
  applyExplicitChainTarget,
  getNetworkSession,
  setMainnetSelected,
  __resetNetworkSessionForTests,
} from "./networkSession";

describe("V15.3C network session authority", () => {
  beforeEach(() => __resetNetworkSessionForTests());

  it("defaults to BOT Mainnet on a fresh runtime", () => {
    expect(getNetworkSession().selectedChainId).toBe(BOT_MAINNET);
    expect(getNetworkSession().source).toBe("DEFAULT");
  });

  it("keeps a user selection across simulated route remounts", () => {
    setMainnetSelected(false);
    expect(getNetworkSession().selectedChainId).toBe(BOT_TESTNET);
    // A remount only re-reads the module store; nothing re-initializes.
    expect(getNetworkSession().selectedChainId).toBe(BOT_TESTNET);
    expect(getNetworkSession().source).toBe("USER");
  });

  it("applies an explicit intent target once per runtime", () => {
    expect(
      applyExplicitChainTarget({ chainId: 968, hintKey: "handoff:a", source: "ACTION_INTENT" }),
    ).toBe(true);
    expect(getNetworkSession().selectedChainId).toBe(BOT_TESTNET);

    setMainnetSelected(true);
    expect(
      applyExplicitChainTarget({ chainId: 968, hintKey: "handoff:a", source: "ACTION_INTENT" }),
    ).toBe(false);
    expect(getNetworkSession().selectedChainId).toBe(BOT_MAINNET);
  });

  it("normalizes BNB-side chain ids to the matching BOT environment", () => {
    applyExplicitChainTarget({ chainId: 97, hintKey: "h1", source: "ROUTE" });
    expect(getNetworkSession().selectedChainId).toBe(BOT_TESTNET);
    applyExplicitChainTarget({ chainId: 56, hintKey: "h2", source: "ROUTE" });
    expect(getNetworkSession().selectedChainId).toBe(BOT_MAINNET);
  });
});
