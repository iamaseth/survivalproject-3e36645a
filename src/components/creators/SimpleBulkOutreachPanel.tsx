import { useEffect, useMemo, useState } from "react";
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
import { listOutreachCandidates, type OutreachCandidate } from "@/lib/outreach-selection.functions";
import { listEmailTemplates } from "@/lib/templates.functions";
import type { EmailTemplate } from "@/lib/templates";
import {
  classifyUntriagedCreatorReplies,
  listReplyTriage,
  markReplyTriageReviewed,
  type ReplyTriageRow,
} from "@/lib/reply-triage.functions";

export function SimpleBulkOutreachPanel() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [queue, setQueue] = useState<QueueItemRow[]>([]);
  const [candidates, setCandidates] = useState<OutreachCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [triage, setTriage] = useState<ReplyTriageRow[]>([]);
  const [campaignName, setCampaignName] = useState("Survival Tabs Creator Outreach");
  const [templateId, setTemplateId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await fn(); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const refreshCampaigns = async (preferred?: string) => {
    const r = await listCampaigns();
    setCampaigns(r.rows);
    const next = preferred || campaignId || r.rows[0]?.id || "";
    if (next) setCampaignId(next);
  };
  const refreshTemplates = async () => {
    const r = await listEmailTemplates({ data: { activeOnly: false } });
    setTemplates(r.templates);
    const approved = r.templates.find((t) => t.active && t.approvedBy);
    if (!templateId && approved) setTemplateId(approved.id);
  };
  const refreshQueue = async (id = campaignId) => {
    if (!id) return setQueue([]);
    const r = await listQueueItems({ data: { campaignId: id } });
    setQueue(r.items);
  };
  const refreshCandidates = async (q = search) => {
    const r = await listOutreachCandidates({ data: { search: q, limit: 300 } });
    setCandidates(r.rows);
    setSelectedIds((ids) => ids.filter((id) => r.rows.some((row) => row.id === id && row.eligible)));
  };
  const refreshTriage = async () => {
    const r = await listReplyTriage({ data: { onlyNeedsReview: true, limit: 100 } });
    setTriage(r.rows);
  };

  useEffect(() => {
    void refreshCampaigns();
    void refreshTemplates();
    void refreshCandidates("");
    void refreshTriage();
  }, []);
  useEffect(() => { void refreshQueue(campaignId); }, [campaignId]);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const selectedTemplate = templates.find((t) => t.id === selectedCampaign?.default_template_id);
  const selectedCreators = useMemo(() => candidates.filter((c) => selectedIds.includes(c.id)), [candidates, selectedIds]);
  const readyCount = queue.filter((q) => q.status === "approved").length;
  const preparedCount = queue.filter((q) => q.status !== "cancelled" && q.status !== "sent").length;

  const createCampaign = () => run(async () => {
    const t = templates.find((x) => x.id === templateId);
    if (!t?.active || !t.approvedBy) throw new Error("Choose an approved email template.");
    const r = await upsertCampaign({ data: {
      name: campaignName.trim() || "Survival Tabs Creator Outreach",
      goal: "Controlled creator outreach with human approval before any send.",
      product_context: "Survival Tabs emergency nutrition tablets",
      forbidden_promises: "Do not promise pricing, commission, inventory, shipping timing, or samples without human approval.",
      brand_tone: "Calm, useful, education-first, no fear-based language.",
      default_template_id: templateId,
      daily_send_cap: 25,
      status: "draft",
    } });
    await refreshCampaigns(r.row.id);
    setMessage(`Campaign ready: ${r.row.name}`);
  });

  const stageSelected = () => run(async () => {
    if (!campaignId) throw new Error("Choose a campaign first.");
    if (!selectedIds.length) throw new Error("Choose at least one creator.");
    const r = await prepareQueue({ data: {
      campaignId,
      sequenceStep: 1,
      creatorIds: selectedIds,
      limit: Math.min(selectedIds.length, 500),
    } });
    await refreshQueue(campaignId);
    setSelectedIds([]);
    setMessage(`${r.inserted} email${r.inserted === 1 ? "" : "s"} prepared for review.`);
  });

  const setReady = (item: QueueItemRow) => run(async () => {
    await setQueueItemStatus({ data: { id: item.id, status: "approved" } });
    await refreshQueue();
  });
  const remove = (item: QueueItemRow) => run(async () => {
    await setQueueItemStatus({ data: { id: item.id, status: "cancelled", reason: "Removed during team review" } });
    await refreshQueue();
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose Campaign & Email</CardTitle>
          <CardDescription>Pick the email you want to use. Nothing sends from this page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1.4fr_1.6fr_auto]">
          <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" placeholder="Campaign name" />
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Choose email template</option>
            {templates.filter((t) => t.active && t.approvedBy).map((t) => <option key={t.id} value={t.id}>{t.name}{t.imageUrl ? " — includes photo" : ""}</option>)}
          </select>
          <Button disabled={busy || !templateId} onClick={createCampaign}>Use this campaign</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Choose Creators</CardTitle>
          <CardDescription>Select the creators who should receive this email later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 min-w-[260px] rounded-md border bg-background px-3 text-sm">
              <option value="">Choose campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void refreshCandidates(); }} placeholder="Search creators" className="h-9 min-w-[240px] rounded-md border bg-background px-3 text-sm" />
            <Button variant="outline" onClick={() => void refreshCandidates()} disabled={busy}>Search</Button>
          </div>

          {selectedCampaign && (
            <div className="rounded-md border bg-secondary/20 px-3 py-2 text-sm">
              <strong>{selectedCampaign.name}</strong>
              <span className="text-muted-foreground"> · {selectedTemplate?.name || "No template"}{selectedTemplate?.imageUrl ? " · photo included" : ""}</span>
            </div>
          )}

          <div className="max-h-[360px] overflow-auto rounded-lg border">
            {candidates.map((creator) => (
              <label key={creator.id} className={`flex items-center gap-3 border-b px-3 py-2 last:border-b-0 ${creator.eligible ? "cursor-pointer hover:bg-secondary/30" : "opacity-50"}`}>
                <input type="checkbox" disabled={!creator.eligible} checked={selectedIds.includes(creator.id)} onChange={() => creator.eligible && setSelectedIds((ids) => ids.includes(creator.id) ? ids.filter((id) => id !== creator.id) : [...ids, creator.id])} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{creator.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{creator.email || creator.reason || "No email"}</div>
                </div>
                {!creator.eligible && <span className="text-xs text-muted-foreground">{creator.reason}</span>}
              </label>
            ))}
          </div>

          {selectedCreators.length > 0 && <div className="text-sm">{selectedCreators.length} creator{selectedCreators.length === 1 ? "" : "s"} selected</div>}
          <Button disabled={busy || !campaignId || !selectedIds.length} onClick={stageSelected}>
            {selectedIds.length ? `Prepare ${selectedIds.length} email${selectedIds.length === 1 ? "" : "s"}` : "Select creators first"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Emails Ready to Send</CardTitle>
          <CardDescription>{preparedCount} prepared · {readyCount} ready. Review the email and mark it ready. Actual sending is still disabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue.filter((q) => q.status !== "cancelled" && q.status !== "sent").length === 0 && (
            <p className="text-sm text-muted-foreground">No emails prepared yet.</p>
          )}
          {queue.filter((q) => q.status !== "cancelled" && q.status !== "sent").map((item) => {
            const ready = item.status === "approved";
            const open = previewId === item.id;
            return (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{item.creator_name || item.creator_id}</div>
                    <div className="text-sm text-muted-foreground">{item.recipient_email || "No email"}</div>
                  </div>
                  {ready && <Badge>Ready ✓</Badge>}
                </div>
                <div className="mt-3 text-sm"><span className="font-medium">Subject:</span> {item.subject_snapshot || "No subject"}</div>
                {open && <div className="mt-3 whitespace-pre-wrap rounded-md bg-secondary/20 p-3 text-sm text-muted-foreground">{item.body_snapshot || "No message"}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewId(open ? null : item.id)}>{open ? "Hide Email" : "Preview Email"}</Button>
                  {ready ? (
                    <Button size="sm" disabled>Ready ✓</Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => setReady(item)}>Mark Ready</Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(item)}>Remove</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replies Needing Attention</CardTitle>
          <CardDescription>
            Store first, classify second. Price, sample, shipping and inventory replies always need a person.
            Nothing here sends or promises anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => run(async () => { await classifyUntriagedCreatorReplies({ data: { limit: 50 } }); await refreshTriage(); })}>Check new replies</Button>
            <Button variant="outline" disabled={busy} onClick={() => run(async () => {
              const r = await suppressIneligibleQueueItems({ data: campaignId ? { campaignId } : {} });
              await refreshQueue();
              setMessage(`${r.cancelled} planned follow-up${r.cancelled === 1 ? "" : "s"} cancelled for replied / do-not-contact creators.`);
            })}>Stop follow-ups for replied / do-not-contact</Button>
          </div>
          {triage.length === 0 && <p className="text-sm text-muted-foreground">No replies need attention.</p>}
          {triage.map((row) => (
            <div key={row.gmail_message_id} className={`rounded-lg border p-3 ${row.category === "rejected" ? "border-destructive/60 bg-destructive/5" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-sm">{row.creator_name || row.from_email || row.creator_id || "Unknown creator"}</div>
                <div className="text-xs text-muted-foreground">{row.sent_at ? new Date(row.sent_at).toLocaleString() : new Date(row.created_at).toLocaleString()}</div>
              </div>
              {row.snippet && <div className="mt-1 line-clamp-3 text-sm text-muted-foreground">“{row.snippet}”</div>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant={row.category === "rejected" ? "destructive" : "secondary"}>{row.category}</Badge>
                <span className="text-xs text-muted-foreground">{Math.round(row.confidence * 100)}% confidence</span>
                {row.risk_flags.map((flag) => <Badge key={flag} variant="destructive">{flag.replace(/_/g, " ")}</Badge>)}
                <Badge variant="outline">{row.reviewed_at ? "Reviewed" : row.requires_human_review ? "Needs a person" : "No action needed"}</Badge>
              </div>
              <div className="mt-2 text-sm">{row.next_action || "Please review this reply."}</div>
              {row.category === "rejected" && (
                <div className="mt-1 text-xs font-medium text-destructive">Declined / unsubscribe — stop all follow-ups for this creator.</div>
              )}
              <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await markReplyTriageReviewed({ data: { gmailMessageId: row.gmail_message_id } }); await refreshTriage(); })}>Mark Reviewed</Button>
            </div>
          ))}
        </CardContent>
      </Card>


      {message && <div className="rounded-md border bg-secondary/20 px-3 py-2 text-sm">{message}</div>}
    </div>
  );
}
