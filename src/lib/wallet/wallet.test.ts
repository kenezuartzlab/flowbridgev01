import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { buildWalletChoices, soleInstalledChoice } from "./connectorChoices";
import { classifyWalletError } from "./walletErrors";
import { parseWalletConnectFlag } from "./walletConnectFlag";
import { buildBindingMessage, validateBindingMessage } from "./bindingMessage";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const W = acct.address.toLowerCase();
const now = Date.parse("2026-10-09T01:00:00Z");
const fields = {
  domain: "flowbridge.space",
  origin: "https://flowbridge.space",
  account: "user-1",
  wallet: W,
  nonce: "n0nce",
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 300_000).toISOString(),
};
const msg = buildBindingMessage(fields);
const expect0 = { userId: "user-1", wallet: W, nonce: "n0nce", requestOrigin: "https://flowbridge.space", nowMs: now + 1000 };

describe("V34.2 WalletConnect kill switch", () => {
  it("fails closed unless explicitly enabled", () => {
    expect(parseWalletConnectFlag(undefined)).toBe(false);
    expect(parseWalletConnectFlag("")).toBe(false);
    expect(parseWalletConnectFlag("false")).toBe(false);
    expect(parseWalletConnectFlag("true")).toBe(true);
  });
});

describe("V34.2 wallet choices", () => {
  const rabby = { id: "io.rabby", name: "Rabby Wallet", type: "injected" };
  const mm = { id: "io.metamask", name: "MetaMask", type: "injected" };
  const generic = { id: "injected", name: "Injected", type: "injected" };
  const wc = { id: "walletConnect", name: "WalletConnect", type: "walletConnect" };
  it("lists each discovered wallet by its own name and hides the generic fallback", () => {
    const c = buildWalletChoices([generic, mm, rabby], false);
    expect(c.map((x) => x.label)).toEqual(["MetaMask", "Rabby Wallet"]);
    expect(soleInstalledChoice(c)).toBeNull();
  });
  it("falls back to a generic EIP-1193 provider when nothing is discovered", () => {
    const c = buildWalletChoices([generic], false);
    expect(c[0].kind).toBe("INJECTED");
    expect(soleInstalledChoice(c)?.connector.id).toBe("injected");
  });
  it("offers WalletConnect only when the switch is on", () => {
    expect(buildWalletChoices([generic, wc], false).some((x) => x.kind === "WALLETCONNECT")).toBe(false);
    expect(buildWalletChoices([generic, wc], true).some((x) => x.kind === "WALLETCONNECT")).toBe(true);
  });
});

describe("V34.2 error normalization", () => {
  it.each([
    [{ code: 4001 }, "USER_REJECTED"],
    [{ message: "User rejected the request." }, "USER_REJECTED"],
    [{ code: 4902 }, "WRONG_NETWORK"],
    [{ message: "insufficient funds for gas" }, "INSUFFICIENT_GAS"],
    [{ message: "WalletConnect project id invalid" }, "WALLETCONNECT_UNAVAILABLE"],
    [{ message: "Session expired" }, "SESSION_EXPIRED"],
    [{ code: 4900 }, "WALLET_DISCONNECTED"],
    [{ message: "HTTP request failed" }, "RPC_UNAVAILABLE"],
  ])("%j -> %s", (e, s) => expect(classifyWalletError(e)).toBe(s));
  it("defaults by context", () => {
    expect(classifyWalletError(new Error("boom"), "tx")).toBe("TRANSACTION_FAILED");
    expect(classifyWalletError(new Error("boom"), "sign")).toBe("SIGNATURE_FAILED");
  });
});

describe("V34.2 binding message", () => {
  it("is human-readable and states it is free and moves no funds", () => {
    expect(msg).toContain("This signature is free. It does not move funds. It does not approve tokens.");
    expect(msg).toContain("Purpose: WALLET_BINDING");
  });
  it("valid ownership signature passes", async () => {
    expect(validateBindingMessage(msg, expect0)).toEqual({ ok: true });
    const sig = await acct.signMessage({ message: msg });
    expect(await verifyMessage({ address: acct.address, message: msg, signature: sig })).toBe(true);
  });
  it("modified message denied", () => {
    expect(validateBindingMessage(msg.replace("is free", "is FREE"), expect0).ok).toBe(false);
  });
  it("wrong domain denied", () => {
    const m = buildBindingMessage({ ...fields, domain: "evil.example", origin: "https://evil.example" });
    expect(validateBindingMessage(m, { ...expect0, requestOrigin: "https://evil.example" }).ok).toBe(false);
  });
  it("wrong origin denied", () => {
    expect(validateBindingMessage(msg, { ...expect0, requestOrigin: "https://evil.example" }).ok).toBe(false);
    expect(validateBindingMessage(msg, { ...expect0, requestOrigin: null }).ok).toBe(false);
  });
  it("wrong account denied", () => {
    expect(validateBindingMessage(msg, { ...expect0, userId: "user-2" }).ok).toBe(false);
  });
  it("wrong wallet denied", () => {
    expect(validateBindingMessage(msg, { ...expect0, wallet: "0x" + "1".repeat(40) }).ok).toBe(false);
  });
  it("expired request denied", () => {
    expect(validateBindingMessage(msg, { ...expect0, nowMs: now + 400_000 }).ok).toBe(false);
  });
  it("nonce mismatch denied", () => {
    expect(validateBindingMessage(msg, { ...expect0, nonce: "other" }).ok).toBe(false);
  });
  it("wrong purpose denied", () => {
    expect(validateBindingMessage(msg.replace("WALLET_BINDING", "LOGIN"), expect0).ok).toBe(false);
  });
});
