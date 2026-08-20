import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildFlowDeploymentPlan } from "./flowDeploymentPlan";
import {
  balanceOf,
  simulateClaim,
  simulateDeployment,
  simulatedManifest,
} from "./flowDeploymentSimulation";
import { buildFlowClaimTypedData, type Hex } from "./flowClaimTypedData";
import {
  APPROVED_BOT_TESTNET,
  diffAgainstApprovedTestnet,
  mainnetStillBlocked,
} from "./flowApprovedTestnetPolicy";
import {
  cumulativeFlowEntitlement,
  getFlowConversionPolicy,
  isFlowConversionPolicyApprovedForChain,
} from "./flowConversionPolicy";

const TESTNET_CONFIG_PATH = "contracts/config/bot-testnet.json";
const MAINNET_CONFIG_PATH = "contracts/config/bot-mainnet.json";

function readConfig(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("V12.2 owner parameter lock — committed configs", () => {
  it("has every BOT Testnet parameter APPROVED and equal to the owner-approved V12.2 values", () => {
    const config = readConfig(TESTNET_CONFIG_PATH);
    const plan = buildFlowDeploymentPlan(config, TESTNET_CONFIG_PATH);
    expect(plan.chainId).toBe(968);
    expect(plan.blocked).toEqual([]);
    expect(plan.ready).toBe(true);
    expect(plan.steps).toHaveLength(2);
    expect(diffAgainstApprovedTestnet(config)).toEqual([]);
    expect(plan.steps![0].constructorArgs).toEqual([
      "FlowBridge Token",
      "FLOW",
      "0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47",
      "1000000000000000000000000000",
    ]);
    const decimals = plan.verdicts.find((v) => v.parameter === "token.decimals")!;
    expect(decimals.status).toBe("APPROVED");
    expect(decimals.source).toContain("contracts/FlowToken.sol");
  });

  it("keeps BOT Mainnet 677 fully unapproved", () => {
    expect(mainnetStillBlocked(readConfig(MAINNET_CONFIG_PATH))).toBe(true);
  });

  it("rejects a config that drifts from the approved values", () => {
    const config = readConfig(TESTNET_CONFIG_PATH);
    config.token.symbol = "FLOWX";
    config.distributor.owner = `0x${"9".repeat(40)}`;
    const diffs = diffAgainstApprovedTestnet(config);
    expect(diffs).toContain("token.symbol mismatch");
    expect(diffs).toContain("distributor.owner mismatch");
  });

  it("applies the approved testnet-only conversion policy and excludes other chains", () => {
    expect(isFlowConversionPolicyApprovedForChain(968)).toBe(true);
    expect(isFlowConversionPolicyApprovedForChain(677)).toBe(false);
    expect(cumulativeFlowEntitlement(5, getFlowConversionPolicy(968))).toBe(5n * 10n ** 18n);
    expect(cumulativeFlowEntitlement(5, getFlowConversionPolicy(677))).toBeNull();
    expect(APPROVED_BOT_TESTNET.claim.authorizationLifetimeSeconds).toBe(900);
  });

  it("keeps BOT Mainnet 677 unconfigured and not deployable", () => {
    const plan = buildFlowDeploymentPlan(readConfig(MAINNET_CONFIG_PATH), MAINNET_CONFIG_PATH);
    expect(plan.chainId).toBe(677);
    expect(plan.ready).toBe(false);
    expect(plan.steps).toBeNull();
  });

  it("rejects funding above the approved supply and signer==owner without approval", () => {
    const plan = buildFlowDeploymentPlan(
      {
        chainId: 968,
        token: { name: "X", symbol: "X", decimals: 18, totalSupply: "100", treasury: `0x${"1".repeat(40)}` },
        distributor: {
          owner: `0x${"2".repeat(40)}`,
          rewardSigner: `0x${"2".repeat(40)}`,
          initialFundingAmount: "101",
        },
        claim: { authorizationLifetimeSeconds: 900, conversionPolicyRef: "spec" },
      },
      "inline-fixture",
    );
    expect(plan.blocked).toContain("distributor.initialFundingAmount");
    expect(plan.blocked).toContain("distributor.rewardSigner");
  });

  it("rejects unbounded claim lifetimes", () => {
    const base = {
      chainId: 968,
      token: { name: "X", symbol: "X", decimals: 18, totalSupply: "100", treasury: `0x${"1".repeat(40)}` },
      distributor: { owner: `0x${"2".repeat(40)}`, rewardSigner: `0x${"3".repeat(40)}`, initialFundingAmount: "10" },
    };
    for (const seconds of [0, -1, 86400]) {
      const plan = buildFlowDeploymentPlan(
        { ...base, claim: { authorizationLifetimeSeconds: seconds, conversionPolicyRef: "spec" } },
        "inline-fixture",
      );
      expect(plan.blocked).toContain("claim.authorizationLifetimeSeconds");
    }
  });

  it("emits the exact unsigned deployment order only for a fully approved (SIMULATED) config", () => {
    const plan = buildFlowDeploymentPlan(
      {
        chainId: 968,
        token: {
          name: "SIMULATED",
          symbol: "SIM",
          decimals: 18,
          totalSupply: "1000000000000000000000",
          treasury: `0x${"a".repeat(40)}`,
          },
        distributor: {
          owner: `0x${"b".repeat(40)}`,
          rewardSigner: `0x${"c".repeat(40)}`,
          initialFundingAmount: "100000000000000000000",
        },
        claim: { authorizationLifetimeSeconds: 900, conversionPolicyRef: "SIMULATED-SPEC" },
      },
      "inline-simulated-fixture",
    );
    expect(plan.ready).toBe(true);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps![0]).toMatchObject({ order: 1, contract: "FlowToken" });
    expect(plan.steps![0].constructorArgs).toEqual([
      "SIMULATED",
      "SIM",
      `0x${"a".repeat(40)}`,
      "1000000000000000000000",
    ]);
    expect(plan.steps![1].contract).toBe("FlowRewardsDistributor");
  });
});

describe("V12.1 dry-run deployment proof (offline, no broadcast)", () => {
  const TREASURY = `0x${"a".repeat(40)}` as Hex;
  const OWNER = `0x${"b".repeat(40)}` as Hex;
  const TOKEN_ADDR = `0x${"d".repeat(40)}` as Hex;
  const DIST_ADDR = `0x${"e".repeat(40)}` as Hex;
  const SUPPLY = 1_000_000_000000000000000000n;
  const FUNDING = 1_000000000000000000n;

  async function signer() {
    const { privateKeyToAccount } = await import("viem/accounts");
    return privateKeyToAccount(`0x${"11".repeat(32)}` as Hex);
  }

  async function recover() {
    const { recoverTypedDataAddress } = await import("viem");
    return async ({ typedData, signature }: any) =>
      (await recoverTypedDataAddress({ ...typedData, signature })) as Hex;
  }

  async function setup() {
    const rewardSigner = await signer();
    const deployment = simulateDeployment({
      chainId: 968,
      token: { name: "SIMULATED", symbol: "SIM", decimals: 18, totalSupply: SUPPLY, treasury: TREASURY },
      distributor: { owner: OWNER, rewardSigner: rewardSigner.address as Hex, fundingAmount: FUNDING },
      addresses: { token: TOKEN_ADDR, distributor: DIST_ADDR },
    });
    return { deployment, rewardSigner, recoverTypedDataAddress: await recover() };
  }

  it("mints exactly the supply to the treasury and binds token/owner/signer", async () => {
    const { deployment, rewardSigner } = await setup();
    expect(deployment.token.totalSupply).toBe(SUPPLY);
    expect(balanceOf(deployment, TREASURY)).toBe(SUPPLY - FUNDING);
    expect(balanceOf(deployment, DIST_ADDR)).toBe(FUNDING);
    expect(deployment.distributor.token).toBe(TOKEN_ADDR);
    expect(deployment.distributor.owner).toBe(OWNER);
    expect(deployment.distributor.rewardSigner.toLowerCase()).toBe(rewardSigner.address.toLowerCase());
    expect(deployment.distributor.paused).toBe(false);
  });

  it("runs a happy-path claim then rejects the replay of the same cumulative entitlement", async () => {
    const { deployment, rewardSigner, recoverTypedDataAddress } = await setup();
    const account = `0x${"f".repeat(40)}` as Hex;
    const cumulative = 250000000000000000n;
    const deadline = 2_000_000_000n;
    const typedData = buildFlowClaimTypedData({
      chainId: 968,
      distributor: DIST_ADDR,
      account,
      cumulativeEntitlement: cumulative,
      deadline,
    });
    const signature = (await rewardSigner.signTypedData(typedData as any)) as Hex;

    const first = await simulateClaim(deployment, {
      account,
      cumulativeEntitlement: cumulative,
      deadline,
      signature,
      now: 1_900_000_000n,
      recoverTypedDataAddress,
    });
    expect(first).toMatchObject({ ok: true, delta: cumulative, claimed: cumulative });
    expect(balanceOf(deployment, account)).toBe(cumulative);

    const replay = await simulateClaim(deployment, {
      account,
      cumulativeEntitlement: cumulative,
      deadline,
      signature,
      now: 1_900_000_001n,
      recoverTypedDataAddress,
    });
    expect(replay).toMatchObject({ ok: false, error: "NothingToClaim" });
    expect(balanceOf(deployment, account)).toBe(cumulative);

    // A later, higher cumulative pays only the difference.
    const higher = 400000000000000000n;
    const sig2 = (await rewardSigner.signTypedData(
      buildFlowClaimTypedData({
        chainId: 968,
        distributor: DIST_ADDR,
        account,
        cumulativeEntitlement: higher,
        deadline,
      }) as any,
    )) as Hex;
    const second = await simulateClaim(deployment, {
      account,
      cumulativeEntitlement: higher,
      deadline,
      signature: sig2,
      now: 1_900_000_002n,
      recoverTypedDataAddress,
    });
    expect(second).toMatchObject({ ok: true, delta: higher - cumulative });
    expect(balanceOf(deployment, account)).toBe(higher);
  });

  it("rejects expired deadlines, foreign signers and paused state", async () => {
    const { deployment, rewardSigner, recoverTypedDataAddress } = await setup();
    const account = `0x${"f".repeat(40)}` as Hex;
    const deadline = 1_000n;
    const args = { chainId: 968, distributor: DIST_ADDR, account, cumulativeEntitlement: 1n, deadline };
    const signature = (await rewardSigner.signTypedData(buildFlowClaimTypedData(args) as any)) as Hex;

    expect(
      await simulateClaim(deployment, {
        account,
        cumulativeEntitlement: 1n,
        deadline,
        signature,
        now: 1_001n,
        recoverTypedDataAddress,
      }),
    ).toMatchObject({ ok: false, error: "SignatureExpired" });

    const { privateKeyToAccount } = await import("viem/accounts");
    const foreign = privateKeyToAccount(`0x${"22".repeat(32)}` as Hex);
    const foreignSig = (await foreign.signTypedData(buildFlowClaimTypedData(args) as any)) as Hex;
    expect(
      await simulateClaim(deployment, {
        account,
        cumulativeEntitlement: 1n,
        deadline,
        signature: foreignSig,
        now: 900n,
        recoverTypedDataAddress,
      }),
    ).toMatchObject({ ok: false, error: "InvalidSigner" });

    // Wrong domain (mainnet chainId) must not validate on the testnet distributor.
    const wrongDomain = (await rewardSigner.signTypedData(
      buildFlowClaimTypedData({ ...args, chainId: 677 }) as any,
    )) as Hex;
    expect(
      await simulateClaim(deployment, {
        account,
        cumulativeEntitlement: 1n,
        deadline,
        signature: wrongDomain,
        now: 900n,
        recoverTypedDataAddress,
      }),
    ).toMatchObject({ ok: false, error: "InvalidSigner" });

    deployment.distributor.paused = true;
    expect(
      await simulateClaim(deployment, {
        account,
        cumulativeEntitlement: 1n,
        deadline,
        signature,
        now: 900n,
        recoverTypedDataAddress,
      }),
    ).toMatchObject({ ok: false, error: "EnforcedPause" });
  });

  it("produces a manifest whose fields agree with the simulated deployment", async () => {
    const { deployment } = await setup();
    const manifest = simulatedManifest(deployment, FUNDING);
    expect(manifest.$simulated).toBe(true);
    expect(manifest.chainId).toBe(968);
    expect(manifest.flowToken.totalSupply).toBe(SUPPLY.toString());
    expect(manifest.flowRewardsDistributor.token).toBe(manifest.flowToken.address);
    expect(manifest.flowRewardsDistributor.fundedAmount).toBe(FUNDING.toString());
  });
});
