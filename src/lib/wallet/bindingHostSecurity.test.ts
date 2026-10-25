import { describe, expect, it } from "vitest";
import {
  buildBindingMessage,
  isAllowedBindingHost,
  MAX_BINDING_HOST_LENGTH,
  MAX_BINDING_MESSAGE_LENGTH,
  parseBindingMessage,
  validateBindingMessage,
} from "./bindingMessage";

describe("bounded wallet-binding host validation", () => {
  it.each([
    "flowbridge.space", "www.flowbridge.space", "notify.flowbridge.space",
    "flowbridgev01.lovable.app", "id-preview--aa8f6129-829c-4b77-8e07-1eba517577f8.lovable.app",
    "localhost:8080", "127.0.0.1:8080", "FLOWBRIDGE.SPACE",
  ])("preserves supported host %s", (host) => {
    expect(isAllowedBindingHost(host)).toBe(true);
  });

  it.each([
    "", ".lovable.app", "evil.example", "flowbridge.space.evil.example",
    "preview.lovable.app.evil.example", "preview.evil.lovable.app",
    "preview.lovable.app:443", "preview_lovable.lovable.app", "preview/lovable.app",
    `${"a--".repeat(70)}!.lovable.app`,
  ])("rejects invalid host %s", (host) => {
    expect(isAllowedBindingHost(host)).toBe(false);
  });

  it("rejects oversized attacker-controlled hosts before matching", () => {
    expect(isAllowedBindingHost(`${"a--".repeat(100_000)}!.lovable.app`)).toBe(false);
    const suffix = ".lovable.app";
    expect(isAllowedBindingHost(`${"a".repeat(MAX_BINDING_HOST_LENGTH - suffix.length)}${suffix}`)).toBe(true);
    expect(isAllowedBindingHost(`${"a".repeat(MAX_BINDING_HOST_LENGTH - suffix.length + 1)}${suffix}`)).toBe(false);
  });

  it("bounds the signed message before parsing or rebuilding", () => {
    const nowMs = Date.parse("2026-10-25T06:10:00Z");
    const message = buildBindingMessage({
      domain: "flowbridge.space", origin: "https://flowbridge.space", account: "fixture-account",
      wallet: `0x${"1".repeat(40)}`, nonce: "fixture-nonce",
      issuedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 300_000).toISOString(),
    });
    const expected = { userId: "fixture-account", wallet: `0x${"1".repeat(40)}`, nonce: "fixture-nonce", requestOrigin: "https://flowbridge.space", nowMs };
    expect(validateBindingMessage(message, expected)).toEqual({ ok: true });
    const oversized = message + "a".repeat(MAX_BINDING_MESSAGE_LENGTH);
    expect(parseBindingMessage(oversized)).toBeNull();
    expect(validateBindingMessage(oversized, expected).ok).toBe(false);
    expect(validateBindingMessage(buildBindingMessage({
      domain: `${"a--".repeat(70)}!.lovable.app`, origin: "https://flowbridge.space", account: "fixture-account",
      wallet: expected.wallet, nonce: expected.nonce,
      issuedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 300_000).toISOString(),
    }), expected).ok).toBe(false);
  });
});