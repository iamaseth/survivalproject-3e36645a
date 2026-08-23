import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SimpleBulkOutreachPanel } from "@/components/creators/SimpleBulkOutreachPanel";

export const Route = createFileRoute("/creators/outreach")({
  component: CreatorOutreachReview,
  head: () => ({
    meta: [
      { title: "Bulk Outreach — Survival Tabs" },
      { name: "description", content: "Prepare, review, and approve creator emails before sending." },
    ],
  }),
});

function CreatorOutreachReview() {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
        <h1 className="font-display text-3xl text-foreground">Bulk Outreach</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepare creator emails, check them, and mark them ready. Nothing sends from this page yet.
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
            <div className="font-semibold">How Bulk Outreach works</div>
            <div className="text-xs text-muted-foreground">Simple team guide</div>
          </div>
        </button>
        {showGuide ? (
          <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
            <p>1. Choose the campaign and approved email.</p>
            <p className="mt-2">2. Choose the creators you want to contact.</p>
            <p className="mt-2">3. Prepare the emails, preview them, and mark good ones Ready.</p>
            <p className="mt-2">4. Replies that need a person will appear at the bottom.</p>
            <div className="mt-4 rounded-md border border-border bg-secondary/30 px-3 py-2 font-medium text-foreground">
              Safety checks for duplicates, Do Not Contact, prior replies, and sending limits stay automatic in the background.
            </div>
          </div>
        ) : null}
      </section>

      <SimpleBulkOutreachPanel />
    </div>
  );
}
