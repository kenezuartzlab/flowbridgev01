/**
 * FlowBridge V12.1 — owner parameter lock.
 *
 * Turns a source-controlled deployment config into an explicit per-parameter
 * APPROVED / BLOCKED verdict and, only when every parameter is approved, the
 * exact unsigned deployment order + constructor arguments.
 *
 * Fail-closed: no parameter ever receives a silent default. `decimals` is the
 * single exception and only because 18 is already canonical in the committed
 * Solidity source (`FlowToken.decimals()` is `pure override returns 18`).
 */

export type Hex = `0x${string}`;

export type ParameterStatus = "APPROVED" | "BLOCKED";

export interface ParameterVerdict {
  parameter: string;
  status: ParameterStatus;
  value: string | null;
  /** Authoritative source path for an approved value, or why it is blocked. */
  source: string;
}

export interface FlowDeploymentConfig {
  chainId?: number | null;
  network?: string | null;
  token?: {
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    totalSupply?: string | number | null;
    treasury?: string | null;
  } | null;
  distributor?: {
    owner?: string | null;
    rewardSigner?: string | null;
    initialFundingAmount?: string | number | null;
  } | null;
  claim?: {
    authorizationLifetimeSeconds?: number | null;
    conversionPolicyRef?: string | null;
  } | null;
}

export interface DeploymentStep {
  order: number;
  contract: "FlowToken" | "FlowRewardsDistributor";
  constructorArgs: (string | number)[];
  note: string;
}

export interface FlowDeploymentPlan {
  configPath: string;
  chainId: number | null;
  verdicts: ParameterVerdict[];
  blocked: string[];
  /** Present only when every parameter is APPROVED. */
  steps: DeploymentStep[] | null;
  postDeployActions: string[];
  ready: boolean;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isAddress(v: unknown): v is string {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

function positiveIntegerString(v: unknown): string | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return String(v);
  if (typeof v === "string" && /^[0-9]+$/.test(v) && BigInt(v) > 0n) return v;
  return null;
}

export function buildFlowDeploymentPlan(
  config: FlowDeploymentConfig,
  configPath: string,
): FlowDeploymentPlan {
  const t = config.token ?? {};
  const d = config.distributor ?? {};
  const c = config.claim ?? {};
  const verdicts: ParameterVerdict[] = [];

  const push = (parameter: string, ok: boolean, value: string | null, source: string) =>
    verdicts.push({ parameter, status: ok ? "APPROVED" : "BLOCKED", value: ok ? value : null, source });

  push(
    "token.name",
    typeof t.name === "string" && t.name.trim().length > 0,
    typeof t.name === "string" ? t.name : null,
    typeof t.name === "string" && t.name.trim() ? configPath : "No owner-approved token name in any source-controlled spec.",
  );
  push(
    "token.symbol",
    typeof t.symbol === "string" && t.symbol.trim().length > 0,
    typeof t.symbol === "string" ? t.symbol : null,
    typeof t.symbol === "string" && t.symbol.trim() ? configPath : "No owner-approved token symbol in any source-controlled spec.",
  );
  push(
    "token.decimals",
    t.decimals === 18,
    "18",
    t.decimals === 18
      ? "contracts/FlowToken.sol (decimals() is a canonical pure 18 override)"
      : "Config decimals deviates from the canonical 18 in contracts/FlowToken.sol.",
  );

  const supply = positiveIntegerString(t.totalSupply);
  push(
    "token.totalSupply",
    supply != null,
    supply,
    supply != null ? configPath : "No owner-approved fixed supply (raw base units) exists. Never inferred.",
  );

  push(
    "token.treasury",
    isAddress(t.treasury),
    isAddress(t.treasury) ? t.treasury : null,
    isAddress(t.treasury) ? configPath : "No owner-approved initial recipient / treasury address.",
  );

  const funding = positiveIntegerString(d.initialFundingAmount);
  const fundingWithinSupply = funding != null && supply != null && BigInt(funding) <= BigInt(supply);
  push(
    "distributor.initialFundingAmount",
    fundingWithinSupply,
    funding,
    fundingWithinSupply
      ? configPath
      : funding != null && supply != null
        ? "Funding amount exceeds the approved total supply / treasury allocation."
        : "No owner-approved distributor funding amount.",
  );

  push(
    "distributor.owner",
    isAddress(d.owner),
    isAddress(d.owner) ? d.owner : null,
    isAddress(d.owner) ? configPath : "No owner-approved contract owner (wallet/multisig) address.",
  );

  const signerOk = isAddress(d.rewardSigner) && (!isAddress(d.owner) || d.rewardSigner!.toLowerCase() !== d.owner!.toLowerCase());
  push(
    "distributor.rewardSigner",
    signerOk,
    isAddress(d.rewardSigner) ? d.rewardSigner : null,
    signerOk
      ? configPath
      : isAddress(d.rewardSigner)
        ? "Reward signer equals the contract owner; requires an explicit owner approval of the shared address."
        : "No owner-approved reward signer public address (private key stays a server-only secret).",
  );

  const lifetime = typeof c.authorizationLifetimeSeconds === "number" ? c.authorizationLifetimeSeconds : null;
  const lifetimeOk = lifetime != null && Number.isInteger(lifetime) && lifetime > 0 && lifetime <= 3600;
  push(
    "claim.authorizationLifetimeSeconds",
    lifetimeOk,
    lifetime != null ? String(lifetime) : null,
    lifetimeOk
      ? configPath
      : "No owner-approved bounded claim authorization lifetime (must be 1..3600 seconds; no indefinite signatures).",
  );

  const policyRef = typeof c.conversionPolicyRef === "string" && c.conversionPolicyRef.trim().length > 0 ? c.conversionPolicyRef : null;
  push(
    "claim.conversionPolicy",
    policyRef != null,
    policyRef,
    policyRef != null
      ? policyRef
      : "NONE — no approved PTS→FLOW conversion policy exists (src/lib/rewards/flowConversionPolicy.ts is null). Token claims stay disabled.",
  );

  const blocked = verdicts.filter((v) => v.status === "BLOCKED").map((v) => v.parameter);
  const ready = blocked.length === 0;

  const steps: DeploymentStep[] | null = ready
    ? [
        {
          order: 1,
          contract: "FlowToken",
          constructorArgs: [t.name as string, t.symbol as string, t.treasury as string, supply as string],
          note: "Mints the fixed supply exactly once to the approved treasury. No post-deploy mint path.",
        },
        {
          order: 2,
          contract: "FlowRewardsDistributor",
          constructorArgs: ["<FlowToken address from step 1>", d.rewardSigner as string, d.owner as string],
          note: "Binds token + reward signer; ownership starts at the approved owner (Ownable2Step).",
        },
      ]
    : null;

  return {
    configPath,
    chainId: typeof config.chainId === "number" ? config.chainId : null,
    verdicts,
    blocked,
    steps,
    postDeployActions: ready
      ? [
          `Treasury transfers ${funding} FLOW base units to the distributor (funding only; never mutates claimed[] accounting).`,
          "Run contracts/scripts/verify-deployment.ts against the written manifest.",
          "Only then fill contracts/deployments/bot-testnet.json and enable claims.",
        ]
      : ["BLOCKED — no deployment actions may be prepared until every parameter is APPROVED."],
    ready,
  };
}
