import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { importCreators, type CreatorImportRow } from "@/lib/creators.functions";
import { importInfluencersClubReport, type InfluencersClubImportRow } from "@/lib/influencers-club.functions";
import { normalizeDomain } from "@/lib/prospects-parse";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCreatorsPaste(text: string): { rows: CreatorImportRow[]; skippedNoKey: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skippedNoKey: 0 };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const split = (l: string) => delim === "\t" ? l.split("\t") : parseCsvLine(l);
  const header = split(lines[0]).map((h) => h.trim().toLowerCase());
  const pick = (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const idx = header.indexOf(k);
      if (idx >= 0 && row[idx] !== undefined) return row[idx].trim();
    }
    return "";
  };
  const rows: CreatorImportRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const code = pick(cells, "code", "creator code", "id");
    const website = pick(cells, "website", "url", "domain");
    const email = pick(cells, "email");
    const dom = normalizeDomain(website) || normalizeDomain(email);
    if (!code && !dom) { skipped++; continue; }
    rows.push({
      code: code || null,
      normalized_domain: dom || null,
      name: pick(cells, "name", "creator", "channel") || code || dom,
      segment: pick(cells, "segment", "niche") || null,
      primary_platforms: pick(cells, "platforms", "primary platforms") || null,
      email: email || null,
      facebook: pick(cells, "facebook", "fb") || null,
      instagram: pick(cells, "instagram", "ig") || null,
      tiktok: pick(cells, "tiktok", "tt") || null,
      youtube: pick(cells, "youtube", "yt") || null,
      priority: pick(cells, "priority") || null,
      amazon: pick(cells, "amazon") || null,
      research_notes: pick(cells, "notes", "research notes") || null,
      outreach_owner: pick(cells, "owner", "outreach owner") || null,
    });
  }
  return { rows, skippedNoKey: skipped };
}

function toNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function parseInfluencersClubCsv(text: string): InfluencersClubImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h, i]));
  const pick = (cells: string[], key: string) => {
    const i = index.get(key);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      handle: pick(cells, "handle"),
      status: pick(cells, "status"),
      email: pick(cells, "email") || null,
      email_type: pick(cells, "email_type") || null,
      youtube_avg_views: toNullableNumber(pick(cells, "youtube.avg_views")),
      youtube_engagement_percent: toNullableNumber(pick(cells, "youtube.engagement_percent")),
      youtube_has_paid_partnership: toNullableBoolean(pick(cells, "youtube.has_paid_partnership")),
      youtube_most_recent_post_date: pick(cells, "youtube.most_recent_post_date") || null,
      youtube_promotes_affiliate_links: toNullableBoolean(pick(cells, "youtube.promotes_affiliate_links")),
    };
  }).filter((row) => row.handle && row.status);
}

export function ImportCreatorsSection() {
  const runImport = useServerFn(importCreators);
  const runInfluencersClubImport = useServerFn(importInfluencersClubReport);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: number; skipped: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number; total: number } | null>(null);
  const [icBusy, setIcBusy] = useState(false);
  const [icFileName, setIcFileName] = useState<string | null>(null);
  const [icRows, setIcRows] = useState<InfluencersClubImportRow[]>([]);
  const [icResult, setIcResult] = useState<{
    total: number;
    matched: number;
    updatedEmails: number;
    markedNotFound: number;
    skippedExistingEmail: number;
    unknown: number;
  } | null>(null);

  const doPreview = () => {
    const parsed = parseCreatorsPaste(text);
    setPreview({ rows: parsed.rows.length, skipped: parsed.skippedNoKey });
    setResult(null);
  };

  const doImport = async () => {
    const parsed = parseCreatorsPaste(text);
    if (parsed.rows.length === 0) {
      toast.error("No valid rows detected. Provide a Code or Website column.");
      return;
    }
    setBusy(true);
    try {
      const res = await runImport({ data: { rows: parsed.rows } });
      setResult(res);
      toast.success(`${res.inserted} new creators added, ${res.skipped} skipped (already exist).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const onInfluencersClubFile = async (file: File | null) => {
    setIcResult(null);
    if (!file) {
      setIcFileName(null);
      setIcRows([]);
      return;
    }
    try {
      const csv = await file.text();
      const rows = parseInfluencersClubCsv(csv);
      if (rows.length === 0) {
        toast.error("No Influencers Club rows found. Expected columns include handle, status and email.");
        setIcFileName(null);
        setIcRows([]);
        return;
      }
      setIcFileName(file.name);
      setIcRows(rows);
      toast.success(`${rows.length} enrichment rows ready to review.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read CSV");
    }
  };

  const doInfluencersClubImport = async () => {
    if (icRows.length === 0) return;
    setIcBusy(true);
    try {
      const res = await runInfluencersClubImport({ data: { rows: icRows } });
      setIcResult(res);
      toast.success(`${res.updatedEmails} verified emails imported; ${res.markedNotFound} failed lookups recorded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Influencers Club import failed");
    } finally {
      setIcBusy(false);
    }
  };

  const successRows = icRows.filter((row) => row.status.toLowerCase() === "success" && row.email).length;
  const notFoundRows = icRows.filter((row) => row.status.toLowerCase() === "not_found").length;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2">
          <h2 className="font-display text-lg flex items-center gap-2"><Upload className="h-4 w-4" /> Import creators</h2>
          <p className="text-xs text-muted-foreground">
            Paste CSV/TSV rows (with a header). Dedup key is <strong>Code</strong> first, then normalized website domain — existing creators are never overwritten. Newly added creators live in the team database.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); setResult(null); }}
          placeholder="Recognized columns: Code, Name, Segment, Platforms, Email, Facebook, Instagram, TikTok, YouTube, Priority, Amazon, Owner, Website, Notes"
          className="h-40 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={doPreview} disabled={!text.trim() || busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
            Preview
          </button>
          <button onClick={doImport} disabled={!text.trim() || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Import creators
          </button>
          {preview ? (
            <span className="text-xs text-muted-foreground">
              {preview.rows} row{preview.rows === 1 ? "" : "s"} ready
              {preview.skipped > 0 ? ` · ${preview.skipped} without Code or Website will be skipped` : ""}
            </span>
          ) : null}
        </div>
        {result ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50/50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div>
              <strong>{result.inserted}</strong> new creators added, <strong>{result.skipped}</strong> skipped (already exist).
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3">
          <h2 className="font-display text-lg flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Influencers Club enrichment</h2>
          <p className="text-xs text-muted-foreground">
            Upload the downloaded Influencers Club CSV. Existing YouTube candidates are matched by channel ID. Verified emails are added, failed lookups are marked so they are not purchased again, and an existing different email is never overwritten.
          </p>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void onInfluencersClubFile(event.target.files?.[0] ?? null)}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-medium"
        />
        {icRows.length > 0 ? (
          <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
            <div className="font-medium">{icFileName}</div>
            <div className="mt-1 text-muted-foreground">
              {icRows.length} rows · {successRows} with email · {notFoundRows} not found
            </div>
            <button
              onClick={doInfluencersClubImport}
              disabled={icBusy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {icBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import enrichment results
            </button>
          </div>
        ) : null}
        {icResult ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50/50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div>
              <strong>{icResult.updatedEmails}</strong> verified emails updated · <strong>{icResult.markedNotFound}</strong> failed lookups recorded · <strong>{icResult.skippedExistingEmail}</strong> existing emails preserved · <strong>{icResult.unknown}</strong> rows did not match a YouTube candidate.
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
