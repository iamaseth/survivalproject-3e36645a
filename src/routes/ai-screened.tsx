import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listWorkflowSection } from "@/lib/influencer-master.functions";

export const Route = createFileRoute("/ai-screened")({ component: AIScreened });

type Creator = {
  source_id: string;
  display_name: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  workflow_status: string | null;
};

function AIScreened() {
  const load = useServerFn(listWorkflowSection);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Creator[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void load({ data: { status: "ai_screened", page } })
      .then(result => {
        if (!active) return;
        setRows(result.rows);
        setCount(result.count);
      })
      .catch(err => { if (active) setError(String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, page]);

  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="text-sm underline">← Dashboard</Link>
    <h1 className="text-2xl font-bold">2. Profile Research</h1>
    <p className="text-sm text-muted-foreground">Mirrors the dashboard's Profile Research section. AI screening is not Seth's manual approval; no outreach is assigned here.</p>
    <p className="text-3xl font-bold">{count.toLocaleString()} creators</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading && <p>Loading creators…</p>}
    {!loading && !error && rows.length === 0 && <p>No creators in this section.</p>}
    <div className="divide-y rounded-xl border">
      {rows.map(c => <div key={c.source_id} className="space-y-2 p-4">
        <p className="font-semibold">{c.display_name || c.source_id}</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {c.tiktok_url && <a href={c.tiktok_url} target="_blank" rel="noopener noreferrer" className="underline">TikTok ↗</a>}
          {c.youtube_url && <a href={c.youtube_url} target="_blank" rel="noopener noreferrer" className="underline">YouTube ↗</a>}
          {c.instagram_url && <a href={c.instagram_url} target="_blank" rel="noopener noreferrer" className="underline">Instagram ↗</a>}
          {c.facebook_url && <a href={c.facebook_url} target="_blank" rel="noopener noreferrer" className="underline">Facebook ↗</a>}
        </div>
        <p className="text-xs text-muted-foreground">Profile Research · Awaiting manual review</p>
      </div>)}
    </div>
    <div className="flex items-center justify-between gap-4">
      <button type="button" className="rounded border px-4 py-2 disabled:opacity-50" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Previous</button>
      <span className="text-sm">Page {page + 1} of {Math.max(1, Math.ceil(count / 100))}</span>
      <button type="button" className="rounded border px-4 py-2 disabled:opacity-50" disabled={loading || (page + 1) * 100 >= count} onClick={() => setPage(p => p + 1)}>Next</button>
    </div>
  </main>;
}
