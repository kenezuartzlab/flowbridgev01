import registry from "./productionRegistry.json";

export type ContractStatus = "ACTIVE PRODUCTION" | "DEPLOYED SUPPORTING" | "TESTNET" | "EXTERNAL INTEGRATION";
export interface ProductionContract {
  name: string;
  address: `0x${string}`;
  purpose: string;
  role: string;
  state: ContractStatus;
  chainId: number;
  network: string;
  explorer: string;
  source: string;
  verification: string;
  hasCode: boolean | null;
  runtimeBytes?: number;
  runtimeSha256?: string;
  verifiedAtBlock?: string;
}

/** Documentation snapshot only; execution configuration remains authoritative. */
export const PRODUCTION_CONTRACTS = registry as ProductionContract[];