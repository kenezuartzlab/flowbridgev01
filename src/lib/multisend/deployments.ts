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
    /**
     * RC2 (self-contained Standard-JSON bundle, OpenZeppelin 5.6.1) deployed
     * 2026-09-22, runtime byte-exact with the frozen build, publicly source
     * verified on scan.bohr.life, and re-rehearsed live: native and ERC-20
     * Distribute / Consolidate / Advanced with exact recipient credit, a 1 bps
     * fee in the transferred asset, zero contract custody, and live pause
     * acceptance. Supersedes 0x535dDDA826142AC42cE288154e9595f080940aE9.
     */
    contract: "0x1b97CCbAE4D5128f8E5591ada21476609c7F2960",
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

/**
 * Deployments that were valid but are no longer used for new sends. Historical
 * Activity rows and explorer links for these addresses stay intact; the app
 * must never route a new batch through them.
 */
export interface SupersededMultiSendDeployment {
  chainId: number;
  address: Address;
  status: "SUPERSEDED";
  reason: string;
  supersededBy: Address;
  explorer: string;
}

export const SUPERSEDED_MULTISEND_DEPLOYMENTS: SupersededMultiSendDeployment[] = [
  {
    chainId: 968,
    address: "0x535dDDA826142AC42cE288154e9595f080940aE9",
    status: "SUPERSEDED",
    reason: "VALID TESTNET BUILD, NOT EXPLORER-VERIFIABLE",
    supersededBy: "0x1b97CCbAE4D5128f8E5591ada21476609c7F2960",
    explorer: "https://scan.bohr.life",
  },
];

export function supersededDeployment(
  chainId: number,
  address: string,
): SupersededMultiSendDeployment | null {
  const key = address.toLowerCase();
  return (
    SUPERSEDED_MULTISEND_DEPLOYMENTS.find(
      (d) => d.chainId === chainId && d.address.toLowerCase() === key,
    ) ?? null
  );
}

/** True when the address must not be used for a new MultiSend batch. */
export function isSupersededMultiSendContract(chainId: number, address: string): boolean {
  return supersededDeployment(chainId, address) !== null;
}

export function networkForChain(chainId: number): MultiSendNetwork | null {
  return MULTISEND_NETWORKS.find((n) => n.chainId === chainId) ?? null;
}

/** True only when this exact chain has a verified, non-superseded deployment. */
export function isMultiSendExecutable(chainId: number): boolean {
  const contract = multiSendContract(chainId);
  return contract !== null;
}

export function multiSendContract(chainId: number): Address | null {
  const contract = networkForChain(chainId)?.contract ?? null;
  if (!contract) return null;
  // Fail closed: a superseded address is never executable, even if configured.
  if (isSupersededMultiSendContract(chainId, contract)) return null;
  return contract;
}


export function anyNetworkExecutable(): boolean {
  return MULTISEND_NETWORKS.some((n) => Boolean(n.contract));
}
