/**
 * FlowBridge V12 — EIP-712 typed data for FlowRewardsDistributor claims.
 * Shared by the server signer and (read-only) client preview. Domain binds
 * chainId + verifyingContract; the message binds account, cumulativeEntitlement
 * and deadline — exactly matching CLAIM_TYPEHASH in the Solidity source.
 */
export type Hex = `0x${string}`;

export const FLOW_CLAIM_DOMAIN_NAME = "FlowRewardsDistributor";
export const FLOW_CLAIM_DOMAIN_VERSION = "1";

export const FLOW_CLAIM_TYPES = {
  Claim: [
    { name: "account", type: "address" },
    { name: "cumulativeEntitlement", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface FlowClaimTypedDataArgs {
  chainId: number;
  distributor: Hex;
  account: Hex;
  cumulativeEntitlement: bigint;
  deadline: bigint;
}

export function buildFlowClaimTypedData(args: FlowClaimTypedDataArgs) {
  return {
    domain: {
      name: FLOW_CLAIM_DOMAIN_NAME,
      version: FLOW_CLAIM_DOMAIN_VERSION,
      chainId: args.chainId,
      verifyingContract: args.distributor,
    },
    types: FLOW_CLAIM_TYPES,
    primaryType: "Claim" as const,
    message: {
      account: args.account,
      cumulativeEntitlement: args.cumulativeEntitlement,
      deadline: args.deadline,
    },
  };
}
