import { describe, expect, it } from "vitest";
import { APPLICATION_STATUS, COMPLIANCE_ACTION, FORM_ORDER_VERIFICATION, applicationFields } from "./applicationProfile.server";
import { PRODUCTION_CONTRACTS } from "../contracts/productionRegistry";
import { MAINNET_CONTRACTS } from "../contracts";
import { NATIVE_V3_MULTI_CANDIDATE } from "../swap/executionCapability";
import { MULTISEND_NETWORKS, isSupersededMultiSendContract } from "../multisend/deployments";

describe("application policy", () => {
  it("uses the owner-verified 16-field order without blocking on sign-in", () => {
    expect(FORM_ORDER_VERIFICATION.verified).toBe(true);
    expect(applicationFields({ whitepaperUrl: "" }).map((field) => field.id)).toEqual([
      "email", "name", "highlights", "channels", "stage", "deck", "github", "demo",
      "wallet", "assoc", "evidence", "scheme", "contactName", "contactMethod", "bd", "compliance",
    ]);
  });
  it("submission readiness does not imply onboarding or monitoring", () => {
    expect(APPLICATION_STATUS.application).toBe("READY TO SUBMIT");
    expect(APPLICATION_STATUS.qualification).toBe("PENDING PROGRAM ONBOARDING");
    expect(APPLICATION_STATUS.program).toBe("NOT YET APPROVED / MONITORING NOT YET STARTED");
  });
  it("compliance remains unaccepted and unsubmitted by the owner", () => {
    expect(COMPLIANCE_ACTION).toEqual({ actor: "OWNER", accepted: false, submitted: false });
    expect(applicationFields({ whitepaperUrl: "" }).find((x) => x.id === "compliance")?.status).toBe("owner");
  });
  it("receiving and backup wallets remain the owner-specified addresses", () => {
    const fields = applicationFields({ whitepaperUrl: "" });
    expect(fields.find((x) => x.id === "wallet")?.value).toBe("0x62b1902F23483e0AF44564681865E993AAA47368");
    expect(fields.find((x) => x.id === "assoc")?.value).toBe("0x8b3Ab1c5c5ff9a29B0008b5d8B9E5559a181b228");
  });
});

describe("documentation contract parity", () => {
  it("current routers match execution configuration", () => {
    expect(PRODUCTION_CONTRACTS.find((x) => x.name === "Router V3")?.address.toLowerCase()).toBe(MAINNET_CONTRACTS.flowBridgeRouterV3.toLowerCase());
    expect(PRODUCTION_CONTRACTS.find((x) => x.name === "Router V4")?.address).toBe(NATIVE_V3_MULTI_CANDIDATE[677].router);
    expect(PRODUCTION_CONTRACTS.find((x) => x.name === "Router Lens")?.address).toBe(NATIVE_V3_MULTI_CANDIDATE[677].lens);
  });
  it("MultiSend identity is chain-scoped and excludes superseded deployments", () => {
    for (const n of MULTISEND_NETWORKS) {
      expect(PRODUCTION_CONTRACTS.find((x) => x.name === "MultiSend V1" && x.chainId === n.chainId)?.address).toBe(n.contract);
      if (n.contract) expect(isSupersededMultiSendContract(n.chainId, n.contract)).toBe(false);
    }
    expect(PRODUCTION_CONTRACTS.some((x) => x.chainId === 677 && x.address.toLowerCase() === "0xa80d8740f378989f649ca14c54e4b4a42e68753c")).toBe(false);
    expect(PRODUCTION_CONTRACTS.some((x) => x.chainId === 677 && x.address.toLowerCase() === "0x3c6fdaf93f39c72be931ab80196292962ebe6b06")).toBe(false);
  });
  it("official bridge and BDEX stay external, never owned contracts", () => {
    expect(PRODUCTION_CONTRACTS.find((x) => x.name === "Official BOT Bridge Router")?.state).toBe("EXTERNAL INTEGRATION");
    expect(PRODUCTION_CONTRACTS.filter((x) => x.name.startsWith("BDEX")).every((x) => x.state === "EXTERNAL INTEGRATION")).toBe(true);
  });
});