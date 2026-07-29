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
  const chainIdMatch = opts.message.match(/Chain ID:\s*(\d+)/i);
  const chainId = chainIdMatch?.[1] ? Number(chainIdMatch[1]) : 677;

  return {
    domain: {
      name: "FlowBridge",
      version: "1",
      chainId,
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