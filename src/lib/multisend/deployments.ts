/**
 * FlowBridge MultiSend V1 — canonical deployment inventory.
 *
 * Fail closed by construction: a network is only executable once its verified
 * contract address is recorded here. No address is ever guessed, derived from
 * another network, or hard-coded before explorer verification, so MultiSend
 * stays read-only on every network that is not yet deployed and verified.
 */
import type { Address } from "./types";

export interface MultiSendNetwork {
  key: string;
  chainId: number;
  label: string;
  nativeSymbol: string;
  testnet: boolean;
  priority: number;
  /** Verified deployment address, or null while the network is not live. */
  contract: Address | null;
  /** Explorer base URL for receipts. */
  explorer: string;
}

/** BOT Chain first, then BNB Chain — matching the V1 release sequence. */
export const MULTISEND_NETWORKS: MultiSendNetwork[] = [
  {
    key: "bot-mainnet",
    chainId: 677,
    label: "BOT Chain",
    nativeSymbol: "BOT",
    testnet: false,
    priority: 1,
    contract: null,
    explorer: "https://scan.botchain.ai",
  },
  {
    key: "bot-testnet",
    chainId: 968,
    label: "BOT Chain Testnet",
    nativeSymbol: "tBOT",
    testnet: true,
    priority: 2,
    contract: null,
    explorer: "https://scan.bohr.life",
  },
  {
    key: "bnb-mainnet",
    chainId: 56,
    label: "BNB Smart Chain",
    nativeSymbol: "BNB",
    testnet: false,
    priority: 3,
    contract: null,
    explorer: "https://bscscan.com",
  },
  {
    key: "bnb-testnet",
    chainId: 97,
    label: "BNB Smart Chain Testnet",
    nativeSymbol: "tBNB",
    testnet: true,
    priority: 4,
    contract: null,
    explorer: "https://testnet.bscscan.com",
  },
];

export function networkForChain(chainId: number): MultiSendNetwork | null {
  return MULTISEND_NETWORKS.find((n) => n.chainId === chainId) ?? null;
}

/** True only when this exact chain has a verified MultiSend deployment. */
export function isMultiSendExecutable(chainId: number): boolean {
  const n = networkForChain(chainId);
  return Boolean(n?.contract);
}

export function multiSendContract(chainId: number): Address | null {
  return networkForChain(chainId)?.contract ?? null;
}

export function anyNetworkExecutable(): boolean {
  return MULTISEND_NETWORKS.some((n) => Boolean(n.contract));
}
