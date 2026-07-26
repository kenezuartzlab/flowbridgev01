export const FLOWBRIDGE_TYPED_DATA_TYPES = {
  WalletProof: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "string" },
    { name: "statement", type: "string" },
  ],
} as const;

export function buildFlowBridgeTypedData(opts: {
  walletAddress: string;
  message: string;
  nonce: string;
}) {
  return {
    domain: {
      name: "FlowBridge",
      version: "1",
    },
    types: FLOWBRIDGE_TYPED_DATA_TYPES,
    primaryType: "WalletProof" as const,
    message: {
      wallet: opts.walletAddress.toLowerCase() as `0x${string}`,
      nonce: opts.nonce,
      statement: opts.message,
    },
  };
}