import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetConversationForTests,
  ensureConversationOwner,
  getConversation,
  markConversationHandoff,
  pruneExpiredPreparation,
  setConversationMessages,
  setConversationPrepared,
} from "./conversationStore";

const prepared = (expiresInMs: number) => ({
  intentId: "intent_1",
  type: "SWAP",
  chainId: 968,
  state: "READY_FOR_USER",
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  handoffHref: "/trade?tab=swap",
  handoffCta: "Review in Trade",
  surface: "/trade",
  actorKey: "user_1",
});

describe("V15.3F conversation continuity store", () => {
  beforeEach(() => __resetConversationForTests());

  it("survives a simulated route unmount/remount (module-scope state)", () => {
    setConversationMessages([{ role: "user", content: "swap 10 usdt to bot" }]);
    setConversationPrepared(prepared(60_000));
    // Simulated navigation: no reset call — the store is above the route tree.
    expect(getConversation().messages).toHaveLength(1);
    expect(getConversation().prepared?.intentId).toBe("intent_1");
  });

  it("keeps a stable conversation id across turns", () => {
    const id = getConversation().conversationId;
    setConversationMessages([{ role: "user", content: "hi" }]);
    markConversationHandoff("intent_1");
    expect(getConversation().conversationId).toBe(id);
    expect(getConversation().handedOffIntentId).toBe("intent_1");
  });

  it("fails closed on owner change — no cross-user transcript access", () => {
    ensureConversationOwner("user_a");
    setConversationMessages([{ role: "user", content: "my balances" }]);
    ensureConversationOwner("user_b");
    expect(getConversation().messages).toEqual([]);
    expect(getConversation().prepared).toBeNull();
  });

  it("is idempotent for the same owner", () => {
    ensureConversationOwner("user_a");
    setConversationMessages([{ role: "user", content: "keep me" }]);
    ensureConversationOwner("user_a");
    expect(getConversation().messages).toHaveLength(1);
  });

  it("prunes an expired prepared handle", () => {
    setConversationPrepared(prepared(-1_000));
    pruneExpiredPreparation();
    expect(getConversation().prepared).toBeNull();
  });

  it("retains an unexpired prepared handle", () => {
    setConversationPrepared(prepared(60_000));
    pruneExpiredPreparation();
    expect(getConversation().prepared?.state).toBe("READY_FOR_USER");
  });
});
