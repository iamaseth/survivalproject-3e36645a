import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import {
  setYouTubeCandidateClassificationsBatch,
  type CandidateClassification,
} from "@/lib/youtube-candidate-classification.functions";

export const Route = createFileRoute("/classification-import")({
  head: () => ({
    meta: [
      { title: "Classification Import — Survival Tabs" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassificationImportPage,
});

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeClassification(raw: string): CandidateClassification | null {
  const value = (raw || "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (["creator", "influencer", "independent_creator"].includes(value)) return "creator";
  if (["brand", "company", "brand_company", "business"].includes(value)) return "brand_company";
  if (["competitor", "direct_competitor"].includes(value)) return "competitor";
  if (["organization", "government", "agency", "nonprofit", "ngo"].includes(value)) return "organization";
  if (["needs_review", "review", "unclear", "unknown"].includes(value)) return "needs_review";
  return null;
}

function classificationRowsFromCsv(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV has no rows.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const idCol = headers.indexOf("candidate id");
  const classCol = headers.indexOf("classification");
  if (idCol < 0) throw new Error("CSV must include Candidate ID.");
  if (classCol < 0) throw new Error("CSV must include Classification.");

  return rows.slice(1)
    .map((values) => ({
      id: values[idCol]?.trim() || "",
      classification: normalizeClassification(values[classCol] || ""),
    }))
    .filter((row): row is { id: string; classification: CandidateClassification } => Boolean(row.id && row.classification));
}

function ClassificationImportPage() {
  const applyBatch = useServerFn(setYouTubeCandidateClassificationsBatch);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState(0);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProcessed(0);
    setMissing(0);
    try {
      const rows = classificationRowsFromCsv(await file.text());
      if (!rows.length) throw new Error("No valid classifications found in the CSV.");
      setTotal(rows.length);

      let done = 0;
      let missingCount = 0;
      const batchSize = 100;
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const result = await applyBatch({ data: { rows: batch } }) as { classified: number; missing: number };
        done += result.classified ?? 0;
        missingCount += result.missing ?? 0;
        setProcessed(done);
        setMissing(missingCount);
      }

      toast.success(`Classification import complete: ${done} classified${missingCount ? `, ${missingCount} unmatched` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Classification import failed");
    } finally {
      setBusy(false);
    }
  };

  const percent = total ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creator Research"
        title="Classification Import"
        description="Fast, resumable classification-only import. Existing creator data, emails and research links are preserved."
      />

      <div className="max-w-2xl rounded-xl border border-border bg-card p-5">
        <div className="mb-4 text-sm text-muted-foreground">
          Upload the classified research CSV. This only updates Creator / Brand / Competitor / Organization / Needs review classification. It does not Keep, Skip, delete, enrich, or send anything.
        </div>

        <label className={`inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <Upload className="h-4 w-4" /> {busy ? `Importing ${processed} / ${total}` : "Upload classified CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void upload(file);
            }}
          />
        </label>

        {total > 0 ? (
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{busy ? "Importing" : "Last import"}</span>
              <span>{processed} / {total} ({percent}%)</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            {missing ? <div className="text-xs text-muted-foreground">Unmatched Candidate IDs: {missing}</div> : null}
            {busy ? <div className="text-xs text-muted-foreground">Do not refresh while the progress number is increasing.</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
