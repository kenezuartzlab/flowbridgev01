/**
 * FlowBridge V17.1B §2/§3 — the authoritative server-side reward-state resolver.
 *
 * Every surface that wants to say something about FLOW rewards (Home, /earn,
 * /rewards, the V16 Opportunity Engine, the V17 Mission Orchestrator, Flow AI)
 * calls THIS. No surface re-derives "claimable" from points arithmetic.
 *
 * Stage separation (§1):
 *   flowPointsTotal        — off-chain accrued FLOW Points (profiles.flow_points)
 *   convertibleFlowPoints  — the eligible subset an explicit conversion may move
 *   claimableFlow          — on-chain entitlement delta at the distributor
 *   claimedFlow            — cumulative FLOW already delivered on chain
 *   walletFlow             — live ERC-20 FLOW balance
 *   campaignPts            — separate campaign ledger, never convertible
 *
 * Fail closed: an unreadable stage is null and suppresses the next step.
 */
import {
  resolveRewardState,
  type RewardRequirement,
  type RewardState,
} from "./rewardStateTruth";

export const REWARD_STATE_DEFAULT_CHAIN_ID = 968;

export interface ResolvedRewardState extends RewardState {
  walletAddress: string | null;
  /** Distributor/token the on-chain stages were read from. */
  distributor: string | null;
  blockNumber: number | null;
}

export async function resolveRewardStateForUser(args: {
  userId: string;
  emailVerified: boolean;
  chainId?: number | null;
}): Promise<ResolvedRewardState> {
  const chainId = args.chainId ?? REWARD_STATE_DEFAULT_CHAIN_ID;
  const observedAt = new Date().toISOString();

  const [{ supabaseAdmin }, policyMod, dbMod] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./flowConversionPolicy"),
    import("@/lib/flowbridge-db.server"),
  ]);

  const conversionPolicyApproved = policyMod.isFlowConversionPolicyApprovedForChain(chainId);
  const policy = policyMod.getFlowConversionPolicy(chainId);

  let incentives: any = null;
  let ledgerAvailable = true;
  try {
    incentives = await dbMod.getUserPointsAndReferrals(args.userId);
  } catch {
    ledgerAvailable = false;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("wallet_address,claimed_tokens,flow_points")
    .eq("id", args.userId)
    .maybeSingle();

  const walletAddress =
    typeof profile?.wallet_address === "string" && profile.wallet_address.length > 0
      ? profile.wallet_address
      : null;

  const socials = incentives?.socials ?? null;
  const socialsMet = !!(socials?.youtube && socials?.x && socials?.telegram);
  const requirements: RewardRequirement[] = [
    {
      id: "EMAIL_VERIFIED",
      label: "Verified email",
      met: !!args.emailVerified,
      hint: "Verify your email before converting FLOW Points.",
    },
    {
      id: "WALLET_BOUND",
      label: "Bound wallet",
      met: !!walletAddress,
      hint: "Bind the wallet that will receive FLOW.",
    },
    {
      id: "COMMUNITY_FOLLOWS",
      label: "Community channels followed",
      met: socialsMet,
      hint: "Follow YouTube, X and Telegram.",
    },
  ];

  // On-chain stages. A bound wallet is required to have any entitlement at all;
  // with no wallet the claim stages are definitively zero, not unknown.
  let claimableFlowRaw: number | null = 0;
  let claimedFlow: number | null = 0;
  let walletFlow: number | null = 0;
  let distributor: string | null = null;
  let blockNumber: number | null = null;

  if (walletAddress && conversionPolicyApproved && policy) {
    const { readClaimState } = await import("@/lib/ai/mission/missionChainReads.server");
    const chain = await readClaimState({ chainId, account: walletAddress });
    if (!chain) {
      // Wallet exists but chain state is unreadable → fail closed.
      claimableFlowRaw = null;
      claimedFlow = null;
      walletFlow = null;
    } else {
      const lifetimeConverted = Number(profile?.claimed_tokens ?? 0);
      const entitlementWei =
        policyMod.cumulativeFlowEntitlement(lifetimeConverted, policy) ?? 0n;
      const deltaWei = entitlementWei > chain.claimedWei ? entitlementWei - chain.claimedWei : 0n;
      const oneFlow = 10n ** 18n;
      claimableFlowRaw = Number(deltaWei / oneFlow);
      claimedFlow = Number(chain.claimedWei / oneFlow);
      walletFlow = chain.walletFlowWei == null ? null : Number(chain.walletFlowWei / oneFlow);
      distributor = chain.distributor;
      blockNumber = chain.blockNumber;
    }
  }

  let campaignPts: number | null = null;
  if (walletAddress) {
    try {
      const { getWalletCampaignPoints } = await import("@/lib/campaign/participantApi.server");
      campaignPts = await getWalletCampaignPoints(walletAddress);
    } catch {
      campaignPts = null;
    }
  }

  const state = resolveRewardState({
    chainId,
    observedAt,
    flowPointsTotal: Number(incentives?.flowPoints ?? profile?.flow_points ?? 0),
    eligibleFlowPoints: Number(incentives?.claimableTotal ?? 0),
    conversionMinimum: Number(incentives?.claimThreshold ?? 1000),
    requirements,
    claimableFlowRaw,
    claimedFlow,
    walletFlow,
    campaignPts,
    conversionPolicyApproved,
    ledgerAvailable,
  });

  return { ...state, walletAddress, distributor, blockNumber };
}
