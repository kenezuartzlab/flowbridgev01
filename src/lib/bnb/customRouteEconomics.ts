/** Proposal-only arithmetic for custom-route cost disclosure. No fee or route is configured here. */
const E18 = 10n ** 18n;
const uint = (value: string): bigint | null => /^(0|[1-9]\d{0,77})$/.test(value) ? BigInt(value) : null;

export interface CustomRouteCostInput {
  grossOutput: string;
  proposalFeeBps: 5 | 10;
  extraGasUnits: string;
  gasPriceWei: string;
  outputPerBnb: string;
}

/** Extra cost versus the same direct pool swap; common direct-swap gas is deliberately excluded. */
export function customRouteCost(input: CustomRouteCostInput) {
  const gross = uint(input.grossOutput);
  const gasUnits = uint(input.extraGasUnits);
  const gasPrice = uint(input.gasPriceWei);
  const rate = uint(input.outputPerBnb);
  if (gross === null || gross === 0n || gasUnits === null || gasPrice === null || rate === null || rate === 0n || ![5, 10].includes(input.proposalFeeBps)) return null;
  const feeOutput = gross * BigInt(input.proposalFeeBps) / 10_000n;
  const extraGasOutput = gasUnits * gasPrice * rate / E18;
  const incrementalCostOutput = feeOutput + extraGasOutput;
  return {
    proposalOnly: true,
    approved: false,
    directRoutePlatformFeeBps: 0,
    feeOutput: feeOutput.toString(),
    extraGasOutput: extraGasOutput.toString(),
    incrementalCostOutput: incrementalCostOutput.toString(),
    userOutputAfterIncrementalCosts: incrementalCostOutput >= gross ? '0' : (gross - incrementalCostOutput).toString(),
    incrementalCostBpsFloor: (incrementalCostOutput * 10_000n / gross).toString(),
    comparison: 'ADAPTER_INCREMENT_ONLY_COMMON_DIRECT_GAS_EXCLUDED',
  } as const;
}
