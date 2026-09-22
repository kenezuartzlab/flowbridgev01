import { describe, expect, it } from "vitest";
import {
  MULTISEND_NETWORKS,
  SUPERSEDED_MULTISEND_DEPLOYMENTS,
  isMultiSendExecutable,
  isSupersededMultiSendContract,
  multiSendContract,
  networkForChain,
  supersededDeployment,
} from "./deployments";

const RC2 = "0x1b97CCbAE4D5128f8E5591ada21476609c7F2960";
const LEGACY = "0x535dDDA826142AC42cE288154e9595f080940aE9";

describe("multisend deployments", () => {
  it("routes BOT testnet sends to the explorer-verified RC2 contract", () => {
    expect(multiSendContract(968)).toBe(RC2);
    expect(isMultiSendExecutable(968)).toBe(true);
  });

  it("keeps BOT mainnet and both BNB networks locked", () => {
    for (const chainId of [677, 56, 97]) {
      expect(multiSendContract(chainId)).toBeNull();
      expect(isMultiSendExecutable(chainId)).toBe(false);
    }
  });

  it("fails closed for unknown networks", () => {
    expect(networkForChain(1)).toBeNull();
    expect(isMultiSendExecutable(1)).toBe(false);
  });

  it("records the legacy testnet address as superseded and never executable", () => {
    expect(isSupersededMultiSendContract(968, LEGACY)).toBe(true);
    expect(isSupersededMultiSendContract(968, LEGACY.toLowerCase())).toBe(true);
    expect(isSupersededMultiSendContract(968, RC2)).toBe(false);
    const record = supersededDeployment(968, LEGACY);
    expect(record?.status).toBe("SUPERSEDED");
    expect(record?.reason).toBe("VALID TESTNET BUILD, NOT EXPLORER-VERIFIABLE");
    expect(record?.supersededBy).toBe(RC2);
    // Historical explorer links stay resolvable for old Activity rows.
    expect(record?.explorer).toBe("https://scan.bohr.life");
  });

  it("never configures a superseded address as an active deployment", () => {
    for (const network of MULTISEND_NETWORKS) {
      if (!network.contract) continue;
      expect(isSupersededMultiSendContract(network.chainId, network.contract)).toBe(false);
    }
    expect(SUPERSEDED_MULTISEND_DEPLOYMENTS.length).toBeGreaterThan(0);
  });
});
