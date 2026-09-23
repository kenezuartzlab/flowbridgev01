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
    /**
     * Deployed 2026-09-22 from the accepted RC2 build line (unchanged source,
     * self-contained Standard-JSON bundle, OpenZeppelin 5.6.1, solc 0.8.20,
     * optimizer 200, viaIR, shanghai), runtime byte-exact with the frozen
     * build, fully source-verified on scan.botchain.ai, and rehearsed live
     * (native Distribute / Consolidate / Advanced with exact recipient credit,
     * 1 bps fee to the approved production fee recipient, zero custody).
     */
    contract: "0xc54CAcfd96330949db0eAEd72dE930a2d06d9778",
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
    /**
     * Deployed 2026-09-23 from the accepted RC2 build line (unchanged source,
     * self-contained Standard-JSON bundle, OpenZeppelin 5.6.1, solc 0.8.20,
     * optimizer 200, viaIR, shanghai), runtime byte-exact with the frozen
     * build, source-verified on bscscan.com, live settings read back from
     * chain (fee 1 bps, MAX_FEE_BPS 100, cap 100, configNonce 0, unpaused,
     * zero balance) with the approved production owner and fee recipient, and
     * rehearsed live in native BNB (Distribute / Consolidate / Advanced /
     * duplicate recipients) with exact credit, exact 1 bps fee to the approved
     * production treasury and zero contract custody.
     *
     * Deployment identity is strictly chainId + address: this address string
     * also exists on other chains from the same deployer nonce and must never
     * be interpreted without its chain id.
     */
    contract: "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e",
    explorer: "https://bscscan.com",
  },

  {
    key: "bnb-testnet",
    chainId: 97,
    label: "BNB Smart Chain Testnet",
    nativeSymbol: "tBNB",
    testnet: true,
    priority: 4,
    /**
     * Deployed 2026-09-22 from the accepted RC2 build line (unchanged source,
     * self-contained Standard-JSON bundle, OpenZeppelin 5.6.1, solc 0.8.20,
     * optimizer 200, viaIR, shanghai), runtime byte-exact with the frozen
     * build, source-verified on testnet.bscscan.com, and rehearsed live:
     * native tBNB and ERC-20 Distribute / Consolidate / Advanced / duplicate
     * recipients with exact credit, a 1 bps fee in the transferred asset,
     * zero contract custody, 17 live rejections and live pause acceptance.
     * Chain-scoped: never shared with BOT networks and never a fallback.
     */
    contract: "0x535dDDA826142AC42cE288154e9595f080940aE9",
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
