import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getInfluencerMasterCounts, listBatchOneResults } from "@/lib/influencer-master.functions";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion } from "@/lib/creator-partnerships";

export const Route = createFileRoute("/")({
  component: InfluencerHome,
  head: () => ({ meta: [{ title: "Influencer Research — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
});

function InfluencerHome() {
  const useCreatorsVersionValue = useCreatorsVersion();
  const loadCounts = useServerFn(getInfluencerMasterCounts);
  const loadBatch = useServerFn(listBatchOneResults);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [batch, setBatch] = useState<Array<{id:string;name:string;tiktok:string|null;qualification_status:string|null;seth_approval_status:string|null;verification_evidence:string|null}>>([]);
  useEffect(() => { void loadBatch().then(setBatch).catch(console.error); }, [loadBatch]);
  const [masterCounts, setMasterCounts] = useState<{ total: number; boboQueueCount: number; sources: Record<string,number>; aiScreenedCount:number; aiRejectedCount:number } | null>(null);
  useEffect(() => { void loadCounts().then(setMasterCounts).catch(console.error); }, [loadCounts]);
  useEffect(() => { void hydrateCreatorsFromDB(); }, []);
  const categories = useMemo(() => {
    // Preserve every source record. Working-list deduplication uses verified social profile URLs,
    // not a TikTok-only key or a creator name (which could merge unrelated people).
    const unique = new Map<string, (typeof CREATORS)[number]>();
    const seenProfiles = new Map<string, string>();
    for (const c of CREATORS) {
      const profiles = (["tiktok", "youtube", "instagram", "facebook"] as const)
        .map(platform => {
          const value = c[platform]?.trim();
          if (!value) return "";
          try {
            const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
            return `${platform}:${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "").toLowerCase()}`;
          } catch { return ""; }
        }).filter(Boolean);
      const existingKey = profiles.map(p => seenProfiles.get(p)).find(Boolean);
      const key = existingKey || `record:${c.id}`;
      const prior = unique.get(key);
      // A manual decision always takes precedence when duplicate records exist.
      if (!prior || (!prior.sethApprovalStatus && c.sethApprovalStatus)) unique.set(key, c);
      for (const profile of profiles) seenProfiles.set(profile, key);
    }
    const rows = [...unique.values()];
    const rejected = (c: (typeof rows)[number]) => c.sethApprovalStatus === "rejected";
    const approved = (c: (typeof rows)[number]) => c.sethApprovalStatus === "approved";
    const secondLook = (c: (typeof rows)[number]) => Boolean(c.outreachSecondLookAt) && !rejected(c) && !approved(c);
    const moreResearch = (c: (typeof rows)[number]) => !rejected(c) && !approved(c) && !secondLook(c) && /needs more research/i.test(c.researchStatus || "");
    // Old AI qualification statuses are intentionally ignored until a fresh-screening stage is persisted.
    const forNow = rows.filter(c => !rejected(c) && !approved(c) && !secondLook(c) && !moreResearch(c));
    return [
      { name: "For Now", count: forNow.length, to: "/bobo-queue" },
      { name: "AI Screened", count: masterCounts?.aiScreenedCount ?? 0, to: "/ai-screened" },
      { name: "Complete Manual Review", count: rows.filter(approved).length, to: "/creators" },
      { name: "Take a Second Look", count: rows.filter(secondLook).length, to: "/creators" },
      { name: "Rejected", count: rows.filter(rejected).length + (masterCounts?.aiRejectedCount ?? 0), to: "/creators" },
      { name: "Needs More Research", count: rows.filter(moreResearch).length, to: "/creators" },
      { name: "Original List", count: CREATORS.length, to: "/influencer-original" },
    ] as const;
  }, [useCreatorsVersionValue, masterCounts]);
  const groups = categories.map((category, i) => {
    const rows = i === 1
      ? batch.filter(c => c.qualification_status === "Qualified" && !c.seth_approval_status).map(c => ({ id:c.id, name:c.name, url:c.tiktok, note:c.verification_evidence }))
      : i === 4
      ? [...CREATORS.filter(c => c.sethApprovalStatus === "rejected").map(c => ({ id:c.id, name:c.name, url:c.tiktok || c.instagram || c.youtube, note:c.sethApprovalNote || c.researchNotes })), ...batch.filter(c => c.qualification_status === "Not Relevant" && !c.seth_approval_status).map(c => ({ id:c.id, name:c.name, url:c.tiktok, note:c.verification_evidence }))]
      : i >= 2 && i <= 5
      ? CREATORS.filter(c => i === 2 ? c.sethApprovalStatus === "approved" : i === 3 ? Boolean(c.outreachSecondLookAt) && !c.sethApprovalStatus : !c.sethApprovalStatus && /needs more research/i.test(c.researchStatus || "")).map(c => ({ id:c.id, name:c.name, url:c.tiktok || c.instagram || c.youtube, note:c.researchNotes }))
      : [];
    return { ...category, rows };
  });
  return <main className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
    <h1 className="mb-6 text-2xl font-bold">Influencers</h1>
    {groups.map((c, i) => <section key={c.name} className="overflow-hidden rounded-xl border bg-card">
      <button type="button" aria-expanded={expanded === i} onClick={() => setExpanded(expanded === i ? null : i)}
        className="flex min-h-20 w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50">
        <span className="font-semibold">{i + 1}. {i === 2 ? "Manually Approved" : c.name}</span>
        <span className="flex items-center gap-4">
          <span className="tabular-nums text-muted-foreground">{(i === 6 && masterCounts ? masterCounts.total : i === 0 && masterCounts ? masterCounts.boboQueueCount : c.count).toLocaleString()}</span>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded === i ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded === i && <div className="border-t px-4 py-3">
        {i === 0 && <p className="mb-3 text-sm text-muted-foreground">BoBo's full research queue, progress counter, and next-profile button.</p>}
        {i === 6 && <p className="mb-3 text-sm text-muted-foreground">Browse the complete original source records.</p>}
        {(i === 0 || i === 6) && <Link to={c.to} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">Open full list <ExternalLink className="h-4 w-4" /></Link>}
        {i !== 0 && i !== 6 && <>
          {c.rows.length === 0 && <p className="text-sm text-muted-foreground">No profiles in this section.</p>}
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {c.rows.map(person => <details key={person.id} className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer font-medium">{person.name || person.id}</summary>
              <div className="space-y-2 pt-2 text-sm">
                {person.note && <p className="whitespace-pre-wrap text-muted-foreground">{person.note}</p>}
                {person.url && /^https?:\/\//i.test(person.url) && <a href={person.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Open creator profile <ExternalLink className="h-4 w-4" /></a>}
                <p className="text-xs text-muted-foreground">Existing manual decisions are preserved. Approval changes are not made from this view.</p>
              </div>
            </details>)}
          </div>
        </>}
      </div>}
    </section>)}
  </main>;
}
