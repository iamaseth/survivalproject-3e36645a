import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listCampaigns,
  listQueueItems,
  setQueueItemStatus,
  suppressIneligibleQueueItems,
  type CampaignRow,
  type QueueItemRow,
} from "@/lib/outreach.functions";
import {
  classifyUntriagedCreatorReplies,
  listReplyTriage,
  markReplyTriageReviewed,
  type ReplyTriageRow,
} from "@/lib/reply-triage.functions";

// Review-only UI. There is intentionally no send action in this component.
export function OutreachReviewPanel() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [queue, setQueue] = useState<QueueItemRow[]>([]);
  const [triage, setTriage] = useState<ReplyTriageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshCampaigns = async () => {
    const result = await listCampaigns();
    setCampaigns(result.rows);
    if (!campaignId && result.rows[0]) setCampaignId(result.rows[0].id);
  };

  const refreshQueue = async (id = campaignId) => {
    if (!id) return setQueue([]);
    const result = await listQueueItems({ data: { campaignId: id } });
    setQueue(result.items);
  };

  const refreshTriage = async () => {
    const result = await listReplyTriage({ data: { onlyNeedsReview: true, limit: 100 } });
    setTriage(result.rows);
  };

  useEffect(() => { void refreshCampaigns(); void refreshTriage(); }, []);
  useEffect(() => { void refreshQueue(campaignId); }, [campaignId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const changeStatus = (item: QueueItemRow, status: "approved" | "skipped" | "cancelled" | "pending") =>
    run(async () => {
      await setQueueItemStatus({ data: { id: item.id, status, reason: status === "cancelled" ? "Cancelled during human review" : undefined } });
      await refreshQueue();
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Outreach Queue Review</CardTitle>
          <CardDescription>Human approval workspace. Sending remains disabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Select campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sending_locked ? " — locked" : ""}</option>)}
            </select>
            <Button variant="outline" disabled={busy || !campaignId} onClick={() => run(async () => { await suppressIneligibleQueueItems({ data: { campaignId } }); await refreshQueue(); })}>Suppress replied / DNC</Button>
            <Button variant="outline" disabled={busy} onClick={() => void refreshQueue()}>Refresh</Button>
          </div>
          <div className="space-y-2">
            {queue.length === 0 && <p className="text-sm text-muted-foreground">No staged queue items for this campaign.</p>}
            {queue.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{item.creator_name || item.creator_id}</strong>
                  <Badge variant="outline">step {item.sequence_step}</Badge>
                  <Badge>{item.status}</Badge>
                  <span className="text-xs text-muted-foreground">{item.recipient_email || "no email"}</span>
                </div>
                <div className="text-sm font-medium">{item.subject_snapshot || "No subject snapshot"}</div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground line-clamp-3">{item.body_snapshot || "No body snapshot"}</p>
                {item.status !== "sent" && item.status !== "cancelled" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => changeStatus(item, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(item, "pending")}>Pending</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(item, "skipped")}>Skip</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => changeStatus(item, "cancelled")}>Cancel</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reply Triage</CardTitle>
          <CardDescription>Deterministic classification with human review for risky or ambiguous replies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => run(async () => { const r = await classifyUntriagedCreatorReplies({ data: { limit: 50 } }); setMessage(`Classified ${r.inserted} new replies.`); await refreshTriage(); })}>Classify new replies</Button>
            <Button variant="outline" disabled={busy} onClick={() => void refreshTriage()}>Refresh</Button>
          </div>
          {triage.length === 0 && <p className="text-sm text-muted-foreground">No replies currently require human review.</p>}
          <div className="space-y-2">
            {triage.map((row) => (
              <div key={row.gmail_message_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{row.category}</Badge>
                  <Badge variant="outline">{Math.round(row.confidence * 100)}% confidence</Badge>
                  {Array.isArray(row.risk_flags) && row.risk_flags.map((flag) => <Badge key={String(flag)} variant="destructive">{String(flag)}</Badge>)}
                </div>
                <p className="text-sm">{row.next_action || "Human review required."}</p>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await markReplyTriageReviewed({ data: { gmailMessageId: row.gmail_message_id } }); await refreshTriage(); })}>Mark reviewed</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
