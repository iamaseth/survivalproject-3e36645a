import { createFileRoute } from "@tanstack/react-router";
import { OutreachReviewPanel } from "@/components/creators/OutreachReviewPanel";

export const Route = createFileRoute("/creators/outreach")({
  component: CreatorOutreachReview,
  head: () => ({
    meta: [
      { title: "Outreach Review — Survival Tabs" },
      { name: "description", content: "Human review for staged creator outreach and reply triage." },
    ],
  }),
});

function CreatorOutreachReview() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
        <h1 className="font-display text-3xl text-foreground">Outreach Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review staged outreach and incoming replies. Sending remains disabled until the production mailbox is verified.
        </p>
      </div>
      <OutreachReviewPanel />
    </div>
  );
}
