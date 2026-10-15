import { describe, expect, it } from "vitest";
import { phaseFromVerification, publisherLimitChecks, publisherWalletGate } from "./publishGate";
import { attributeSignupAward, countsAsMainnetSignup } from "./signupAttribution";
import { PUBLISHER_CONFIG } from "./settlementQueue";

const signer = "0x971e7790fe6c8f77dc666bb05d4aeda362653f94";
const ok = { connected: signer, chainId: 677, requiredSigner: signer, ready: true, stale: false, simulationOk: true };

describe("publisher limits", () => {
  it("keeps 200 wallets / 250,000 FLOW per batch / 500,000 FLOW per day", () => {
    expect(PUBLISHER_CONFIG).toMatchObject({ maxWalletsPerEpoch: 200, maxFlowPerEpoch: 250_000, maxFlowPerDay: 500_000, autonomousSigning: false });
    expect(publisherLimitChecks({ wallets: 201, totalFlow: 1000, flowPublishedLast24h: 0 })[0].pass).toBe(false);
    expect(publisherLimitChecks({ wallets: 1, totalFlow: 250_001, flowPublishedLast24h: 0 })[1].pass).toBe(false);
    expect(publisherLimitChecks({ wallets: 1, totalFlow: 250_000, flowPublishedLast24h: 250_001 })[2].pass).toBe(false);
    expect(publisherLimitChecks({ wallets: 200, totalFlow: 250_000, flowPublishedLast24h: 250_000 }).every((c) => c.pass)).toBe(true);
  });
});

describe("publisher wallet gate", () => {
  it("only the authorized signer on 677 with a fresh, simulated batch", () => {
    expect(publisherWalletGate(ok)).toBe("OK");
    expect(publisherWalletGate({ ...ok, connected: "0x0000000000000000000000000000000000000001" })).toBe("WRONG_WALLET");
    expect(publisherWalletGate({ ...ok, chainId: 56 })).toBe("WRONG_NETWORK");
    expect(publisherWalletGate({ ...ok, stale: true })).toBe("STALE");
    expect(publisherWalletGate({ ...ok, simulationOk: false })).toBe("SIMULATION_FAILED");
    expect(publisherWalletGate({ ...ok, ready: false })).toBe("BATCH_NOT_READY");
  });
  it("never reports success before a confirmed, verified receipt", () => {
    expect(phaseFromVerification(null, true)).toBe("BROADCAST_PENDING");
    expect(phaseFromVerification("reverted", true)).toBe("REVERTED");
    expect(phaseFromVerification("success", false)).toBe("CONFIRMED_MISMATCH");
    expect(phaseFromVerification("success", true)).toBe("CONFIRMED_VERIFIED");
  });
});

describe("signup award attribution", () => {
  const f = {
    reason: "REFERRAL_SIGNUP_BONUS", programId: "SIGNUP_BONUS", chainId: null, fundingState: "FUNDED", policyVersion: "FUNDED_SIGNUP_BONUS_V1",
    reservationId: "r", ledgerWallet: "0xAbC", refereeCreatedAt: "2026-10-14T00:00:00Z", refereeEmailVerified: true,
    recipientBoundWallet: "0xabc", refereeWalletAwardCount: 1, programFundingVerified: false,
  };
  it("verified provenance stays excluded until funding is confirmed", () => {
    expect(attributeSignupAward(f)).toBe("AWAITING_FUNDING_CONFIRMATION");
    expect(countsAsMainnetSignup(attributeSignupAward(f))).toBe(false);
    expect(attributeSignupAward({ ...f, programFundingVerified: true })).toBe("MAINNET_SIGNUP_ALLOCATION");
  });
  it("never converts pre-program, Testnet or unbound awards", () => {
    expect(attributeSignupAward({ ...f, refereeCreatedAt: "2026-10-03T00:00:00Z", programFundingVerified: true })).toBe("ACCOUNT_BEFORE_PROGRAM");
    expect(attributeSignupAward({ ...f, chainId: 968, programFundingVerified: true })).toBe("HAS_OTHER_CHAIN");
    expect(attributeSignupAward({ ...f, recipientBoundWallet: null, programFundingVerified: true })).toBe("WALLET_NOT_BOUND");
    expect(attributeSignupAward({ ...f, refereeWalletAwardCount: 2, programFundingVerified: true })).toBe("DUPLICATE_WALLET");
    expect(attributeSignupAward({ ...f, refereeEmailVerified: false, programFundingVerified: true })).toBe("EMAIL_NOT_VERIFIED");
  });
});
