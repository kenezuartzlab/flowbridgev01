/**
 * Smart Trade V1 — on-chain verification record for BDEX V3 infrastructure.
 * Identity is (chainId, address). Verified read-only on 2026-09-30:
 * bytecode present, factory() == Factory, WETH9() == WBOT on each chain.
 * Enabled fee tiers (feeAmountTickSpacing): 500→10, 3000→60, 10000→200; 100 disabled.
 */
export type Hex = `0x${string}`;

export interface VerifiedV3Deployment {
  chainId: number;
  factory: Hex;
  swapRouter: Hex;
  quoterV2: Hex;
  positionManager: Hex;
  wrappedNative: Hex;
  universalRouter: Hex | null;
  v2Factory: Hex | null;
  v2Router: Hex | null;
  feeTiers: readonly number[];
}

const V3 = {
  factory: "0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419",
  swapRouter: "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929",
  quoterV2: "0x034A705b36067cff99ABf5C662Be881cBd8d0176",
  positionManager: "0xDAc3FcFF004d8a8675b94E44941A1a2e3b240090",
  wrappedNative: "0xD5452816194a3784dBa983426cCe7c122F4abd30",
} as const;

export const VERIFIED_V3: readonly VerifiedV3Deployment[] = [
  // Universal Router / V2 testnet candidates have NO code on 677 — not usable there.
  { chainId: 677, ...V3, universalRouter: null, v2Factory: null, v2Router: null, feeTiers: [500, 3000, 10000] },
  {
    chainId: 968,
    ...V3,
    universalRouter: "0x73Be0A1d8011B335A7aBeF6c45544E8ca4448AB5",
    v2Factory: "0x65b8e98ceA190d8c28B3e4716402027f634d15a3",
    v2Router: "0xD6425a02f0845B8D99e349C34D2E7A576E177345",
    feeTiers: [500, 3000, 10000],
  },
];

export function getVerifiedV3(chainId: number): VerifiedV3Deployment | undefined {
  return VERIFIED_V3.find((d) => d.chainId === chainId);
}
