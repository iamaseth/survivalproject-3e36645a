import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listCampaigns,
  listQueueItems,
  prepareQueue,
  setQueueItemStatus,
  suppressIneligibleQueueItems,
  upsertCampaign,
  type CampaignRow,
  type QueueItemRow,
} from "@/lib/outreach.functions";
import { listEmailTemplates } from "@/lib/templates.functions";
import type { EmailTemplate } from "@/lib/templates";
import {
  classifyUntriagedCreatorReplies,
  listReplyTriage,
  markReplyTriageReviewed,
  type ReplyTriageRow,
} from "@/lib/reply-triage.functions";

// Review-only UI. There is intentionally no send action in this component.
export function OutreachReviewPanel() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [queue, setQueue] = useState<QueueItemRow[]>([]);
  const [triage, setTriage] = useState<ReplyTriageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [campaignName, setCampaignName] = useState("Survival Tabs Creator Outreach");
  const [templateId, setTemplateId] = useState("");
  const [dailyCap, setDailyCap] = useState(25);
  const [prepareLimit, setPrepareLimit] = useState(25);

  const refreshCampaigns = async (preferredId?: string) => {
    const result = await listCampaigns();
    setCampaigns(result.rows);
    const nextId = preferredId || campaignId || result.rows[0]?.id || "";
    if (nextId) setCampaignId(nextId);
  };

  const refreshTemplates = async () => {
    const result = await listEmailTemplates({ data: { activeOnly: false } });
    setTemplates(result.templates);
    const approved = result.templates.find((t) => t.active && t.approvedBy);
    if (!templateId && approved) setTemplateId(approved.id);
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

  useEffect(() => {
    void refreshCampaigns();
    void refreshTemplates();
    void refreshTriage();
  }, []);
  useEffect(() => { void refreshQueue(campaignId); }, [campaignId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const createCampaign = () => run(async () => {
    if (!campaignName.trim()) throw new Error("Campaign name is required.");
    if (!templateId) throw new Error("Choose a template first.");
    const selected = templates.find((t) => t.id === templateId);
    if (!selected?.active || !selected.approvedBy) {
      throw new Error("Choose an approved active template before staging outreach.");
    }
    const result = await upsertCampaign({ data: {
      name: campaignName.trim(),
      goal: "Controlled creator outreach with human approval before any send.",
      product_context: "Survival Tabs emergency nutrition tablets",
      forbidden_promises: "Do not promise pricing, commission, inventory, shipping timing, or samples without human approval.",
      brand_tone: "Calm, useful, education-first, no fear-based language.",
      default_template_id: templateId,
      daily_send_cap: Math.max(1, Math.min(dailyCap, 100)),
      status: "draft",
    } });
    await refreshCampaigns(result.row.id);
    setMessage(`Campaign created: ${result.row.name}. Sending remains locked.`);
  });

  const stageCreators = () => run(async () => {
    if (!campaignId) throw new Error("Select or create a campaign first.");
    const selectedCampaign = campaigns.find((c) => c.id === campaignId);
    if (!selectedCampaign?.default_template_id) throw new Error("This campaign does not have a default template.");
    const result = await prepareQueue({ data: {
      campaignId,
      sequenceStep: 1,
      limit: Math.max(1, Math.min(prepareLimit, 100)),
    } });
    await refreshQueue(campaignId);
    setMessage(`Staged ${result.inserted} creator(s). ${result.duplicates} duplicate(s) ignored; ${result.skipped.length} ineligible creator(s) skipped.`);
  });

  const changeStatus = (item: QueueItemRow, status: "approved" | "skipped" | "cancelled" | "pending") =>
    run(async () => {
      await setQueueItemStatus({ data: { id: item.id, status, reason: status === "cancelled" ? "Cancelled during human review" : undefined } });
      await refreshQueue();
    });

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const approvedCount = queue.filter((item) => item.status === "approved").length;
  const pendingCount = queue.filter((item) => item.status === "pending").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Preparation</CardTitle>
          <CardDescription>Create a locked campaign and stage eligible existing creators. This does not send email or alter creator records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1.5fr_120px_auto]">
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Campaign name"
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">Choose approved template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.active || !t.approvedBy}>
                  {t.name}{t.imageUrl ? " — photo" : ""}{!t.active || !t.approvedBy ? " — not approved" : ""}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value) || 1)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
              aria-label="Daily send cap"
              title="Daily send cap"
            />
            <Button disabled={busy || !templateId} onClick={createCampaign}>Create locked campaign</Button>
          </div>
          <p className="text-xs text-muted-foreground">Only approved templates can be used. Template photos are carried into the staged message snapshot when present.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Queue Review</CardTitle>
          <CardDescription>Human approval workspace. Sending remains disabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <select className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Select campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sending_locked ? " — locked" : ""}</option>)}
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={prepareLimit}
              onChange={(e) => setPrepareLimit(Number(e.target.value) || 1)}
              className="h-9 w-24 rounded-md border bg-background px-3 text-sm"
              aria-label="Creators to stage"
              title="Creators to stage"
            />
            <Button disabled={busy || !campaignId} onClick={stageCreators}>Stage eligible creators</Button>
            <Button variant="outline" disabled={busy || !campaignId} onClick={() => run(async () => { await suppressIneligibleQueueItems({ data: { campaignId } }); await refreshQueue(); })}>Suppress replied / DNC</Button>
            <Button variant="outline" disabled={busy} onClick={() => void refreshQueue()}>Refresh</Button>
          </div>
          {selectedCampaign && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{selectedCampaign.sending_locked ? "Sending locked" : "Sending unlocked"}</Badge>
              <Badge variant="outline">Pending {pendingCount}</Badge>
              <Badge variant="outline">Approved {approvedCount}</Badge>
              <Badge variant="outline">Daily cap {selectedCampaign.daily_send_cap}</Badge>
            </div>
          )}
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
