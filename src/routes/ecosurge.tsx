import { createFileRoute } from "@tanstack/react-router";
import { SoonPage } from "./fortune";

export const Route = createFileRoute("/ecosurge")({
  head: () => ({
    meta: [
      { title: "Ecosurge Growth Hub — Coming Soon | FlowBridge" },
      { name: "description", content: "Ecosystem growth quests, campaigns and boosted rewards for BOT Chain builders and traders." },
    ],
  }),
  component: () => (
    <SoonPage
      title="Ecosurge Growth Hub"
      tagline="Ecosystem quests · Boosted campaigns"
      lines={[
        "A growth engine for BOT Chain: partner quests, seasonal campaigns, referral leaderboards.",
        "Stack FLOW multipliers by completing on-chain actions across the ecosystem.",
        "Preparing partner integrations.",
      ]}
    />
  ),
});
