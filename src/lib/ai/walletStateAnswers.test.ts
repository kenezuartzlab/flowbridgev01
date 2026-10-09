import { describe, expect, it } from "vitest";
import { answerWalletQuestion, matchWalletQuestion, walletFamilyLabel, chainSupport, GENERIC_WALLET } from "./walletStateAnswers";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const base = { signedIn: true, emailVerified: true, boundWallet: A, connectedWallet: A, chainId: 677 };
const prog = (over: any) => ({ availableTowardMinimum: 0, claimButton: false, allocation: null, ...over }) as any;

describe("V34.2A Flow AI wallet answers", () => {
  it("matches the gate's questions", () => {
    expect(matchWalletQuestion("Am I connected?")).toBe("CONNECTED");
    expect(matchWalletQuestion("Which wallet am I using?")).toBe("WHICH_WALLET");
    expect(matchWalletQuestion("Is my wallet bound?")).toBe("BOUND");
    expect(matchWalletQuestion("Is my wallet verified?")).toBe("BOUND");
    expect(matchWalletQuestion("Why can't I trade?")).toBe("CANT_TRADE");
    expect(matchWalletQuestion("Am I on the right network?")).toBe("NETWORK");
    expect(matchWalletQuestion("Why do I need to bind my wallet?")).toBe("WHY_BIND");
    expect(matchWalletQuestion("Does binding cost gas?")).toBe("BIND_GAS");
    expect(matchWalletQuestion("Can I claim FLOW?")).toBe("CAN_CLAIM");
    expect(matchWalletQuestion("Swap 100 BOT to USDT")).toBeNull();
  });
  it("matches natural binding phrasings that previously fell through", () => {
    expect(matchWalletQuestion("How do I bind my wallet?")).toBe("WHY_BIND");
    expect(matchWalletQuestion("Tell me about the wallet bind feature")).toBe("WHY_BIND");
    expect(matchWalletQuestion("wallet bind")).toBe("WHY_BIND");
    expect(matchWalletQuestion("I want to link my wallet")).toBe("WHY_BIND");
    // Guard: ordinary trade questions must still fall through to the planner.
    expect(matchWalletQuestion("Is a route available to swap 100 BOT to USDT?")).toBeNull();
    expect(matchWalletQuestion("What's the next step to bridge my USDT?")).toBeNull();
  });
  it("never guesses a wallet brand", () => {
    expect(walletFamilyLabel(undefined)).toBe(GENERIC_WALLET);
    expect(walletFamilyLabel("com.unknown")).toBe(GENERIC_WALLET);
    expect(walletFamilyLabel("io.rabby")).toBe("Rabby");
    expect(answerWalletQuestion("WHICH_WALLET", base)).toContain(GENERIC_WALLET);
  });
  it("binding explanation: no gas, no funds, no approval, not KYC", () => {
    const t = answerWalletQuestion("BIND_GAS", base);
    expect(t).toMatch(/no gas/);
    expect(t).toMatch(/does not move funds/);
    expect(t).toMatch(/not approve/);
    expect(t).toMatch(/not identity or KYC/);
  });
  it("canonical networks; 1024 fails closed", () => {
    expect(chainSupport(677)).toBe("BOT_MAINNET");
    expect(chainSupport(968)).toBe("BOT_TESTNET");
    expect(chainSupport(56)).toBe("BNB_MAINNET");
    expect(chainSupport(97)).toBe("BNB_TESTNET");
    expect(chainSupport(1024)).toBe("LEGACY_UNSUPPORTED");
    expect(answerWalletQuestion("NETWORK", { ...base, chainId: 1024 })).toMatch(/does not support/);
    expect(answerWalletQuestion("NETWORK", { ...base, chainId: 1 })).toMatch(/never switch/);
  });
  it("claim answers use claim state, not aggregate points", () => {
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, progression: prog({ availableTowardMinimum: 999 }) })).toMatch(/Not yet — 999/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, progression: prog({ availableTowardMinimum: 1500 }) })).toMatch(/not in a published payout round/);
    const alloc = { epochId: 3, amountFlow: 1200, claimed: false, claimStart: 0, claimEnd: 1 };
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, progression: prog({ allocation: alloc, claimButton: true }) })).toMatch(/^Yes/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, connectedWallet: B, progression: prog({ allocation: alloc, claimButton: true }) })).toMatch(/connect that wallet/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, progression: prog({ allocation: alloc }) })).toMatch(/not open/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, progression: prog({ allocation: { ...alloc, claimed: true } }) })).toMatch(/already claimed/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, boundWallet: null })).toMatch(/bind a wallet/);
    expect(answerWalletQuestion("CAN_CLAIM", { ...base, signedIn: false })).toMatch(/Sign in/);
  });
  it("bound state is separate from email verification", () => {
    expect(answerWalletQuestion("BOUND", { ...base, emailVerified: false })).toMatch(/is bound.*email is not verified/);
    expect(answerWalletQuestion("BOUND", { ...base, boundWallet: null })).toMatch(/No wallet is bound/);
  });
});
