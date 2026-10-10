import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { CREATORS, hydrateCreatorsFromDB, useCreatorsVersion } from "@/lib/creator-partnerships";

export const Route = createFileRoute("/")({
  component: InfluencerHome,
  head: () => ({ meta: [{ title: "Influencer Research — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
});

function InfluencerHome() {
  const useCreatorsVersionValue = useCreatorsVersion();
  useEffect(() => { void hydrateCreatorsFromDB(); }, []);
  const categories = useMemo(() => {
    const unique = new Map<string, (typeof CREATORS)[number]>();
    for (const c of CREATORS) {
      const handle = c.tiktok?.match(/(?:tiktok\\.com\\/)?@([a-z0-9._]+)/i)?.[1]?.toLowerCase();
      const key = handle ? `tiktok:${handle}` : `record:${c.id}`;
      if (!unique.has(key)) unique.set(key, c);
    }
    const rows = [...unique.values()];
    const rejected = (c: (typeof rows)[number]) => c.sethApprovalStatus === "rejected";
    const approved = (c: (typeof rows)[number]) => c.sethApprovalStatus === "approved";
    const secondLook = (c: (typeof rows)[number]) => Boolean(c.outreachSecondLookAt) && !rejected(c) && !approved(c);
    const moreResearch = (c: (typeof rows)[number]) => !rejected(c) && !approved(c) && !secondLook(c) && /needs more research/i.test(c.researchStatus || "");
    // Old AI qualification statuses are intentionally ignored until a fresh-screening stage is persisted.
    const forNow = rows.filter(c => !rejected(c) && !approved(c) && !secondLook(c) && !moreResearch(c));
    return [
      { name: "For Now", count: forNow.length, to: "/bobo-search" },
      { name: "AI Screened", count: 0, to: "/creators" },
      { name: "Complete Manual Review", count: rows.filter(approved).length, to: "/creators" },
      { name: "Take a Second Look", count: rows.filter(secondLook).length, to: "/creators" },
      { name: "Rejected", count: rows.filter(rejected).length, to: "/creators" },
      { name: "Needs More Research", count: rows.filter(moreResearch).length, to: "/creators" },
      { name: "Original List", count: CREATORS.length, to: "/creators" },
    ] as const;
  }, [useCreatorsVersionValue]);
  return <main className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
    <h1 className="mb-6 text-2xl font-bold">Influencers</h1>
    {categories.map((c, i) => <Link key={c.name} to={c.to} className="flex min-h-20 items-center justify-between rounded-xl border bg-card px-5 py-4 hover:border-primary/50">
      <span className="font-semibold">{i + 1}. {c.name}</span>
      <span className="flex items-center gap-4"><span className="tabular-nums text-muted-foreground">{c.count}</span><ArrowRight className="h-5 w-5" /></span>
    </Link>)}
  </main>;
}
