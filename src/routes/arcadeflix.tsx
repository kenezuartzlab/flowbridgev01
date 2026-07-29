import { createFileRoute } from "@tanstack/react-router";
import { SoonPage } from "./fortune";

export const Route = createFileRoute("/arcadeflix")({
  head: () => ({
    meta: [
      { title: "ArcadeFlix P2E — Coming Soon | FlowBridge" },
      { name: "description", content: "Play-to-earn arcade powered by BOT Chain. Compete, climb leaderboards, earn FLOW." },
      { property: "og:title", content: "ArcadeFlix P2E — Skill-Based Arcade on BOT Chain" },
      { property: "og:description", content: "A curated library of skill-based arcade games with weekly prize pools and FLOW payouts by leaderboard rank." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/arcadeflix" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/arcadeflix" }],
  }),

  component: () => (
    <SoonPage
      title="ArcadeFlix [P2E]"
      tagline="Play · Compete · Earn FLOW"
      lines={[
        "A curated library of skill-based arcade games with weekly prize pools.",
        "Verified accounts earn FLOW proportional to leaderboard rank.",
        "In development.",
      ]}
    />
  ),
});
