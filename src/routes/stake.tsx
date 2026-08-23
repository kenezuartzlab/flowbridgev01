import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Coins, ShieldCheck } from "lucide-react";

import { BottomNav } from "@/components/nav/BottomNav";
import { SafeAreaPage, SectionHeader, Surface } from "@/components/ui-kit/primitives";
import { FlowStakingPreviewCard } from "@/components/staking/FlowStakingPreviewCard";
import { useAccountData } from "@/lib/app/useAccountData";
import { useCampaignProgress } from "@/lib/campaign/useCampaignProgress";

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
      { title: "FLOW Staking — FlowBridge" },
      {
        name: "description",
        content:
          "FLOW staking on BOT Testnet: the pre-funded, non-minting reward model, owner-gated parameters and the live BOT Testnet reward schedule. Read-only surface.",
      },
      { property: "og:title", content: "FLOW Staking — FlowBridge" },
      { property: "og:description", content: "FLOW staking on BOT Testnet: the pre-funded, non-minting reward model, owner-gated parameters and the live BOT Testnet reward schedule. Read-only surface." },
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

        <FlowStakingPreviewCard
          flowPoints={Number(incentives?.flowPoints ?? 0)}
          campaignPts={authenticated ? campaignPointsTotal : null}
        />

        <Surface>
          <SectionHeader title="How the vault will work" hint="Accounting model, fixed before launch" />
          <ul className="space-y-2.5 border-t border-hairline p-4 text-[12px] leading-relaxed text-muted">
            <li className="flex gap-2">
              <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Principal stays yours.</strong> Staked FLOW is
                tracked separately from reward inventory and is withdrawable at any time. There is
                no lock-up, no slashing and no owner path that can move user principal.
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
                stake, reward budget, epoch length and start time are unset until explicitly
                approved, which is why no rate or APR appears anywhere on this page.
              </span>
            </li>
          </ul>
        </Surface>

        <p className="px-1 text-[11px] leading-relaxed text-muted-soft">
          BOT Testnet validation vault — deployed, funded and lifecycle-verified end to end (stake,
          claim, withdraw). FLOW Points and Campaign PTS are separate off-chain metrics and are never
          staking principal or a staking multiplier. BOT Mainnet staking remains pending promotion.
        </p>

      </SafeAreaPage>
      <BottomNav />
    </>
  );
}
