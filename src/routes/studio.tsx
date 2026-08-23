/**
 * FlowBridge V14 — /studio: the external Partner Campaign Studio.
 * Separate from the internal /sets console; every write is org-scoped server-side.
 */
import { createFileRoute } from "@tanstack/react-router";
import { BottomNav } from "@/components/nav/BottomNav";
import { PartnerStudio } from "@/components/studio/PartnerStudio";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Partner Campaign Studio — FlowBridge" },
      {
        name: "description",
        content:
          "Build, submit and track FlowBridge partner campaigns. Verified on-chain tasks, Campaign PTS rewards and FlowBridge review before anything goes live.",
      },
      { property: "og:title", content: "Partner Campaign Studio — FlowBridge" },
      {
        property: "og:description",
        content:
          "Create verified-activity campaigns for your project and submit them for FlowBridge review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/studio" }],
  }),
  component: StudioPage,
});

function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 pb-28 pt-4 sm:px-5">
      <PartnerStudio />
      <BottomNav />
    </div>
  );
}
