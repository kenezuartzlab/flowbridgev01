import { createFileRoute } from "@tanstack/react-router";
import { SoonPage } from "./fortune";

export const Route = createFileRoute("/ecosurge")({
  head: () => ({
    meta: [
      { title: "Ecosurge Growth Hub — Coming Soon | FlowBridge" },
      { name: "description", content: "Ecosystem growth quests, campaigns and boosted rewards for BOT Chain builders and traders." },
      { property: "og:title", content: "Ecosurge Growth Hub — BOT Chain Quests & Campaigns" },
      { property: "og:description", content: "Partner quests, seasonal campaigns and referral leaderboards that stack FLOW multipliers across the BOT Chain ecosystem." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/ecosurge" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/ecosurge" }],
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
