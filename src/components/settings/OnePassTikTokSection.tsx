import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { importOnePassTikTok, type OnePassTikTokRow } from "@/lib/tiktok-one-pass.functions";

export function OnePassTikTokSection() {
  const run = useServerFn(importOnePassTikTok);
  const [rows, setRows] = useState<OnePassTikTokRow[]>([]);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof run>> | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof run>> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (file: File | undefined) => {
    setRows([]); setPreview(null); setResult(null);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseOnePassCsv(text);
      if (!parsed.length || parsed.length > 1000) throw new Error("CSV must contain 1–1000 rows");
      setRows(parsed);
      toast.success(`${parsed.length} TikTok rows loaded. Preview first.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read CSV"); }
  };
  const execute = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const response = await run({ data: { rows, dryRun } });
      if (dryRun) { setPreview(response); setResult(null); }
      else { setResult(response); setPreview(null); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import failed"); }
    finally { setBusy(false); }
  };
  return <section className="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 className="font-display text-lg">TikTok one-pass creator import</h2>
    <p className="text-xs text-muted-foreground">One CSV creates missing TikTok creators and adds source-backed evidence to uniquely matched creators. Existing fields and outreach history are preserved. Duplicate CRM identities require manual review. Preview before applying.</p>
    <input type="file" accept=".csv,text/csv" onChange={event => void load(event.target.files?.[0])} className="block w-full text-xs" />
    <div className="flex gap-2">
      <button className="rounded-md border px-3 py-2 text-xs disabled:opacity-50" disabled={busy || !rows.length} onClick={() => void execute(true)}>Preview {rows.length} rows</button>
      <button className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs disabled:opacity-50" disabled={busy || !preview || preview.total !== rows.length} onClick={() => void execute(false)}>Apply one-pass import</button>
    </div>
    {[preview, result].filter(Boolean).map((item, index) => <div key={index} className="rounded-md border p-3 text-xs space-y-1">
      <strong>{item!.dryRun ? "Preview (no changes)" : "Import result"}</strong>
      <p>{item!.created} {item!.dryRun ? "would create" : "created"} · {item!.enriched} {item!.dryRun ? "would enrich" : "enriched"} · {item!.unchanged} unchanged · {item!.duplicates} duplicate identities · {item!.invalid} invalid · {item!.repeated} repeated · {item!.conflicts} existing-field differences preserved</p>
      {!!item!.review.length && <details><summary>Review {item!.review.length} flagged rows</summary><div className="max-h-40 overflow-auto">{item!.review.map((entry, i) => <p key={i}>{entry.tiktok}: {entry.reason}</p>)}</div></details>}
    </div>)}
  </section>;
}

export function parseOnePassCsv(text: string): OnePassTikTokRow[] {
  const matrix: string[][] = [];
  let cells: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { cells.push(cell); cell = ""; }
    else if ((ch === "\r" || ch === "\n") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell); if (cells.some(value => value.trim())) matrix.push(cells);
      cells = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  cells.push(cell); if (cells.some(value => value.trim())) matrix.push(cells);
  const [headers, ...lines] = matrix;
  if (!headers) return [];
  const names = headers.map(value => value.replace(/^\uFEFF/, "").trim().toLowerCase());
  const pick = (line: string[], ...aliases: string[]) => {
    const index = aliases.map(alias => names.indexOf(alias)).find(i => i >= 0);
    return index === undefined ? "" : (line[index] ?? "").trim();
  };
  if (!["tiktok", "profile url", "profile_url"].some(name => names.includes(name)))
    throw new Error("TikTok or Profile URL column required");
  return lines.map(line => ({
    tiktok: pick(line, "tiktok", "profile url", "profile_url"),
    name: pick(line, "creator name", "name", "handle"),
    source_url: pick(line, "source url", "source_url"),
    search_term: pick(line, "search term", "search_term"),
    evidence: pick(line, "evidence", "post evidence", "post text"),
    reach_signal: pick(line, "reach signal", "reach_signal"),
    monetization: pick(line, "monetization", "commercial signal"),
    segment: pick(line, "niche", "segment"),
  }));
}
