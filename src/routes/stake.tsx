import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Coins, ShieldCheck } from "lucide-react";

import { BottomNav } from "@/components/nav/BottomNav";
import { SafeAreaPage, SectionHeader, Surface } from "@/components/ui-kit/primitives";
import { BOT_TESTNET, setSelectedChainId, useNetworkSession } from "@/lib/network/networkSession";
import { isFeatureAllowed } from "@/lib/network/environmentCapabilities";
import { FlowStakingPreviewCard } from "@/components/staking/FlowStakingPreviewCard";
import { StakingV2PreviewCard } from "@/components/staking/StakingV2PreviewCard";
import { MainnetGenesisStakeCard } from "@/components/staking/MainnetGenesisStakeCard";
import { MainnetLockedStakeCard } from "@/components/staking/MainnetLockedStakeCard";
import { resolveStakeHandoffFromServer } from "@/lib/ai/mission/missionClient";
import {
  parseStakeHandoff,
  STAKE_HANDOFF_FAILURE_COPY,
  type CanonicalStakeHandoff,
  type StakeHandoffFailure,
} from "@/lib/ai/mission/stakeHandoff";

import { useAccountData } from "@/lib/app/useAccountData";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";
import { BotNetworkBadge } from "@/components/layout/BotNetworkBadge";


/**
 * FlowBridge V13.2 — FLOW staking BOT Testnet surface.
 *
 * Read-only by construction. The testnet vault is deployed, verified and funded,
 * so this page shows live schedule state and the accounting model — it never
 * quotes a yield and cannot submit a stake or approval.
 */
export const Route = createFileRoute("/stake")({
  head: () => ({
    meta: [
      { title: "FLOW Staking — Five Products on BOT Mainnet | FlowBridge" },
      {
        name: "description",
        content:
          "Explore Flexible, 30D, 90D, 180D and 365D FLOW staking on BOT Mainnet with live contract terms, reserve checks and explicit wallet confirmation.",
      },
      { property: "og:title", content: "FLOW Staking — FlowBridge" },
      { property: "og:description", content: "Five FLOW staking products on BOT Mainnet with contract-derived terms and explicit wallet confirmation." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/stake" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/stake" }],
  }),
  component: StakePage,
});

function StakePage() {
  const { incentives } = useAccountData();
  const { campaignPointsTotal, authenticated } = useCampaignProgress();

  /**
   * V17.1E §2 — a mission handoff is resolved BEFORE the standalone staking form
   * initializes. While `pending` is true the card shows no default amount, so a
   * prepared mission stake can never be replaced by the standalone 10 FLOW
   * default. Every failure is explicit and blocks the write actions.
   */
  const [pending, setPending] = useState(() => {
    if (typeof window === "undefined") return false;
    return parseStakeHandoff(window.location.search).correlation != null;
  });
  const [handoff, setHandoff] = useState<CanonicalStakeHandoff | null>(null);
  const [failure, setFailure] = useState<StakeHandoffFailure | null>(null);
  const [failureCopy, setFailureCopy] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hint = parseStakeHandoff(window.location.search);
    if (!hint.correlation) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await resolveStakeHandoffFromServer(hint.correlation!);
        if (cancelled) return;
        if (res.stakeHandoff) {
          setHandoff(res.stakeHandoff);
          /**
           * §4 — a link amount hint is display only. If it disagrees with the
           * server-derived amount we surface it and never coerce the form.
           */
          if (
            hint.amountHint &&
            Number(hint.amountHint) !== Number(res.stakeHandoff.amount)
          ) {
            setFailureCopy(
              "The amount in this link disagrees with your mission's canonical prepared stake — the mission amount is used.",
            );
          }
        } else {
          setFailure(res.stakeHandoffFailure ?? "HANDOFF_HYDRATION_FAILED");
          setFailureCopy(
            res.message ??
              STAKE_HANDOFF_FAILURE_COPY[res.stakeHandoffFailure ?? "HANDOFF_HYDRATION_FAILED"],
          );
        }
      } catch {
        if (!cancelled) {
          setFailure("HANDOFF_HYDRATION_FAILED");
          setFailureCopy(STAKE_HANDOFF_FAILURE_COPY.HANDOFF_HYDRATION_FAILED);
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showTestnetTools = isFeatureAllowed("TESTNET_STAKING_LIFECYCLE", useNetworkSession().selectedChainId);
  return (
    <>
      <SafeAreaPage>
        <div className="flex items-center gap-2">
          <Link
            to="/earn"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-bold text-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Earn
          </Link>
          <h1 className="text-[18px] font-black tracking-[-0.01em]">FLOW staking</h1>
        </div>

        <BotNetworkBadge isMainnet />

        <MainnetGenesisStakeCard />

        <MainnetLockedStakeCard />


        {showTestnetTools ? (
        <FlowStakingPreviewCard
          flowPoints={Number(incentives?.flowPoints ?? 0)}
          campaignPts={authenticated ? campaignPointsTotal : null}
          missionHandoff={handoff}
          missionHandoffPending={pending}
          missionHandoffFailure={failure}
          missionNote={failureCopy ?? handoff?.note ?? null}
        />
        ) : (
          <button
            type="button"
            onClick={() => setSelectedChainId(BOT_TESTNET, "USER")}
            className="w-full rounded-xl border border-hairline px-3 py-2 text-left text-[11px] text-muted-soft"
          >
            BOT Testnet practice staking is hidden on Mainnet. Switch to BOT Testnet to use it.
          </button>
        )}

        <StakingV2PreviewCard />



        <Surface>
          <SectionHeader title="Staking accounting and withdrawal rules" hint="Contract-derived terms" />
          <ul className="space-y-2.5 border-t border-hairline p-4 text-[12px] leading-relaxed text-muted">
            <li className="flex gap-2">
              <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Principal stays yours.</strong> Staked FLOW is
                tracked separately from reward inventory. Flexible principal can be withdrawn without a fixed maturity;
                locked-product principal remains locked until its contract maturity date. Principal withdrawal and reward claims are separate wallet-confirmed transactions.
              </span>
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Rewards are pre-funded, never minted.</strong>{" "}
                FLOW has a fixed supply. Rewards can only be paid from an inventory the treasury
                funds up front, and a schedule cannot start until that inventory covers it in full.
              </span>
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Parameters are owner-gated.</strong> Minimum
                stake, reward budgets and product terms remain subject to the existing contract controls.
                Current terms and reserve availability appear in the product panels. The variable-reward oracle remains disabled.
              </span>
            </li>
          </ul>
        </Surface>

        <p className="px-1 text-[11px] leading-relaxed text-muted-soft">
          BOT Mainnet staking is publicly available through the existing verified contracts. Testnet validation panels are labeled separately.
          FLOW Points and Campaign PTS are off-chain metrics, not staking principal or a staking multiplier.
          Flexible and 30D have real-mainnet maturity evidence; 90D, 180D and 365D actual maturity evidence remains pending.
        </p>

      </SafeAreaPage>
      <BottomNav />
    </>
  );
}
