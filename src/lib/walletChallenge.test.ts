/**
 * V30.2B P4A.2.1 — wallet-binding ownership proof.
 *
 * The server verifier is exercised against a real local key: only a signature
 * that recovers to the claimed wallet, over an unused unexpired nonce bound to
 * that same wallet, may bind. A typed address with no signature cannot.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const wallet = account.address.toLowerCase();

interface NonceRow {
  id: string;
  wallet_address: string;
  expires_at: string;
  used_at: string | null;
}

let row: NonceRow | null;
const updates: unknown[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (patch: unknown) => {
        updates.push(patch);
        return { eq: () => ({ is: async () => ({ error: null }) }) };
      },
    }),
  },
}));

const { verifyWalletChallenge } = await import("./walletChallenge.server");

const NONCE = "abc123";
const message = `FlowBridge wallet binding\nWallet: ${wallet}\nChain ID: 677\nNonce: ${NONCE}`;

const freshRow = (over: Partial<NonceRow> = {}): NonceRow => ({
  id: "n1",
  wallet_address: wallet,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  used_at: null,
  ...over,
});

beforeEach(() => {
  row = freshRow();
  updates.length = 0;
});

describe("P4A.2.1 wallet binding proof", () => {
  it("accepts a genuine signature and consumes the nonce", async () => {
    const signature = await account.signMessage({ message });
    const r = await verifyWalletChallenge({ walletAddress: wallet, message, signature, nonce: NONCE });
    expect(r).toEqual({ ok: true, wallet });
    expect(updates).toHaveLength(1);
  });

  it("rejects binding an address with no signature at all", async () => {
    const r = await verifyWalletChallenge({ walletAddress: wallet, message, nonce: NONCE });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("rejects a signature from a different wallet", async () => {
    const signature = await account.signMessage({ message });
    const other = "0x1111111111111111111111111111111111111111";
    row = freshRow({ wallet_address: other });
    const r = await verifyWalletChallenge({
      walletAddress: other,
      message,
      signature,
      nonce: NONCE,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a used, expired, mismatched or unknown challenge", async () => {
    const signature = await account.signMessage({ message });
    const call = () =>
      verifyWalletChallenge({ walletAddress: wallet, message, signature, nonce: NONCE });

    row = freshRow({ used_at: new Date().toISOString() });
    expect((await call()).ok).toBe(false);

    row = freshRow({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await call()).ok).toBe(false);

    row = freshRow({ wallet_address: "0x2222222222222222222222222222222222222222" });
    expect((await call()).ok).toBe(false);

    row = null;
    expect((await call()).ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("rejects a message that does not carry the issued nonce", async () => {
    const tampered = `FlowBridge wallet binding\nWallet: ${wallet}\nChain ID: 677\nNonce: zzz`;
    const signature = await account.signMessage({ message: tampered });
    const r = await verifyWalletChallenge({
      walletAddress: wallet,
      message: tampered,
      signature,
      nonce: NONCE,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed address", async () => {
    const r = await verifyWalletChallenge({
      walletAddress: "not-an-address",
      message,
      signature: "0xdead",
      nonce: NONCE,
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});
