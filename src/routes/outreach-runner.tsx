import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, CheckCircle2, AlertTriangle, ArrowRight, Bot, X } from "lucide-react";
import { CREATORS, creatorReadyToContact, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { updateCreatorWorkflow } from "@/lib/creators.functions";
import { externalLinkProps } from "@/lib/external-link";

export const Route = createFileRoute("/outreach-runner")({
  head: () => ({
    meta: [
      { title: "Outreach Runner — Survival Tabs" },
      { name: "description", content: "One creator at a time: review the TikTok profile, write the DM, send manually, and move on." },
      { property: "og:title", content: "Outreach Runner — Survival Tabs" },
      { property: "og:description", content: "Simple one-at-a-time creator outreach workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OutreachRunner,
});

type RunnerStatus = "contacted" | "review" | "skipped";
const LS_KEY = "outreach-runner-v1";

function profileOf(c: CreatorRow): { platform: string; url: string } | null {
  if (c.tiktok) return { platform: "TikTok", url: c.tiktok };
  return null;
}

function handleOf(url: string): string | null {
  const m = url.match(/@([A-Za-z0-9._-]+)/);
  return m ? `@${m[1]}` : null;
}

function OutreachRunner() {
  const version = useCreatorsVersion();
  const readyIds = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("ids");
    return raw ? new Set(raw.split(",").filter(Boolean)) : null;
  }, []);
  const updateFn = useServerFn(updateCreatorWorkflow);
  const [statuses, setStatuses] = useState<Record<string, RunnerStatus>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justActed, setJustActed] = useState(false);

  useEffect(() => {
    try { setStatuses(JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch { /* ignore */ }
  }, []);

  const setStatus = (id: string, s: RunnerStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: s };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const eligible = useMemo(() => {
    void version;
    return CREATORS.filter((c) =>
      (readyIds ? readyIds.has(c.id) : creatorReadyToContact(c)) &&
      Boolean(c.tiktok)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [version, readyIds]);

  const queue = eligible.filter((c) => !statuses[c.id]);
  const counts = {
    ready: eligible.filter((c) => !statuses[c.id]).length,
    contacted: Object.values(statuses).filter((s) => s === "contacted").length,
    review: Object.values(statuses).filter((s) => s === "review").length,
    notRelevant: Object.values(statuses).filter((s) => s === "skipped").length,
  };

  const current = (currentId && CREATORS.find((c) => c.id === currentId)) || queue[0] || null;

  const goNext = () => {
    setJustActed(false);
    const rest = queue.filter((c) => c.id !== current?.id);
    setCurrentId(rest[0]?.id ?? null);
  };

  const today = new Date().toISOString().slice(0, 10);

  const markContacted = async () => {
    if (!current) return;
    const p = profileOf(current);
    setBusy(true);
    try {
      await updateFn({ data: { id: current.id, contacted_date: today, contact_method: current.contactMethod || `${p?.platform ?? "Other"} DM`, response_followup: "Waiting reply" } });
      current.contactedDate = today;
      setStatus(current.id, "contacted");
      setJustActed(true);
      toast.success("Marked contacted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update creator");
    } finally { setBusy(false); }
  };

  const markNotRelevant = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const existing = (current.renaNotes || "").trim();
      const note = `${today} — Outreach Runner: Not Relevant`;
      const rena_notes = existing ? `${existing}\n${note}` : note;
      await updateFn({ data: { id: current.id, response_followup: "Not Relevant", rena_notes } });
      current.responseFollowup = "Not Relevant";
      current.renaNotes = rena_notes;
      setStatus(current.id, "skipped");
      setJustActed(true);
      toast.success("Marked Not Relevant");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update creator");
    } finally { setBusy(false); }
  };

  const markReview = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const existing = (current.renaNotes || "").trim();
      const note = `${today} — Outreach Runner: needs review before contact`;
      const rena_notes = existing ? `${existing}\n${note}` : note;
      await updateFn({ data: { id: current.id, rena_notes } });
      current.renaNotes = rena_notes;
      setStatus(current.id, "review");
      setJustActed(true);
      toast.success("Flagged for review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally { setBusy(false); }
  };

  const profile = current ? profileOf(current) : null;
  const status = current ? statuses[current.id] : undefined;
  const baseButton = "inline-flex min-w-[170px] items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
          <h1 className="font-display text-3xl text-foreground">Influencer Outreach Runner</h1>
          <p className="mt-1 text-base font-medium text-foreground">Simple BoBo workflow: check fit, write DM, send, mark, next.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Manual-send mode
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Ready", counts.ready], ["Contacted", counts.contacted], ["Needs Review", counts.review], ["Not Relevant", counts.notRelevant]] as const).map(([l, n]) => (
          <div key={l} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{l}</div>
            <div className="font-display text-2xl text-foreground">{n}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-border bg-card p-5">
          {!current ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No TikTok creators are currently Ready to Contact.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl text-foreground">{current.name}</h2>
                  <div className="text-sm text-muted-foreground">
                    {profile?.platform}{profile && handleOf(profile.url) ? ` · ${handleOf(profile.url)}` : ""}
                  </div>
                  {profile ? <a {...externalLinkProps(profile.url)} className="break-all text-xs text-primary underline">{profile.url}</a> : null}
                </div>
                {status ? <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{status === "review" ? "Needs review" : status === "skipped" ? "Not relevant" : status}</span> : null}
              </div>

              <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                Open TikTok and decide whether this creator fits. If yes, send the profile screenshot to ChatGPT, copy the new DM into TikTok, send it manually, then return here and click Contacted.
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {profile ? (
                  <button
                    type="button"
                    onClick={() => window.open(profile.url, "_blank", "noopener,noreferrer")}
                    className={`${baseButton} border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100`}
                  >
                    <ExternalLink className="h-4 w-4" />1. Open TikTok
                  </button>
                ) : null}

                <button
                  disabled={busy || status === "contacted"}
                  onClick={markContacted}
                  className={`${baseButton} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  <CheckCircle2 className="h-4 w-4" />2. Contacted
                </button>

                <button
                  disabled={busy}
                  onClick={markReview}
                  className={`${baseButton} border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}
                >
                  <AlertTriangle className="h-4 w-4" />3. Needs Review
                </button>

                <button
                  disabled={busy}
                  onClick={markNotRelevant}
                  className={`${baseButton} border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100`}
                >
                  <X className="h-4 w-4" />4. Not Relevant
                </button>

                <button
                  onClick={goNext}
                  className={`${baseButton} ${justActed ? "bg-slate-900 text-white ring-2 ring-slate-400" : "border border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200"}`}
                >
                  5. Next Creator<ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">TikTok — Ready to Contact ({queue.length})</div>
          <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
            {queue.slice(0, 50).map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => { setCurrentId(c.id); setJustActed(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-secondary/50 ${c.id === current?.id ? "bg-secondary" : ""}`}
                >
                  <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{profileOf(c)?.platform}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
