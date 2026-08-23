/**
 * V16 gate tests — deterministic feed behaviour: no invented economics, correct
 * scope isolation, dismissal/snooze semantics and stable ordering.
 */
import { describe, expect, it } from "vitest";
import {
  buildCampaignOpportunities,
  buildRewardOpportunities,
  buildStakingOpportunities,
  buildWalletOpportunities,
  filterByActorScope,
} from "./opportunityCandidates";
import { dedupeOpportunities, opportunityIdentity, rankOpportunities } from "./opportunityRanking";
import type { EvidenceItem } from "../aiTypes";

const now = new Date("2026-08-23T10:00:00.000Z");
const ev: EvidenceItem[] = [
  {
    id: "db.test",
    label: "Test evidence",
    dataClass: "FLOWBRIDGE_DB",
    authority: "AUTHORITATIVE_STATE",
    freshness: "REALTIME",
    observedAt: now.toISOString(),
  },
];

describe("V16 opportunity candidates", () => {
  it("emits no reward opportunity when the canonical read is degraded", () => {
    const items = buildRewardOpportunities(
      {
        claimableFlow: 12,
        flowPoints: 12,
        flowPointsToday: 0,
        dailyCoreSwapCap: 50,
        provenance: "DEGRADED",
        evidence: ev,
      },
      now,
    );
    expect(items).toHaveLength(0);
  });

  it("only surfaces claimable FLOW that canonical state actually reports", () => {
    const none = buildRewardOpportunities(
      { claimableFlow: 0, flowPoints: 0, flowPointsToday: 0, dailyCoreSwapCap: 50, provenance: "LIVE", evidence: ev },
      now,
    );
    expect(none.some((i) => i.type === "CLAIM_FLOW")).toBe(false);

    const some = buildRewardOpportunities(
      { claimableFlow: 25, flowPoints: 25, flowPointsToday: 0, dailyCoreSwapCap: 50, provenance: "LIVE", evidence: ev },
      now,
    );
    const claim = some.find((i) => i.type === "CLAIM_FLOW")!;
    expect(claim.economicSnapshot.claimableFlow).toBe(25);
    expect(claim.actorScope).toBe("AUTHENTICATED_USER");
  });

  it("reports the paused vault as a notice and never as a stake invitation", () => {
    const items = buildStakingOpportunities(
      {
        chainId: 968,
        vault: "0x36f2",
        paused: true,
        minStakeFlow: 10,
        scheduleEnded: false,
        stakedFlow: 100,
        earnedFlow: 9,
        provenance: "LIVE",
        evidence: ev,
      },
      now,
    );
    expect(items.map((i) => i.type)).toEqual(["VAULT_PAUSED"]);
  });

  it("skips campaigns that already ended", () => {
    const items = buildCampaignOpportunities(
      [
        {
          campaignId: "0xabc",
          slug: "past",
          name: "Past",
          endsAt: now.getTime() - 1000,
          remainingCampaignPoints: 50,
          completedTasks: 0,
          totalTasks: 2,
          provenance: "LIVE",
          evidence: ev,
        },
      ],
      now,
    );
    expect(items).toHaveLength(0);
  });
});

describe("V16 scope isolation", () => {
  it("withholds private opportunities from anonymous scopes", () => {
    const priv = buildWalletOpportunities(
      { boundWallet: null, signedIn: true, targetChainId: 968, provenance: "LIVE", evidence: ev },
      now,
    );
    expect(priv.length).toBeGreaterThan(0);
    expect(filterByActorScope(priv, ["PUBLIC"])).toHaveLength(0);
    expect(filterByActorScope(priv, ["PUBLIC", "AUTHENTICATED_USER"])).toHaveLength(priv.length);
  });
});

describe("V16 ranking, dedupe and suppression", () => {
  const campaign = buildCampaignOpportunities(
    [
      {
        campaignId: "0xabc",
        slug: "live",
        name: "Live campaign",
        endsAt: now.getTime() + 10 * 3_600_000,
        remainingCampaignPoints: 50,
        completedTasks: 1,
        totalTasks: 3,
        provenance: "LIVE",
        evidence: ev,
      },
    ],
    now,
  );

  it("derives a stable identity and dedupes repeats", () => {
    expect(opportunityIdentity({ domain: "CAMPAIGNS", type: "CAMPAIGN_CONTINUE", subject: "0xabc" })).toBe(
      opportunityIdentity({ domain: "CAMPAIGNS", type: "CAMPAIGN_CONTINUE", subject: "0xabc" }),
    );
    expect(dedupeOpportunities([...campaign, ...campaign])).toHaveLength(1);
  });

  it("hides a dismissed opportunity until it materially changes", () => {
    const item = campaign[0];
    const dismissedAfter = rankOpportunities({
      items: campaign,
      states: [{ key: item.id, dismissedAt: new Date(now.getTime() + 60_000).toISOString() }],
      now,
    });
    expect(dismissedAfter).toHaveLength(0);

    const dismissedBefore = rankOpportunities({
      items: campaign,
      states: [{ key: item.id, dismissedAt: new Date(now.getTime() - 60_000).toISOString() }],
      now,
    });
    expect(dismissedBefore).toHaveLength(1);
  });

  it("respects an active snooze window", () => {
    const item = campaign[0];
    expect(
      rankOpportunities({
        items: campaign,
        states: [{ key: item.id, snoozedUntil: new Date(now.getTime() + 3_600_000).toISOString() }],
        now,
      }),
    ).toHaveLength(0);
  });

  it("ranks urgent claimable FLOW above ambient campaign discovery", () => {
    const ambient = buildCampaignOpportunities(
      [
        {
          campaignId: "0xdef",
          slug: "ambient",
          name: "Ambient campaign",
          endsAt: now.getTime() + 30 * 24 * 3_600_000,
          remainingCampaignPoints: 10,
          completedTasks: 0,
          totalTasks: 1,
          provenance: "LIVE",
          evidence: ev,
        },
      ],
      now,
    );
    const rewards = buildRewardOpportunities(
      { claimableFlow: 500, flowPoints: 500, flowPointsToday: 0, dailyCoreSwapCap: 50, provenance: "LIVE", evidence: ev },
      now,
    );
    const ranked = rankOpportunities({ items: [...ambient, ...rewards], now });
    expect(ranked[0].domain).toBe("REWARDS");
    // deterministic: same input, same order
    expect(rankOpportunities({ items: [...rewards, ...ambient], now }).map((i) => i.id)).toEqual(
      ranked.map((i) => i.id),
    );
  });
});
