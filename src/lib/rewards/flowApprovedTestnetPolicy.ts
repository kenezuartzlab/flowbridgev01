/**
 * FlowBridge V12.2 — owner-approved BOT Testnet (968) deployment/funding gate.
 *
 * These constants are the frozen, owner-approved values for BOT TESTNET ONLY.
 * They are NOT mainnet tokenomics and carry no promise about mainnet conversion.
 * Every preflight check, deployment script and server-side policy compares
 * against this module; a mismatch is a hard STOP, never a silent adjustment.
 */

export type Hex = `0x${string}`;

export const APPROVED_BOT_TESTNET = {
  chainId: 968,
  network: "bot-testnet",
  token: {
    name: "FlowBridge Token",
    symbol: "FLOW",
    decimals: 18,
    /** 1,000,000,000 FLOW in raw base units. */
    totalSupply: "1000000000000000000000000000",
    treasury: "0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47" as Hex,
  },
  distributor: {
    owner: "0x628e237b73C5a37EF3968527563FA1a26b32BB97" as Hex,
    rewardSigner: "0xA7d016C50e2B54B0942e8bEF0b4E5a82362330a2" as Hex,
    /** 10,000,000 FLOW in raw base units. */
    initialFundingAmount: "10000000000000000000000000" as string,
  },
  claim: {
    authorizationLifetimeSeconds: 900,
    /** 1 FLOW Point = 1 FLOW (18 decimals). Campaign PTS are never included. */
    flowWeiPerPoint: 10n ** 18n,
    conversionPolicyRef:
      "contracts/OWNER_APPROVAL_SHEET.md#v122-bot-testnet-conversion-policy",
  },
} as const;

/** Treasury balance expected after the approved 10M funding transfer. */
export const APPROVED_TREASURY_BALANCE_AFTER_FUNDING =
  BigInt(APPROVED_BOT_TESTNET.token.totalSupply) -
  BigInt(APPROVED_BOT_TESTNET.distributor.initialFundingAmount);

const eqAddr = (a: unknown, b: string) =>
  typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * Compares a committed config object against the approved gate values.
 * Returns the list of mismatches; empty means the config is exactly approved.
 */
export function diffAgainstApprovedTestnet(config: any): string[] {
  const a = APPROVED_BOT_TESTNET;
  const out: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) out.push(msg);
  };

  check(config?.chainId === a.chainId, "chainId != 968");
  check(config?.network === a.network, "network != bot-testnet");
  check(config?.token?.name === a.token.name, "token.name mismatch");
  check(config?.token?.symbol === a.token.symbol, "token.symbol mismatch");
  check(config?.token?.decimals === a.token.decimals, "token.decimals mismatch");
  check(String(config?.token?.totalSupply) === a.token.totalSupply, "token.totalSupply mismatch");
  check(eqAddr(config?.token?.treasury, a.token.treasury), "token.treasury mismatch");
  check(eqAddr(config?.distributor?.owner, a.distributor.owner), "distributor.owner mismatch");
  check(
    eqAddr(config?.distributor?.rewardSigner, a.distributor.rewardSigner),
    "distributor.rewardSigner mismatch",
  );
  check(
    String(config?.distributor?.initialFundingAmount) === a.distributor.initialFundingAmount,
    "distributor.initialFundingAmount mismatch",
  );
  check(
    config?.claim?.authorizationLifetimeSeconds === a.claim.authorizationLifetimeSeconds,
    "claim.authorizationLifetimeSeconds != 900",
  );
  check(
    typeof config?.claim?.conversionPolicyRef === "string" &&
      config.claim.conversionPolicyRef.includes("OWNER_APPROVAL_SHEET.md"),
    "claim.conversionPolicyRef must reference the approved policy document",
  );
  check(
    BigInt(String(config?.distributor?.initialFundingAmount ?? 0)) <=
      BigInt(String(config?.token?.totalSupply ?? 0)),
    "funding exceeds total supply",
  );
  return out;
}

/** Mainnet must stay entirely unapproved in this gate. */
export function mainnetStillBlocked(mainnetConfig: any): boolean {
  const t = mainnetConfig?.token ?? {};
  const d = mainnetConfig?.distributor ?? {};
  const c = mainnetConfig?.claim ?? {};
  return (
    mainnetConfig?.chainId === 677 &&
    t.name == null &&
    t.symbol == null &&
    t.totalSupply == null &&
    t.treasury == null &&
    d.owner == null &&
    d.rewardSigner == null &&
    d.initialFundingAmount == null &&
    c.authorizationLifetimeSeconds == null &&
    c.conversionPolicyRef == null
  );
}
