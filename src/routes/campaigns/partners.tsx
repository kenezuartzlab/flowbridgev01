import { createFileRoute } from "@tanstack/react-router";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { ExploreTabs } from "@/components/campaigns/ExploreTabs";
import { PartnersDirectory } from "@/components/partners/PartnersDirectory";

export const Route = createFileRoute("/campaigns/partners")({
  head: () => ({
    meta: [
      { title: "Partners & Mini-Apps — FlowBridge" },
      {
        name: "description",
        content:
          "Discover FlowBridge partner mini-apps on BOT Chain — infrastructure, community and game experiences — with clear live, coming soon and in-development states.",
      },
      { property: "og:title", content: "Partners & Mini-Apps — FlowBridge" },
      { property: "og:description", content: "Discover FlowBridge partner mini-apps on BOT Chain — infrastructure, community and game experiences — with clear live, coming soon and in-development states." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/campaigns/partners" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/campaigns/partners" }],
  }),
  component: ExplorePartnersPage,
});

function ExplorePartnersPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar eyebrow="Explore" title="Partners & mini-apps" />
      <main className="mx-auto max-w-2xl space-y-5 p-3 pb-24 sm:p-4 md:max-w-4xl lg:max-w-[1240px] lg:py-6">
        <ExploreTabs className="px-1" />
        <PartnersDirectory />
      </main>
      <BottomNav />
    </div>
  );
}
