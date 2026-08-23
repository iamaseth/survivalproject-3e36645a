import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
        <h1 className="font-display text-3xl text-foreground">Outreach Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review staged outreach and incoming replies. Sending remains disabled until the production mailbox is verified.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowGuide((value) => !value)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-secondary/40"
          aria-expanded={showGuide}
        >
          {showGuide ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <div className="font-semibold">What does this page do?</div>
            <div className="text-xs text-muted-foreground">Quick guide for team members</div>
          </div>
        </button>
        {showGuide ? (
          <div className="border-t border-border px-5 py-4 text-sm">
            <p className="mb-3">
              This page is a holding area where we prepare and check creator emails before anything is sent.
            </p>
            <ol className="space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">1. Create or choose a campaign.</strong> A campaign groups together creators we want to contact for the same outreach effort.</li>
              <li><strong className="text-foreground">2. Choose an approved email template.</strong> The template contains the email message and, when available, the Survival Tabs photo.</li>
              <li><strong className="text-foreground">3. Add creators to the queue.</strong> The system prepares emails for eligible creators and skips people who should not be contacted.</li>
              <li><strong className="text-foreground">4. Review each prepared email.</strong> Check the creator, email address, subject, message and status before approving it.</li>
              <li><strong className="text-foreground">5. Approve, skip or cancel.</strong> Approval means the email is ready for a future sending step. It does not send the email from this page.</li>
              <li><strong className="text-foreground">6. Review replies.</strong> Reply Triage helps sort incoming responses and flags unclear or risky replies for a team member to review.</li>
            </ol>
            <div className="mt-4 rounded-md border border-border bg-secondary/30 px-3 py-2 font-medium">
              Safety: this page does not currently send emails. Sending stays disabled until the production mailbox is verified.
            </div>
          </div>
        ) : null}
      </section>

      <OutreachReviewPanel />
    </div>
  );
}
