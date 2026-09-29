import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Copy, ClipboardCheck, CheckCircle2, AlertTriangle, SkipForward, ArrowRight, Bot } from "lucide-react";
import { CREATORS, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { updateCreatorWorkflow } from "@/lib/creators.functions";
import { externalLinkProps } from "@/lib/external-link";

export const Route = createFileRoute("/outreach-runner")({
  head: () => ({
    meta: [
      { title: "Outreach Runner — Survival Tabs" },
      { name: "description", content: "One creator at a time: open profile, copy the saved message, review before sending." },
      { property: "og:title", content: "Outreach Runner — Survival Tabs" },
      { property: "og:description", content: "One-at-a-time browser-assisted creator outreach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OutreachRunner,
});

type RunnerStatus = "pasted" | "contacted" | "review" | "skipped";
const LS_KEY = "outreach-runner-v1";

function profileOf(c: CreatorRow): { platform: string; url: string } | null {
  if (c.tiktok) return { platform: "TikTok", url: c.tiktok };
  if (c.instagram) return { platform: "Instagram", url: c.instagram };
  if (c.facebook) return { platform: "Facebook", url: c.facebook };
  if (c.youtube) return { platform: "YouTube", url: c.youtube };
  if (c.otherPlatform && /^https?:\/\//.test(c.otherPlatform)) return { platform: "Other", url: c.otherPlatform };
  return null;
}

function handleOf(url: string): string | null {
  const m = url.match(/@([A-Za-z0-9._-]+)/);
  return m ? `@${m[1]}` : null;
}

function OutreachRunner() {
  const version = useCreatorsVersion();
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

  // Eligible: has a profile URL + saved personalized DM + not already contacted (contacted_date empty).
  const eligible = useMemo(() => {
    void version;
    return CREATORS.filter((c) => !!profileOf(c) && !!c.personalizedDm?.trim() && !c.contactedDate)
      .sort((a, b) => {
        const ra = /ready|outreach/i.test(a.sethNextAction ?? "") ? 0 : 1;
        const rb = /ready|outreach/i.test(b.sethNextAction ?? "") ? 0 : 1;
        return ra - rb || a.name.localeCompare(b.name);
      });
  }, [version]);

  const queue = eligible.filter((c) => !statuses[c.id] || statuses[c.id] === "pasted");
  const counts = {
    ready: eligible.filter((c) => !statuses[c.id]).length,
    pasted: Object.values(statuses).filter((s) => s === "pasted").length,
    contacted: Object.values(statuses).filter((s) => s === "contacted").length,
    review: Object.values(statuses).filter((s) => s === "review").length,
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

  const copyMessage = async () => {
    if (!current?.personalizedDm) return;
    try { await navigator.clipboard.writeText(current.personalizedDm); toast.success("Message copied"); }
    catch { toast.error("Copy failed — select the text and copy manually"); }
  };

  const profile = current ? profileOf(current) : null;
  const status = current ? statuses[current.id] : undefined;
  const btn = "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--gold)]">Creator outreach</div>
          <h1 className="font-display text-3xl text-foreground">Influencer Outreach Runner</h1>
          <p className="mt-1 text-base font-medium text-foreground">One creator at a time. Review before sending.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Browser Worker: Not connected yet
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Ready", counts.ready], ["Pasted", counts.pasted], ["Contacted", counts.contacted], ["Needs Review", counts.review]] as const).map(([l, n]) => (
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
              No creators ready. A creator appears here when they have a profile link, a saved personalized message, and no contact date yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl text-foreground">{current.name}</h2>
                  <div className="text-sm text-muted-foreground">
                    {profile?.platform}{profile && handleOf(profile.url) ? ` · ${handleOf(profile.url)}` : ""}
                  </div>
                  {profile ? <a {...externalLinkProps(profile.url)} className="break-all text-xs text-primary underline">{profile.url}</a> : null}
                </div>
                {status ? <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{status === "review" ? "Needs review" : status}</span> : null}
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Saved personalized message</div>
                <div className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-[15px] leading-relaxed text-foreground">{current.personalizedDm}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {profile ? <a {...externalLinkProps(profile.url)} className={btn}><ExternalLink className="h-4 w-4" />Open Profile</a> : null}
                <button onClick={copyMessage} className={btn}><Copy className="h-4 w-4" />Copy Message</button>
                <button onClick={() => { setStatus(current.id, "pasted"); toast.success("Marked pasted (this browser only)"); }} className={btn}><ClipboardCheck className="h-4 w-4" />Mark Pasted</button>
                <button disabled={busy || status === "contacted"} onClick={markContacted} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Mark Contacted</button>
                <button disabled={busy} onClick={markReview} className={btn}><AlertTriangle className="h-4 w-4" />Needs Review</button>
                <button onClick={() => { setStatus(current.id, "skipped"); setJustActed(true); }} className={btn}><SkipForward className="h-4 w-4" />Skip</button>
                <button onClick={goNext} className={`${btn} ${justActed ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 hover:bg-primary/90" : ""}`}>Next Creator<ArrowRight className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Nothing is sent automatically. Paste and send the message yourself on the profile, then click Mark Contacted.</p>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Up next ({queue.length})</div>
          <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
            {queue.slice(0, 50).map((c, i) => (
              <li key={c.id}>
                <button onClick={() => { setCurrentId(c.id); setJustActed(false); }} className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-secondary/50 ${c.id === current?.id ? "bg-secondary" : ""}`}>
                  <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{statuses[c.id] === "pasted" ? "pasted" : profileOf(c)?.platform}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
