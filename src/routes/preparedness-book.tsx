import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/preparedness-book")({
  head: () => ({
    meta: [
      { title: "Preparedness Book — Survival Tabs" },
      { name: "description", content: "Promotion module for the Preparedness Book: chapters, assets and launch plan." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Preparedness Book — Survival Tabs" },
      { property: "og:description", content: "Promotion module for the Preparedness Book: chapters, assets and launch plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreparednessBookPage,
});

function PreparednessBookPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Promotion"
        title="Preparedness Book"
        description="Promotion workspace for the Preparedness Book — chapters, review status, and launch assets."
      />
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Preparedness Book promotion is part of the Promotion OS shell. Content and workflow land in a later step.
      </div>
    </div>
  );
}
