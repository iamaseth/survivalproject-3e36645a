import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, CheckCircle2, AlertTriangle, ArrowRight, Bot, X } from "lucide-react";
import { CREATORS, creatorOutreachStage, useCreatorsVersion, type CreatorRow } from "@/lib/creator-partnerships";
import { updateCreatorWorkflow, importCreatorQualifications, addTikTokOutreachCreator } from "@/lib/creators.functions";
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
  const qualifyFn = useServerFn(importCreatorQualifications);
  const addCreatorFn = useServerFn(addTikTokOutreachCreator);
  const [newProfile, setNewProfile] = useState("");
  const [newName, setNewName] = useState("");
  const [newFollowers, setNewFollowers] = useState("");
  const [addingCreator, setAddingCreator] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [addResult, setAddResult] = useState<{ id: string; name: string; profile: string; created: boolean } | null>(null);
  const [statuses, setStatuses] = useState<Record<string, RunnerStatus>>({});
  const [restored, setRestored] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justActed, setJustActed] = useState(false);

  useEffect(() => {
    try { setStatuses(JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch { setStatuses({}); }
    setRestored(true);
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
      (readyIds ? readyIds.has(c.id) : (creatorOutreachStage(c) === "not_contacted" && c.qualificationStatus !== "Not Relevant" && c.qualificationStatus !== "Needs Review")) &&
      Boolean(c.tiktok)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [version, readyIds]);

  const queue = restored ? eligible.filter((c) => !statuses[c.id]) : [];
  const counts = {
    ready: eligible.filter((c) => !statuses[c.id]).length,
    contacted: Object.values(statuses).filter((s) => s === "contacted").length,
    review: Object.values(statuses).filter((s) => s === "review").length,
    notRelevant: Object.values(statuses).filter((s) => s === "skipped").length,
  };

  // Never show an already completed creator or the first creator before local progress is restored.
  const current = (currentId && queue.find((c) => c.id === currentId)) || queue[0] || null;
  const lockRef = useRef(false);

  // Next eligible creator after `fromId` in the existing queue order, skipping
  // anything already actioned (including ids passed in `alsoDone`). Wraps around.
  const nextAfter = (fromId: string | undefined, alsoDone: string[] = []) => {
    const done = new Set(alsoDone);
    const open = eligible.filter((c) => !statuses[c.id] && !done.has(c.id));
    const others = open.filter((c) => c.id !== fromId);
    if (!others.length) return null;
    const idx = eligible.findIndex((c) => c.id === fromId);
    if (idx < 0) return others[0].id;
    const after = others.find((c) => eligible.indexOf(c) > idx);
    return (after ?? others[0]).id;
  };

  const goNext = () => {
    if (lockRef.current) return;
    setJustActed(false);
    setCurrentId(nextAfter(current?.id));
  };

  // Runs one persisted action with a double-click guard; advances only on success.
  const runAction = async (fn: (c: CreatorRow) => Promise<void>, status: RunnerStatus, okMsg: string, errMsg: string) => {
    const target = current;
    if (!target || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    setActionFeedback(null);
    try {
      await fn(target);
      // Advance only after the database operation has completed successfully.
      const nextId = nextAfter(target.id, [target.id]);
      setStatus(target.id, status);
      setJustActed(false);
      setCurrentId(nextId);
      setActionFeedback({ kind: "success", message: `${target.name}: ${okMsg}. ${nextId ? "Next influencer loaded." : "Queue complete."}` });
      toast.success(okMsg);
    } catch (e) {
      const message = e instanceof Error ? e.message : errMsg;
      setActionFeedback({ kind: "error", message: `Could not save ${target.name}. Still on this influencer. ${message}` });
      toast.error(message);
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  };

  const persistQualification = async (id: string, qualification_status: "Needs Review" | "Not Relevant") => {
    const r = await qualifyFn({ data: { rows: [{ id, qualification_status }] } });
    if (r.updated !== 1) throw new Error("Creator status was not saved (no matching record).");
  };

  const today = new Date().toISOString().slice(0, 10);

  const markContacted = () => runAction(async (c) => {
    const p = profileOf(c);
    const saved = await updateFn({ data: { id: c.id, contacted_date: today, contact_method: c.contactMethod || `${p?.platform ?? "Other"} DM`, response_followup: "Waiting reply" } });
    if (!saved?.updated) throw new Error("Contact status could not be saved.");
    c.contactedDate = today;
  }, "contacted", "Marked contacted", "Could not update creator");

  const markNotRelevant = () => runAction(async (c) => {
    const existing = (c.renaNotes || "").trim();
    const note = `${today} — Outreach Runner: Not Relevant`;
    const rena_notes = existing ? `${existing}\n${note}` : note;
    const saved = await updateFn({ data: { id: c.id, response_followup: "Not Relevant", rena_notes } });
    if (!saved?.updated) throw new Error("Not Relevant status could not be saved.");
    c.responseFollowup = "Not Relevant";
    c.renaNotes = rena_notes;
    await persistQualification(c.id, "Not Relevant");
    c.qualificationStatus = "Not Relevant";
  }, "skipped", "Marked Not Relevant", "Could not update creator");

  const markReview = () => runAction(async (c) => {
    const existing = (c.renaNotes || "").trim();
    const note = `${today} — Outreach Runner: needs review before contact`;
    const rena_notes = existing ? `${existing}\n${note}` : note;
    const saved = await updateFn({ data: { id: c.id, rena_notes } });
    if (!saved?.updated) throw new Error("Review note could not be saved.");
    c.renaNotes = rena_notes;
    await persistQualification(c.id, "Needs Review");
    c.qualificationStatus = "Needs Review";
  }, "review", "Flagged for review", "Could not save review status");

  const addCreator = async () => {
    if (addingCreator || !newProfile.trim()) return;
    setAddingCreator(true);
    setAddResult(null);
    try {
      const result = await addCreatorFn({ data: {
        profile: newProfile.trim(), name: newName.trim(), followers: newFollowers.trim()
      } });
      setAddResult({ ...result, profile: newProfile.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add influencer");
    } finally {
      setAddingCreator(false);
    }
  };

  const continueAfterAdd = () => {
    if (!addResult) return;
    const params = new URLSearchParams(window.location.search);
    const ids = params.get("ids");
    if (ids) params.set("ids", [...new Set([...ids.split(",").filter(Boolean), addResult.id])].join(","));
    // The new record is loaded from the CRM on navigation, rather than being
    // temporarily inserted into the in-memory list.
    window.location.assign(`/outreach-runner?${params.toString()}`);
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

      <section className="rounded-xl border border-border bg-card p-4">
        <button type="button" onClick={() => setAddOpen((v) => !v)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {addOpen ? "Close" : "+ Add & Contact Influencer"}
        </button>
        {addOpen ? <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium">TikTok profile URL *
            <input value={newProfile} onChange={(e) => { setNewProfile(e.target.value); setAddResult(null); }}
              placeholder="https://www.tiktok.com/@americanprepper1"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" />
          </label>
          <label className="text-xs font-medium">Display name (optional)
            <input value={newName} onChange={(e) => { setNewName(e.target.value); setAddResult(null); }}
              placeholder="Americanprepper"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" />
          </label>
          <label className="text-xs font-medium">Followers (optional)
            <input value={newFollowers} onChange={(e) => { setNewFollowers(e.target.value); setAddResult(null); }}
              placeholder="29.9K"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" />
          </label>
          {addResult ? <div role="status" aria-live="polite" className="sm:col-span-3 rounded-lg border-2 border-emerald-600 bg-emerald-50 p-4 text-emerald-950">
            <div className="text-lg font-bold">{addResult.created ? "Influencer added to CRM" : "Already in CRM — no duplicate created"}</div>
            <div className="mt-1 text-sm font-medium">{addResult.name}</div>
            <div className="break-all text-xs">{addResult.profile}</div>
            <div className="mt-1 text-xs">CRM ID: {addResult.id}</div>
            <button type="button" onClick={continueAfterAdd} className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Continue to Outreach →</button>
          </div> : null}
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="button" disabled={addingCreator || !newProfile.trim() || Boolean(addResult)}
              onClick={() => void addCreator()}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {addingCreator ? "Checking CRM…" : "Add to CRM & Open Queue"}
            </button>
            <span className="text-xs text-muted-foreground">Checks for duplicate TikTok handles. Messaging remains manual.</span>
          </div>
        </div> : null}
      </section>
      {actionFeedback ? <div role="status" aria-live="polite" className={`rounded-lg border-2 p-4 text-sm font-semibold ${actionFeedback.kind === "error" ? "border-red-600 bg-red-50 text-red-950" : "border-emerald-600 bg-emerald-50 text-emerald-950"}`}>{actionFeedback.message}</div> : null}
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
              No TikTok creators are currently ready for outreach.
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
                  disabled={busy}
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
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">TikTok — Ready for Outreach ({queue.length})</div>
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
