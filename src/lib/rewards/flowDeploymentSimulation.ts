/**
 * FlowBridge V12.1 — offline deployment dry-run simulator.
 *
 * Pure in-memory model of the committed Solidity semantics. Broadcasts nothing,
 * opens no RPC connection and derives no economic value: every input must come
 * from an APPROVED deployment plan (see flowDeploymentPlan.ts) or an explicitly
 * SIMULATED fixture used only by tests.
 *
 * Modelled invariants (mirroring contracts/FlowRewardsDistributor.sol):
 *  - claim requires a valid rewardSigner EIP-712 signature over
 *    (account, cumulativeEntitlement, deadline) bound to chainId + distributor
 *  - deadline expiry reverts SignatureExpired
 *  - cumulativeEntitlement <= claimed[account] reverts NothingToClaim (replay-safe)
 *  - claimed[] is advanced before transfer; only the delta moves
 *  - paused distributor reverts every claim
 */
import { buildFlowClaimTypedData, type Hex } from "./flowClaimTypedData";

export interface SimulatedDeploymentInput {
  chainId: number;
  token: { name: string; symbol: string; decimals: number; totalSupply: bigint; treasury: Hex };
  distributor: { owner: Hex; rewardSigner: Hex; fundingAmount: bigint };
  /** Deterministic pseudo-addresses so the dry-run output is reproducible. */
  addresses: { token: Hex; distributor: Hex };
}

export interface SimulatedDeployment {
  simulated: true;
  chainId: number;
  token: {
    address: Hex;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
    balances: Map<string, bigint>;
  };
  distributor: {
    address: Hex;
    token: Hex;
    owner: Hex;
    rewardSigner: Hex;
    paused: boolean;
    claimed: Map<string, bigint>;
  };
}

export type SimError =
  | "InvalidSigner"
  | "SignatureExpired"
  | "NothingToClaim"
  | "EnforcedPause"
  | "InsufficientDistributorBalance";

export interface ClaimResult {
  ok: boolean;
  error?: SimError;
  delta?: bigint;
  claimed?: bigint;
  distributorBalance?: bigint;
  accountBalance?: bigint;
}

const key = (a: string) => a.toLowerCase();

/** Step 1 + 2 + treasury funding, exactly in the documented deployment order. */
export function simulateDeployment(input: SimulatedDeploymentInput): SimulatedDeployment {
  if (input.token.totalSupply <= 0n) throw new Error("SupplyZero");
  if (input.distributor.fundingAmount > input.token.totalSupply) throw new Error("FundingExceedsSupply");

  const balances = new Map<string, bigint>();
  // FlowToken constructor: single mint to treasury.
  balances.set(key(input.token.treasury), input.token.totalSupply);

  const deployment: SimulatedDeployment = {
    simulated: true,
    chainId: input.chainId,
    token: {
      address: input.addresses.token,
      name: input.token.name,
      symbol: input.token.symbol,
      decimals: input.token.decimals,
      totalSupply: input.token.totalSupply,
      balances,
    },
    distributor: {
      address: input.addresses.distributor,
      token: input.addresses.token,
      owner: input.distributor.owner,
      rewardSigner: input.distributor.rewardSigner,
      paused: false,
      claimed: new Map(),
    },
  };

  // Treasury funds the distributor (plain ERC-20 transfer; no entitlement effect).
  transfer(deployment, input.token.treasury, input.addresses.distributor, input.distributor.fundingAmount);
  return deployment;
}

export function balanceOf(d: SimulatedDeployment, account: string): bigint {
  return d.token.balances.get(key(account)) ?? 0n;
}

function transfer(d: SimulatedDeployment, from: string, to: string, amount: bigint) {
  const fromBal = balanceOf(d, from);
  if (fromBal < amount) throw new Error("ERC20InsufficientBalance");
  d.token.balances.set(key(from), fromBal - amount);
  d.token.balances.set(key(to), balanceOf(d, to) + amount);
}

export interface SimulatedClaimArgs {
  account: Hex;
  cumulativeEntitlement: bigint;
  deadline: bigint;
  signature: Hex;
  now: bigint;
  /** Injected recovery so the simulation stays offline and deterministic. */
  recoverTypedDataAddress: (args: { typedData: ReturnType<typeof buildFlowClaimTypedData>; signature: Hex }) => Promise<Hex>;
}

export async function simulateClaim(d: SimulatedDeployment, args: SimulatedClaimArgs): Promise<ClaimResult> {
  if (d.distributor.paused) return { ok: false, error: "EnforcedPause" };
  if (args.now > args.deadline) return { ok: false, error: "SignatureExpired" };

  const typedData = buildFlowClaimTypedData({
    chainId: d.chainId,
    distributor: d.distributor.address,
    account: args.account,
    cumulativeEntitlement: args.cumulativeEntitlement,
    deadline: args.deadline,
  });

  let recovered: Hex;
  try {
    recovered = await args.recoverTypedDataAddress({ typedData, signature: args.signature });
  } catch {
    return { ok: false, error: "InvalidSigner" };
  }
  if (recovered.toLowerCase() !== d.distributor.rewardSigner.toLowerCase()) {
    return { ok: false, error: "InvalidSigner" };
  }

  const alreadyClaimed = d.distributor.claimed.get(key(args.account)) ?? 0n;
  if (args.cumulativeEntitlement <= alreadyClaimed) return { ok: false, error: "NothingToClaim" };

  const delta = args.cumulativeEntitlement - alreadyClaimed;
  if (balanceOf(d, d.distributor.address) < delta) {
    return { ok: false, error: "InsufficientDistributorBalance" };
  }

  // State advanced BEFORE transfer, matching the Solidity ordering.
  d.distributor.claimed.set(key(args.account), args.cumulativeEntitlement);
  transfer(d, d.distributor.address, args.account, delta);

  return {
    ok: true,
    delta,
    claimed: args.cumulativeEntitlement,
    distributorBalance: balanceOf(d, d.distributor.address),
    accountBalance: balanceOf(d, args.account),
  };
}

/** Shape consumed by contracts/scripts/verify-deployment.ts, from a simulated run. */
export function simulatedManifest(d: SimulatedDeployment, fundedAmount: bigint) {
  return {
    $simulated: true,
    network: "bot-testnet-dryrun",
    chainId: d.chainId,
    flowToken: {
      address: d.token.address,
      name: d.token.name,
      symbol: d.token.symbol,
      decimals: d.token.decimals,
      totalSupply: d.token.totalSupply.toString(),
      treasury: null,
      deployTxHash: "SIMULATED",
    },
    flowRewardsDistributor: {
      address: d.distributor.address,
      token: d.distributor.token,
      owner: d.distributor.owner,
      rewardSignerAddress: d.distributor.rewardSigner,
      paused: d.distributor.paused,
      fundedAmount: fundedAmount.toString(),
      deployTxHash: "SIMULATED",
    },
    deployer: "SIMULATED",
  };
}
