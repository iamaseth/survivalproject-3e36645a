import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, CheckCircle2, ShieldCheck, Loader2, X, FileText, AlertCircle,
  ImagePlus, Upload,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/current-user";
import {
  listEmailTemplates,
  upsertEmailTemplate,
  approveEmailTemplate,
  seedStarterEmailTemplates,
} from "@/lib/templates.functions";
import {
  applyMergeFields,
  MERGE_FIELD_HINTS,
  SAMPLE_MERGE_CONTEXT,
  templateStatus,
  type EmailTemplate,
} from "@/lib/templates";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
});

type TemplateSaveInput = {
  id?: string;
  name: string;
  segment: string | null;
  subject: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

function TemplatesPage() {
  const auth = useAuth();
  const canApprove =
    auth.status === "authenticated" &&
    (auth.profile.role === "executive" || auth.profile.role === "partnership_manager");

  const list = useServerFn(listEmailTemplates);
  const upsert = useServerFn(upsertEmailTemplate);
  const approve = useServerFn(approveEmailTemplate);
  const seed = useServerFn(seedStarterEmailTemplates);

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => list({ data: {} }),
  });
  const templates: EmailTemplate[] = q.data?.templates ?? [];
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);

  const upsertM = useMutation({
    mutationFn: (input: TemplateSaveInput) => upsert({ data: input }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setEditing(null);
    },
    onError: (e) => toast.error("Save failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const approveM = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: () => {
      toast.success("Template approved — now available for sends");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (e) => toast.error("Approve failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const seedM = useMutation({
    mutationFn: () => seed({}),
    onSuccess: (r) => {
      const created = r.created?.length ?? 0;
      const skipped = r.skipped?.length ?? 0;
      if (created === 0) {
        toast.info("Starter templates already exist", { description: `${skipped} unchanged.` });
      } else {
        toast.success(`Restored ${created} starter template${created === 1 ? "" : "s"}`, {
          description: `${skipped} already existed. Review and approve restored drafts before use.`,
        });
      }
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (e) => toast.error("Starter restore failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Outreach"
        title="Email templates"
        description="Reusable, human-approved outreach messages. Add an optional product photo; images are stored in Supabase Storage and included when the template is used."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => seedM.mutate()}
              disabled={seedM.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
              title="Restore only missing starter templates. Uses fixed text and no Lovable AI credits."
            >
              {seedM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Restore starter templates
            </button>
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> New template
            </button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {q.isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="grid place-items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6 text-muted-foreground/60" />
            <div>No templates yet. Create one to save a reusable outreach message the team can share.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Photo</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((t) => {
                const status = templateStatus(t);
                return (
                  <tr key={t.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.imageAlt || "Template image"} className="h-10 w-14 rounded border border-border object-cover" />
                      ) : (
                        <div className="grid h-10 w-14 place-items-center rounded border border-dashed border-border text-muted-foreground"><ImagePlus className="h-4 w-4" /></div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{t.name}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.subject || <em className="italic">(no subject)</em>}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.segment || "General"}</td>
                    <td className="px-4 py-3"><StatusPill status={status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(t)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        {canApprove && status !== "approved" ? (
                          <button
                            onClick={() => approveM.mutate(t.id)}
                            disabled={approveM.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <ShieldCheck className="h-3 w-3" /> Approve
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <TemplateEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(v) => upsertM.mutate(v)}
          saving={upsertM.isPending}
          existingSegments={Array.from(new Set(templates.map((t) => t.segment).filter(Boolean) as string[]))}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "approved" | "needs_reapproval" }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  }
  if (status === "needs_reapproval") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
        <AlertCircle className="h-3 w-3" /> Needs re-approval
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Draft
    </span>
  );
}

function TemplateEditor({
  initial, onClose, onSave, saving, existingSegments,
}: {
  initial: EmailTemplate | null;
  onClose: () => void;
  onSave: (v: TemplateSaveInput) => void;
  saving: boolean;
  existingSegments: string[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [segment, setSegment] = useState(initial?.segment ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(initial?.imageAlt ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);

  const status = initial ? templateStatus(initial) : "draft";
  const willUnapprove = initial && initial.active && (
    name !== initial.name ||
    (segment || null) !== initial.segment ||
    subject !== initial.subject ||
    body !== initial.body ||
    (imageUrl || null) !== initial.imageUrl ||
    (imageAlt || null) !== initial.imageAlt
  );

  const previewSubject = useMemo(() => applyMergeFields(subject, SAMPLE_MERGE_CONTEXT), [subject]);
  const previewBody = useMemo(() => applyMergeFields(body, SAMPLE_MERGE_CONTEXT), [body]);
  const canSave = name.trim().length > 0 && subject.trim().length > 0 && body.trim().length > 0;

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large", { description: "Maximum size is 5 MB." });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `templates/${crypto.randomUUID()}.${ext || "jpg"}`;
      const { error } = await supabase.storage.from("template-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("template-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      if (!imageAlt.trim()) setImageAlt("Survival Tabs product image");
      toast.success("Photo uploaded", { description: "Save the template to attach it." });
    } catch (e) {
      toast.error("Photo upload failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--gold)]">
              {initial ? "Edit template" : "New template"}
            </div>
            <h2 className="font-display text-xl">{initial?.name || "Untitled template"}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-auto md:grid-cols-[1fr_1fr]">
          <div className="space-y-4 border-r border-border p-6">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Outdoor — Warm intro (v1)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Segment" hint="Optional. Leave blank for General.">
              <input value={segment} onChange={(e) => setSegment(e.target.value)} list="template-segments" placeholder="General" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <datalist id="template-segments"><option value="General" />{existingSegments.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick idea for {{creator_name}} × Survival Tabs" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Body">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder={"Hi {{creator_name}},\n\nI came across your work on {{platform}} ({{handle}})…\n\n— {{sender_first_name}}"} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed" />
            </Field>

            <Field label="Template photo" hint="Optional. PNG, JPG, WebP or GIF, maximum 5 MB. Replacing/removing a photo never deletes the stored source file.">
              <div className="space-y-2">
                {imageUrl ? <img src={imageUrl} alt={imageAlt || "Template image"} className="max-h-44 w-full rounded-md border border-border object-contain bg-secondary/20" /> : null}
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs hover:bg-secondary">
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {imageUrl ? "Replace photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {imageUrl ? (
                    <button type="button" onClick={() => setImageUrl("")} className="rounded-md border border-input px-3 py-2 text-xs hover:bg-secondary">
                      Remove from template
                    </button>
                  ) : null}
                </div>
                <input value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Alt text: Survival Tabs product image" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </Field>

            <div className="rounded-md border border-dashed border-border bg-secondary/30 p-3 text-xs">
              <div className="mb-1 font-medium text-foreground">Merge fields</div>
              <ul className="space-y-1 text-muted-foreground">
                {MERGE_FIELD_HINTS.map((f) => <li key={f.key}><code className="rounded bg-background px-1.5 py-0.5 text-[11px]">{`{{${f.key}}}`}</code> — {f.label}</li>)}
              </ul>
            </div>
          </div>

          <div className="space-y-4 p-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Email preview</div>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="text-[11px] text-muted-foreground">Subject</div>
              <div className="mb-3 text-sm font-medium">{previewSubject || <em className="italic text-muted-foreground">(no subject)</em>}</div>
              <div className="text-[11px] text-muted-foreground">Body</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{previewBody || <em className="italic text-muted-foreground">(no body)</em>}</div>
              {imageUrl ? (
                <div className="mt-4 border-t border-border pt-4">
                  <img src={imageUrl} alt={imageAlt || "Template image"} className="max-h-56 max-w-full rounded object-contain" />
                  <div className="mt-1 text-[10px] text-muted-foreground">{imageAlt || "No alt text"}</div>
                </div>
              ) : null}
              <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Sample: {SAMPLE_MERGE_CONTEXT.creator_name} · {SAMPLE_MERGE_CONTEXT.platform} · {SAMPLE_MERGE_CONTEXT.handle}
              </div>
            </div>

            {willUnapprove ? (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>This approved template changed. Saving it will require re-approval before it can be used for sends.</div>
              </div>
            ) : null}
            {initial ? <div className="text-[11px] text-muted-foreground">Current status: <StatusPill status={status} /></div> : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">Cancel</button>
          <button
            onClick={() => onSave({
              id: initial?.id,
              name: name.trim(),
              segment: segment.trim() || null,
              subject,
              body,
              imageUrl: imageUrl.trim() || null,
              imageAlt: imageUrl.trim() ? (imageAlt.trim() || "Survival Tabs product image") : null,
            })}
            disabled={!canSave || saving || uploadingImage}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {initial ? "Save changes" : "Create template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </label>
  );
}
