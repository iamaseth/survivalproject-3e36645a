import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listBatchOneResults } from "@/lib/influencer-master.functions";

export const Route = createFileRoute("/ai-screened")({ component: AIScreened });
type Creator = { id: string; name: string; tiktok: string | null; qualification_status: string | null; seth_approval_status: string | null; verification_evidence: string | null };
function AIScreened() {
  const load = useServerFn(listBatchOneResults);
  const [rows, setRows] = useState<Creator[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void load().then(setRows).catch(e => setError(String(e))); }, [load]);
  const qualified = rows.filter(c => c.qualification_status === "Qualified" && !c.seth_approval_status);
  return <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <Link to="/" className="text-sm underline">← Influencers</Link>
    <h1 className="text-2xl font-bold">AI Screened — Awaiting Your Approval</h1>
    <p className="text-sm text-muted-foreground">BoBo Batch 1. AI qualification is not manual approval. No outreach is assigned.</p>
    <p className="text-3xl font-bold">{qualified.length} candidates</p>
    {error && <p role="alert">{error}</p>}
    <div className="divide-y rounded-xl border">{qualified.map(c => <div key={c.id} className="space-y-2 p-4">
      <a href={c.tiktok || "#"} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{c.name} ↗</a>
      <p className="text-sm">{c.verification_evidence}</p>
      <p className="text-xs text-muted-foreground">Pending manual approval — no decision recorded</p>
    </div>)}</div>
  </main>;
}
