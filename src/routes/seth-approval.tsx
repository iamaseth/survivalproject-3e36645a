import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CREATORS, refreshCreatorsFromDB, type CreatorRow } from "@/lib/creator-partnerships";
import { amICreatorApprover, sethReviewCreator } from "@/lib/creators.functions";

export const Route = createFileRoute("/seth-approval")({
 validateSearch: (search: Record<string, unknown>) => ({ history: search.history === true || search.history === "true" }),
 head: () => ({ meta: [
  { title: "Approval History — Survival Tabs" },
  { name: "description", content: "Final creator approval decision history and reversible rejection." },
  { property: "og:title", content: "Approval History — Survival Tabs" },
  { property: "og:description", content: "Review prior approval decisions for the shared creator outreach pool." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
 ] }),
 component: ApprovalHistory,
});
function ApprovalHistory() {
 const { history } = Route.useSearch();
 return history ? <DecisionHistory /> : <Navigate to="/creators" hash="final-approval" replace />;
}
function DecisionHistory() {
 const check = useServerFn(amICreatorApprover);
 const [allowed, setAllowed] = useState<boolean | null>(null);
 const [rows, setRows] = useState<CreatorRow[]>([]);
 const [error, setError] = useState("");
 useEffect(() => { check().then(async (r) => { setAllowed(r.approver); if (r.approver) { await refreshCreatorsFromDB(); setRows(CREATORS.filter((c) => c.sethApprovalStatus)); } }).catch((e) => setError(e instanceof Error ? e.message : "Could not load history")); }, []);
 if (error) return <p role="alert" className="p-4 text-destructive">{error}</p>;
 if (allowed === null) return <p className="p-4 text-sm">Checking access…</p>;
 if (!allowed) return <p className="p-4 text-sm">Your account cannot access approval history.</p>;
 return <div className="space-y-3"><h1 className="font-display text-2xl">Approval history</h1>{rows.length ? <div className="overflow-hidden rounded-xl border border-border bg-card">{rows.map((c) => <HistoryRow key={c.id} c={c} onDone={() => setRows(CREATORS.filter((r) => r.sethApprovalStatus))} />)}</div> : <p className="text-sm text-muted-foreground">No decisions yet.</p>}</div>;
}
function HistoryRow({ c, onDone }: { c: CreatorRow; onDone: () => void }) {
 const review = useServerFn(sethReviewCreator);
 const [busy, setBusy] = useState(false);
 const undo = async () => {
  if (busy) return; setBusy(true);
  try { await review({ data: { id: c.id, decision: "cleared", note: "Authorized reviewer undid final decision" } }); c.sethApprovalStatus = null; onDone(); toast.success("Decision undone — research requirements still apply"); }
  catch (e) { toast.error(e instanceof Error ? e.message : "Could not undo"); }
  finally { setBusy(false); }
 };
 return <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"><span className="font-medium">{c.name}</span><span className="text-sm text-muted-foreground">{c.sethApprovalStatus} · {c.sethApprovalNote}</span><Button variant="outline" size="sm" className="ml-auto" disabled={busy || Boolean(c.contactedDate || c.outreachSentAt)} onClick={() => void undo()}>Undo</Button></div>;
}
