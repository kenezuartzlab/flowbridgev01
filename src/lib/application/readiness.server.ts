// PRIVATE, read-only application readiness and canonical BOT Mainnet evidence.
import { createPublicClient, http } from "viem";
import { APPLICATION_STATUS, SUPPORT_POSITION, applicationFields, AWARD_CREDENTIAL, ANTI_CHEATING_NOTICE } from "./applicationProfile.server";
import { PRODUCTION_CONTRACTS } from "../contracts/productionRegistry";
import evidence from "../../../docs/private/bot-application/evidence-pack.json";

/** No estimated incentive metrics or qualification decisions before onboarding. */
export async function computeReadiness() {
  const client = createPublicClient({ transport: http("https://rpc.botchain.ai") });
  const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock()]);
  if (chainId !== 677) throw new Error("BOT Mainnet chain mismatch");
  const contracts = await Promise.all(PRODUCTION_CONTRACTS.map(async (contract) => {
    if (contract.chainId !== 677) return contract;
    const code = await client.getCode({ address: contract.address, blockNumber: block.number });
    return { ...contract, hasCode: Boolean(code && code !== "0x"), checkedAtBlock: block.number.toString() };
  }));
  return {
    generatedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    block: block.number.toString(),
    status: APPLICATION_STATUS,
    overall: APPLICATION_STATUS.application,
    supportPosition: SUPPORT_POSITION,
    fields: applicationFields({ whitepaperUrl: "" }),
    award: AWARD_CREDENTIAL,
    integrity: ANTI_CHEATING_NOTICE,
    contracts,
    evidence,
    formOrder: { verified: false, reason: "The current official form requires Google sign-in; confirm its field order before submission." },
    scope: "Pre-application product evidence only; no incentive monitoring, volume, user, TVL or eligibility estimates.",
  };
}
