// ERC-20 metadata fetcher for custom token imports.
import { createPublicClient, http, isAddress, getAddress } from "viem";
import { botMainnet, botTestnet } from "@/lib/wagmi";
import { ERC20_ABI } from "@/lib/contracts";
import type { Token } from "./tokenRegistry";

export async function fetchTokenMetadata(
  address: string,
  isMainnet: boolean,
): Promise<Token | null> {
  if (!isAddress(address)) return null;
  const checksummed = getAddress(address);
  const client = createPublicClient({
    chain: isMainnet ? botMainnet : botTestnet,
    transport: http(),
  });
  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address: checksummed, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: checksummed, abi: ERC20_ABI, functionName: "name" }),
      client.readContract({ address: checksummed, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    return {
      address: checksummed.toLowerCase(),
      symbol: String(symbol),
      name: String(name),
      decimals: Number(decimals),
      imported: true,
    };
  } catch {
    return null;
  }
}
