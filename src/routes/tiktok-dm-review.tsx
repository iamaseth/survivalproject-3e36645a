import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CREATORS, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { recordTikTokDmReview } from "@/lib/creators.functions";
import { baseCandidate, isDmRejected, isDmVerified, MIN_EVIDENCE } from "@/lib/tiktok-dm-verification";
import { externalLinkProps } from "@/lib/external-link";

export const Route = createFileRoute("/tiktok-dm-review")({
  head: () => ({
    meta: [
      { title: "TikTok DM Review — Survival Tabs" },
      { name: "description", content: "Researcher review of TikTok creators, 10 at a time, before they reach Rena's DM list." },
      { property: "og:title", content: "TikTok DM Review — Survival Tabs" },
      { property: "og:description", content: "Individually verify TikTok creators before outreach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Review,
});

const BATCH = 10;
const RV_KEY = "tiktok-dm-reviewer-name";

function Review() {
  const version = useCreatorsVersion();
  const [, force] = useState(0);
  const [offset, setOffset] = useState(0);
  const [reviewer, setReviewer] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem(RV_KEY) || ""));
  const pending = useMemo(() => {
    void version;
    return CREATORS.filter((c) => baseCandidate(c) && !isDmVerified(c) && !isDmRejected(c)).sort((a, b) => a.name.localeCompare(b.name));
  }, [version]);
  const verified = useMemo(() => { void version; return CREATORS.filter((c) => baseCandidate(c) && isDmVerified(c)).length; }, [version]);
  const batch = pending.slice(offset, offset + BATCH);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="font-display text-3xl text-foreground">TikTok DM Review</h1>
        <p className="text-sm text-muted-foreground">Researcher only. Open each profile yourself. Only creators you verify here appear on Rena's DM list.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4 text-sm">
        <div><div className="text-xs text-muted-foreground">Waiting review</div><div className="text-2xl font-semibold">{pending.length}</div></div>
        <div><div className="text-xs text-muted-foreground">Verified (on Rena's list)</div><div className="text-2xl font-semibold">{verified}</div></div>
        <label className="ml-auto text-xs">Your name
          <input value={reviewer} onChange={(e) => { setReviewer(e.target.value); localStorage.setItem(RV_KEY, e.target.value); }} className="mt-1 block rounded-md border border-input bg-background p-2 text-sm" placeholder="e.g. Vina" />
        </label>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>Batch: {pending.length ? offset + 1 : 0}–{Math.min(offset + BATCH, pending.length)} of {pending.length}</span>
        <div className="flex gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - BATCH))} className="rounded-md border border-input px-3 py-1.5 disabled:opacity-40">Previous 10</button>
          <button disabled={offset + BATCH >= pending.length} onClick={() => setOffset(offset + BATCH)} className="rounded-md border border-input px-3 py-1.5 disabled:opacity-40">Next 10</button>
        </div>
      </div>
      {batch.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Nothing waiting for review.</div> : null}
      {batch.map((c) => <ReviewCard key={c.id} c={c} reviewer={reviewer} onDone={() => force((n) => n + 1)} />)}
    </div>
  );
}

function ReviewCard({ c, reviewer, onDone }: { c: CreatorRow; reviewer: string; onDone: () => void }) {
  const save = useServerFn(recordTikTokDmReview);
  const [checks, setChecks] = useState({ profileOpened: false, relevant: false, urlCorrect: false, dmGrounded: false });
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const all = Object.values(checks).every(Boolean);

  const submit = async (decision: "verified" | "rejected") => {
    if (busy) return;
    setBusy(true);
    try {
      await save({ data: { id: c.id, decision, evidence, reviewer, checks } });
      const today = new Date().toISOString().slice(0, 10);
      const label = decision === "verified" ? "Verified for TikTok DM" : "Rejected for TikTok DM";
      c.fullVerification = `${label} — ${reviewer.trim()} — ${today}`; c.verificationEvidence = evidence.trim(); c.verificationDate = today;
      toast.success(decision === "verified" ? `${c.name} added to Rena's list` : `${c.name} kept off Rena's list`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };

  const box = (k: keyof typeof checks, label: string) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} className="mt-1" />{label}</label>
  );

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        <a {...externalLinkProps(c.tiktok)} className="break-all text-sm text-primary underline">{c.tiktok}</a>
      </div>
      {c.researchNotes ? <p className="whitespace-pre-wrap text-xs text-muted-foreground"><b>Existing notes (not proof):</b> {c.researchNotes.slice(0, 400)}</p> : null}
      <div className="rounded-md bg-secondary/40 p-3 text-sm"><b>Saved DM:</b> {c.personalizedDm}</div>
      <div className="grid gap-1 sm:grid-cols-2">
        {box("profileOpened", "I opened this TikTok profile myself today")}
        {box("urlCorrect", "The link above is the right creator's profile")}
        {box("relevant", "Their recent posts fit Survival Tabs (preparedness, outdoors, emergency food)")}
        {box("dmGrounded", "The DM mentions something actually on their profile")}
      </div>
      <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background p-2 text-sm" placeholder={`What you saw on their profile (min ${MIN_EVIDENCE} characters to verify), or why you rejected`} />
      <div className="flex gap-2">
        <button disabled={busy || !all || !reviewer.trim() || evidence.trim().length < MIN_EVIDENCE} onClick={() => void submit("verified")} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Verify → Rena's list</button>
        <button disabled={busy || !reviewer.trim() || evidence.trim().length < 5} onClick={() => void submit("rejected")} className="rounded-md border border-input px-4 py-2 text-sm disabled:opacity-40">Not ready</button>
      </div>
    </section>
  );
}
