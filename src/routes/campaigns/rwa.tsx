import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { ExploreTabs } from "@/components/campaigns/ExploreTabs";
import { RwaCatalog } from "@/components/rwa/RwaCatalog";
import { discoveryPreviewAllowed } from "@/lib/rwa/registry";

export const Route = createFileRoute("/campaigns/rwa")({
  beforeLoad: () => { if (!discoveryPreviewAllowed(import.meta.env.DEV)) throw notFound(); },
  head: () => ({ meta: [
    { title: "RWA Markets Research — FlowBridge" },
    { name: "description", content: "Read-only BNB gold and issuer-specific tokenized securities research. Trading, eligibility and release remain on HOLD." },
    { property: "og:title", content: "RWA Markets Research — FlowBridge" },
    { property: "og:description", content: "Explore verified XAUt identity and pending issuer catalogs without quotes, approvals or financial actions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: RwaPage,
});
function RwaPage() {
  return <div className="min-h-screen bg-background text-foreground">
    <AppTopBar eyebrow="Explore" title="RWA Markets" networkBadge={<span className="text-[10px] font-semibold text-warning">BNB Chain · Research only</span>}/>
    <main className="mx-auto max-w-6xl space-y-5 px-3 pb-8 pt-3 sm:px-5">
      <ExploreTabs/>
      <RwaCatalog/>
    </main>
    <BottomNav/>
  </div>;
}